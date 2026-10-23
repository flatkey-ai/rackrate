import base64
import json
import unittest
from urllib.parse import parse_qs, urlsplit
from nebius_oidc import ACCESS_TYPE, EXCHANGE_URL, OIDCError, exchange_nebius_token

NOW = 1800000000


def environment():
    return {"ACTIONS_ID_TOKEN_REQUEST_URL": "https://run.actions.githubusercontent.com/token?api-version=2.0&audience=old",
            "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "synthetic-request-token", "GITHUB_REPOSITORY": "flatkey-ai/rackrate",
            "GITHUB_REF": "refs/heads/main", "RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID": "serviceaccount-synthetic",
            "RACKRATE_NEBIUS_OIDC_AUDIENCE": "https://github.com/flatkey-ai"}


def identity(**changes):
    claims = {"iss": "https://token.actions.githubusercontent.com", "sub": "repo:flatkey-ai/rackrate:ref:refs/heads/main",
              "aud": environment()["RACKRATE_NEBIUS_OIDC_AUDIENCE"], "nbf": NOW - 10, "exp": NOW + 300, **changes}
    encoded = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return "eyJhbGciOiJSUzI1NiJ9." + encoded + ".synthetic-signature"


def access(**changes):
    return {"access_token": "synthetic-access-token", "token_type": "Bearer", "issued_token_type": ACCESS_TYPE, "expires_in": 3600, **changes}


class OIDCTests(unittest.TestCase):
    def test_fixed_exchange_endpoint_form_and_short_lived_token(self):
        calls = []
        def request(url, **kwargs):
            calls.append((url, kwargs))
            return {"value": identity()} if len(calls) == 1 else access()
        self.assertEqual(exchange_nebius_token(environment(), request=request, now=NOW), "synthetic-access-token")
        self.assertEqual(parse_qs(urlsplit(calls[0][0]).query)["audience"], [environment()["RACKRATE_NEBIUS_OIDC_AUDIENCE"]])
        self.assertEqual(calls[1][0], EXCHANGE_URL)
        self.assertEqual(calls[1][1]["headers"]["Content-Type"], "application/x-www-form-urlencoded")
        form = parse_qs(calls[1][1]["data"].decode())
        self.assertEqual(form["subject_token_type"], ["urn:nebius:params:oauth:token-type:subject_identifier"])
        self.assertEqual(form["actor_token"], [identity()])
        self.assertEqual(form["requested_token_type"], [ACCESS_TYPE])

    def test_wrong_host_or_workflow_never_sends_credentials(self):
        for key, value in [("ACTIONS_ID_TOKEN_REQUEST_URL", "https://attacker.example/token"),
                           ("ACTIONS_ID_TOKEN_REQUEST_URL", "https://run.actions.githubusercontent.com@attacker.example/token"),
                           ("ACTIONS_ID_TOKEN_REQUEST_URL", "http://run.actions.githubusercontent.com/token"),
                           ("GITHUB_REF", "refs/heads/feature"), ("GITHUB_REPOSITORY", "other/repo")]:
            env = environment()
            env[key] = value
            with self.assertRaises(OIDCError):
                exchange_nebius_token(env, request=lambda *a, **k: self.fail("no network allowed"), now=NOW)

    def test_bad_claims_never_reach_exchange(self):
        for claims in [{"aud": "wrong"}, {"sub": "repo:other/repo:ref:refs/heads/main"},
                       {"iss": "https://other.example"}, {"exp": NOW}, {"nbf": NOW + 1000}]:
            calls = []
            def request(url, **kwargs):
                calls.append(url)
                return {"value": identity(**claims)}
            with self.assertRaises(OIDCError):
                exchange_nebius_token(environment(), request=request, now=NOW)
            self.assertEqual(len(calls), 1)

    def test_invalid_access_response_is_rejected(self):
        for change in [{"token_type": "MAC"}, {"issued_token_type": "wrong"}, {"expires_in": 0},
                       {"expires_in": True}, {"expires_in": "3600"}, {"access_token": "bad token"}]:
            def request(url, **kwargs):
                return access(**change) if url == EXCHANGE_URL else {"value": identity()}
            with self.assertRaises(OIDCError):
                exchange_nebius_token(environment(), request=request, now=NOW)

    def test_upstream_error_body_is_not_exposed(self):
        def request(*args, **kwargs):
            raise RuntimeError("synthetic-secret-and-response-body")
        with self.assertRaises(OIDCError) as caught:
            exchange_nebius_token(environment(), request=request, now=NOW)
        self.assertEqual(str(caught.exception), "oidc_exchange_failed")


    def test_failure_stage_distinguishes_github_identity_from_nebius_exchange(self):
        for failing_url, stage in [(None, "oidc_github_identity"), (EXCHANGE_URL, "oidc_exchange")]:
            def request(url, **kwargs):
                if failing_url is None or url == failing_url:
                    raise OIDCError("oidc_request_failed")
                return {"value": identity()}
            with self.assertRaises(OIDCError) as caught:
                exchange_nebius_token(environment(), request=request, now=NOW)
            self.assertEqual(caught.exception.stage, stage)
            self.assertEqual(str(caught.exception), "oidc_request_failed")


if __name__ == "__main__":
    unittest.main()
