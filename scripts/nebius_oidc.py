"""Exchange GitHub's short-lived identity for a Nebius service-account token.

Only explicit authorized + oidc mode calls this helper. No trust/IAM creation,
long-lived key, browser login, token persistence or alternate endpoint support.
Official request schema: nebius/pysdk federated_credentials.py.
Official STS REST endpoint: docs.nebius.com/iam/wif/configure.
This integration still requires a real operator-configured trust validation.
"""
import base64
import json
import re
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

EXCHANGE_URL = "https://sts.nebius.com/oauth2/token/exchange"
ACCESS_TYPE = "urn:ietf:params:oauth:token-type:access_token"
OIDC_ENV = ("ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "GITHUB_REPOSITORY", "GITHUB_REF",
            "RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID", "RACKRATE_NEBIUS_OIDC_AUDIENCE")


class OIDCError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise OIDCError("oidc_redirect_rejected")


def request_json(url, *, headers, data=None):
    # A redirect must never forward identity or tokens to another host. Disable
    # inherited proxy settings so these credentials go only to validated TLS origins.
    try:
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(Request(url, headers=headers, data=data), timeout=30) as response:
            if response.status != 200:
                raise OIDCError("oidc_request_failed")
            body = response.read(131073)
        if len(body) > 131072:
            raise OIDCError("oidc_response_invalid")
        value = json.loads(body)
        if not isinstance(value, dict):
            raise OIDCError("oidc_response_invalid")
        return value
    except Exception:
        # Neither request bodies/headers nor server error text leave this helper.
        raise OIDCError("oidc_request_failed") from None


def exchange_nebius_token(env, *, request=request_json, now=None):
    try:
        if any(not isinstance(env.get(key), str) or not env[key].strip() for key in OIDC_ENV):
            raise OIDCError("oidc_configuration_missing")
        if env["GITHUB_REPOSITORY"] != "flatkey-ai/rackrate" or env["GITHUB_REF"] != "refs/heads/main":
            raise OIDCError("oidc_subject_not_allowed")
        service_account = env["RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID"]
        audience = env["RACKRATE_NEBIUS_OIDC_AUDIENCE"]
        if not re.fullmatch(r"serviceaccount-[A-Za-z0-9_-]{1,128}", service_account) or not 1 <= len(audience) <= 512:
            raise OIDCError("oidc_configuration_invalid")
        url = urlsplit(env["ACTIONS_ID_TOKEN_REQUEST_URL"])
        if (url.scheme != "https" or not url.hostname or not url.hostname.endswith(".actions.githubusercontent.com")
                or url.username or url.password or url.port not in (None, 443) or url.fragment):
            raise OIDCError("oidc_endpoint_rejected")
        query = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key != "audience"]
        query.append(("audience", audience))
        github_url = urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), ""))
        identity = request(github_url, headers={"Authorization": "Bearer " + env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"], "Accept": "application/json"})
        jwt = identity.get("value")
        if not isinstance(jwt, str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", jwt) or len(jwt) > 65536:
            raise OIDCError("oidc_identity_invalid")
        encoded = jwt.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        timestamp = time.time() if now is None else now
        # Nebius verifies signature and trust. These local checks prevent sending
        # a token with an unexpected workflow subject/audience to the exchange.
        if (claims.get("iss") != "https://token.actions.githubusercontent.com"
                or claims.get("sub") != "repo:flatkey-ai/rackrate:ref:refs/heads/main"
                or claims.get("aud") != audience
                or type(claims.get("exp")) not in (int, float) or claims["exp"] <= timestamp + 30
                or type(claims.get("nbf")) not in (int, float) or claims["nbf"] > timestamp + 30):
            raise OIDCError("oidc_identity_invalid")
        data = urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "requested_token_type": ACCESS_TYPE,
            "subject_token": service_account,
            "subject_token_type": "urn:nebius:params:oauth:token-type:subject_identifier",
            "actor_token": jwt,
            "actor_token_type": "urn:ietf:params:oauth:token-type:jwt",
        }).encode("ascii")
        exchanged = request(EXCHANGE_URL, headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}, data=data)
        token = exchanged.get("access_token")
        if (exchanged.get("token_type", "").casefold() != "bearer"
                or exchanged.get("issued_token_type") != ACCESS_TYPE
                or type(exchanged.get("expires_in")) is not int or exchanged["expires_in"] < 60
                or not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9._~+/-]+={0,2}", token) or len(token) > 16384):
            raise OIDCError("oidc_access_token_invalid")
        return token
    except OIDCError:
        raise
    except Exception:
        raise OIDCError("oidc_exchange_failed") from None
