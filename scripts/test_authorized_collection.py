import copy
from dataclasses import dataclass
import importlib.util
import json
import os
from pathlib import Path
import stat
import unittest

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).with_name("collect-authorized.py"))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
NOW = "2026-10-23T06:00:00Z"


@dataclass
class Settings:
    nebius_source: str = "catalog_api"
    source_policy: str = "configured"
    catalog_scope: str = "complete"
    captured: dict = None

    @classmethod
    def from_env(cls, values, env_file=None):
        assert env_file is None
        return cls(captured=dict(values))


def env_fixture():
    state = {"cookies": [{"name": "session", "value": "synthetic-session-secret"}], "origins": []}
    return {
        "RACKRATE_LAMBDA_STORAGE_STATE_JSON": json.dumps(state),
        "RACKRATE_AUTODL_STORAGE_STATE_JSON": json.dumps({"cookies": [], "origins": [{"origin": "https://www.autodl.com", "localStorage": [{"name": "token", "value": "synthetic-autodl-secret"}]}]}),
        "RACKRATE_UCLOUD_CONSOLE_SESSION_JSON": json.dumps({"format": "ucloud-console-visible-cookie-v1", "origin": "https://console.ucloud.cn", "cookie": "synthetic-ucloud-cookie"}),
        "RACKRATE_NEBIUS_ACCESS_TOKEN": "synthetic-nebius-token",
        "LAMBDA_SOURCE": "public", "UCLOUD_SOURCE": "public", "UCLOUD_PROJECT_ID": "ignored-project",
    }


def result_fixture(provider):
    return {"schema_version": 1, "status": "success", "collected_at": NOW,
            "prices": [{"provider": provider, "raw_sku": "sku", "source_url": "https://example.com/prices",
                        "source_type": "official_internal_api", "amount": "1.25", "currency": "USD", "unit": "gpu_hour",
                        "regions": [], "observed_at": NOW, "project_reference": "internal-project-hash",
                        "account_id": "private-account", "notes": [],
                        "resources": {"cpu": 12, "credentials": "do-not-publish"}}],
            "provider_results": [{"provider": provider, "status": "success", "error": None,
                                  "observed_at": NOW, "returned_count": 1,
                                  "source_url": "https://example.com/prices", "source_type": "official_internal_api"}]}


class BridgeTests(unittest.TestCase):
    def run_bridge(self, collect):
        return bridge.collect_authorized(env_fixture(), Settings=Settings, collect_prices=collect,
                                         report_coverage=lambda result: {"collection_status": result["status"]},
                                         version="0.22.0", expected_version="0.22.0")

    def test_all_inputs_required_before_requests(self):
        for key in bridge.SECRET_INPUTS:
            values = env_fixture()
            values.pop(key)
            with self.assertRaisesRegex(bridge.CollectionFailure, "missing_required_credential"):
                with bridge.authorized_settings(values, Settings):
                    self.fail("must not enter collection")

    def test_private_files_exist_only_in_context_and_fixed_settings_ignore_overrides(self):
        paths = []
        with bridge.authorized_settings(env_fixture(), Settings) as settings:
            values = settings.captured
            self.assertEqual(values["LAMBDA_SOURCE"], "visible")
            self.assertEqual(values["UCLOUD_SOURCE"], "console")
            self.assertEqual(values["AUTODL_SOURCE"], "market")
            self.assertEqual(values["CRUSOE_SOURCE"], "public")
            self.assertNotIn("UCLOUD_PROJECT_ID", values)
            for key, _ in bridge.SESSION_INPUTS.values():
                path = Path(values[key])
                paths.append(path)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
                self.assertIsInstance(json.loads(path.read_text()), dict)
        self.assertTrue(all(not path.exists() and not path.parent.exists() for path in paths))

    def test_exception_also_removes_files(self):
        paths = []
        with self.assertRaisesRegex(RuntimeError, "synthetic-failure"):
            with bridge.authorized_settings(env_fixture(), Settings) as settings:
                paths = [Path(settings.captured[key]) for key, _ in bridge.SESSION_INPUTS.values()]
                raise RuntimeError("synthetic-failure")
        self.assertTrue(all(not path.exists() for path in paths))

    def test_bad_json_and_wrong_ucloud_origin_rejected(self):
        for invalid in ["not json", "[]", json.dumps({"format": "ucloud-console-visible-cookie-v1", "origin": "https://wrong.example", "cookie": "secret"})]:
            values = env_fixture()
            values["RACKRATE_UCLOUD_CONSOLE_SESSION_JSON"] = invalid
            with self.assertRaisesRegex(bridge.CollectionFailure, "invalid_credential_file"):
                with bridge.authorized_settings(values, Settings):
                    self.fail("must not accept invalid input")

    def test_complete_plan_keeps_all_source_observations_and_removes_account_metadata(self):
        calls = []
        def collect(providers, *, settings, include_coverage):
            calls.append((providers[0], settings.nebius_source, settings.source_policy, settings.catalog_scope))
            return result_fixture(providers[0])
        result = self.run_bridge(collect)
        self.assertEqual(len(result["prices"]), 10)
        self.assertEqual(len(result["provider_results"]), 9)
        self.assertEqual(calls[0], ("nebius", "public", "api_preferred", "standard"))
        self.assertEqual(calls[1][1], "catalog_api")
        self.assertEqual(result["prices"][0]["observed_at"], NOW)
        self.assertEqual([q["collection_source"] for q in result["prices"][:2]], ["nebius_public", "nebius_account"])
        text = json.dumps(result)
        self.assertNotIn("private-account", text)
        self.assertNotIn("internal-project-hash", text)
        self.assertNotIn("do-not-publish", text)
        self.assertNotIn("synthetic-nebius-token", text)
        self.assertEqual(result["prices"][0]["resources"], {"cpu": 12})
        self.assertEqual(result["provider_results"][0]["returned_count"], 2)

    def test_authentication_failure_never_returns_public_fallback(self):
        calls = []
        def collect(providers, *, settings, include_coverage):
            calls.append(providers[0])
            result = result_fixture(providers[0])
            if settings.nebius_source == "catalog_api":
                result["provider_results"][0].update(status="failed", error={"code": "authentication_error"})
            return result
        with self.assertRaisesRegex(bridge.CollectionFailure, "authentication_error") as caught:
            self.run_bridge(collect)
        self.assertEqual(bridge.safe_diagnostic(caught.exception), {"stage": "nebius_account", "code": "authentication_error"})
        self.assertEqual(calls, ["nebius", "nebius"])

    def test_partial_status_preserved_only_for_explicit_visibility_limits(self):
        source = result_fixture("nebius")["provider_results"][0]
        source.update(status="partial", error={"code": "partial_collection"},
                      source_errors=[{"code": "incomplete_catalog"}],
                      gaps=[{"scope": "documented_public_region", "status": "no_accessible_project", "region": "eu-north1"}])
        self.assertEqual(len(bridge.accepted_source(source, "nebius_account")), 1)
        for field, value in [("gaps", [{"scope": "new_shape", "status": "unknown"}]),
                             ("source_errors", [{"code": "authentication_error"}])]:
            changed = copy.deepcopy(source)
            changed[field] = value
            with self.assertRaisesRegex(bridge.CollectionFailure, "source_incomplete"):
                bridge.accepted_source(changed, "nebius_account")
        with self.assertRaisesRegex(bridge.CollectionFailure, "source_incomplete"):
            bridge.accepted_source(source, "nebius_public")

    def test_credential_value_in_allowlisted_quote_text_aborts_publication(self):
        def collect(providers, **kwargs):
            result = result_fixture(providers[0])
            result["prices"][0]["notes"] = ["unexpected synthetic-autodl-secret echo"]
            return result
        with self.assertRaisesRegex(bridge.CollectionFailure, "sensitive_output_rejected"):
            self.run_bridge(collect)

    def test_nested_camel_case_account_metadata_never_leaves_bridge(self):
        def collect(providers, **kwargs):
            result = result_fixture(providers[0])
            result["prices"][0]["requested_configuration"] = {
                "resource_specs": [{"metadata": {"parentId": "private-parent", "unrecognized": "private-owner"},
                                    "spec": {"resources": {"gpu_count": 8, "projectId": "private-project", "tenantId": "private-tenant", "accountID": "private-account"}}}]
            }
            return result
        result = self.run_bridge(collect)
        text = json.dumps(result)
        for private in ("private-parent", "private-owner", "private-project", "private-tenant", "private-account"):
            self.assertNotIn(private, text)
        self.assertEqual(result["prices"][0]["requested_configuration"]["resource_specs"][0]["spec"]["resources"], {"gpu_count": 8})

    def test_unreviewed_nested_schema_fails_instead_of_silently_losing_configuration(self):
        def collect(providers, **kwargs):
            result = result_fixture(providers[0])
            result["prices"][0]["resources"]["new_configuration_dimension"] = "new"
            return result
        with self.assertRaisesRegex(bridge.CollectionFailure, "unreviewed_publication_field"):
            self.run_bridge(collect)

    def test_version_mismatch_before_any_collect(self):
        with self.assertRaisesRegex(bridge.CollectionFailure, "collector_version_mismatch"):
            bridge.collect_authorized(env_fixture(), Settings=Settings, collect_prices=lambda *a, **k: self.fail("no request"),
                                      report_coverage=lambda x: x, version="old", expected_version="0.22.0")

    def test_captured_runpod_public_rows_keep_api_evidence_and_cloud_tiers(self):
        fixture = json.loads((Path(__file__).parents[1] / "lib/fixtures/runpod-catalog-2026-10-23.json").read_text())
        def collect(providers, **kwargs):
            result = result_fixture(providers[0])
            if providers[0] == "runpod":
                result["prices"] = fixture["prices"]
                result["provider_results"][0]["returned_count"] = len(fixture["prices"])
            return result
        result = self.run_bridge(collect)
        rows = [row for row in result["prices"] if row["provider"] == "runpod"]
        self.assertEqual(len(rows), len(fixture["prices"]))
        for row, original in zip(rows, fixture["prices"]):
            self.assertEqual(row, {**original, "collection_source": "runpod"})

    def test_runpod_regional_evidence_and_safe_exclusion_audit_survive(self):
        fixture = json.loads((Path(__file__).parents[1] / "lib/fixtures/runpod-regional-2026-10-23.json").read_text())
        row = fixture["prices"][0]
        self.assertEqual(bridge.sanitize(row), row)
        coverage = fixture["catalog_coverage"]
        count = coverage["catalog_quote_count"] + coverage["regional_quote_count"]
        source = {"catalog_coverage": coverage}
        self.assertEqual(bridge.public_runpod_coverage(source, [None] * count), source)
        with self.assertRaisesRegex(bridge.CollectionFailure, "source_coverage_mismatch"):
            bridge.public_runpod_coverage(source, [])
        changed = copy.deepcopy(source)
        changed["catalog_coverage"]["queried_data_center_count"] -= 1
        with self.assertRaisesRegex(bridge.CollectionFailure, "source_coverage_mismatch"):
            bridge.public_runpod_coverage(changed, [None] * count)


    def test_diagnostics_preserve_stage_but_never_arbitrary_exception_text(self):
        from nebius_oidc import OIDCError
        self.assertEqual(bridge.safe_diagnostic(OIDCError("oidc_identity_invalid", "oidc_github_identity")),
                         {"stage": "oidc_github_identity", "code": "oidc_identity_invalid"})
        self.assertEqual(bridge.safe_diagnostic(bridge.CollectionFailure("synthetic-secret"))["code"], "authorized_collection_failed")
        self.assertEqual(bridge.safe_diagnostic(RuntimeError("synthetic-secret"))["code"], "authorized_collection_failed")
        with self.assertRaises(bridge.CollectionFailure) as caught:
            with bridge.diagnostic_stage("lambda"):
                bridge.fail("source_incomplete")
        self.assertEqual(bridge.safe_diagnostic(caught.exception), {"stage": "lambda", "code": "source_incomplete"})
        def failed(provider, **kwargs):
            raise RuntimeError("synthetic-secret-response-body")
        with self.assertRaises(RuntimeError) as caught:
            self.run_bridge(failed)
        self.assertEqual(bridge.safe_diagnostic(caught.exception), {"stage": "nebius_public", "code": "authorized_collection_failed"})


    def test_explicit_public_nebius_requires_no_token_and_marks_account_excluded(self):
        values = env_fixture()
        values.pop("RACKRATE_NEBIUS_ACCESS_TOKEN")
        values["RACKRATE_NEBIUS_AUTH_MODE"] = "public"
        calls = []
        def collect(providers, *, settings, include_coverage):
            calls.append((providers[0], settings.nebius_source))
            self.assertNotIn("NEBIUS_ACCESS_TOKEN", settings.captured)
            return result_fixture(providers[0])
        output = bridge.collect_authorized(values, Settings=Settings, collect_prices=collect,
            report_coverage=lambda result: {"collection_status": result["status"]}, version="0.23.0", expected_version="0.23.0")
        self.assertEqual(len(calls), 9)
        self.assertEqual([source for provider, source in calls if provider == "nebius"], ["public"])
        self.assertEqual(output["status"], "partial")
        nebius = output["provider_results"][0]
        self.assertEqual(nebius["status"], "partial")
        self.assertEqual(nebius["source_exclusions"], [{"selection": "nebius_account", "reason": "billing_setup_required", "status": "excluded_by_configuration"}])
        self.assertEqual(nebius["source_observations"][0]["status"], "success")
        for key in bridge.SESSION_INPUTS:
            missing = dict(values); missing.pop(key)
            with self.assertRaisesRegex(bridge.CollectionFailure, "missing_required_credential"):
                with bridge.authorized_settings(missing, Settings):
                    self.fail("other account credentials are still mandatory")


    def test_extension_failures_discard_partial_rows_without_hiding_core_failures(self):
        def collect(providers, **kwargs):
            provider = providers[0]
            result = result_fixture(provider)
            if provider == "azure":
                result["provider_results"][0].update(status="partial", error={"code": "synthetic-secret-error"})
            if provider == "digitalocean":
                raise RuntimeError("synthetic-secret-exception")
            if provider == "verda":
                result["prices"][0]["resources"]["unreviewed_sensitive_field"] = "synthetic-secret"
            return result
        result = self.run_bridge(collect)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["prices"]), 7)
        for source in result["provider_results"][-3:]:
            self.assertEqual(source["status"], "failed")
            self.assertEqual(source["returned_count"], 0)
            self.assertEqual(source["source_observations"], [])
            self.assertEqual(source["error"], {"code": "extension_source_failed"})
        self.assertNotIn("synthetic-secret", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
