"""Cloud-only orchestration. Library collectors remain persistence-free.

No browser login, cloud resource creation, renewal or public fallback occurs here.
Only this allowlisted five-provider plan is accepted; credentials never enter output.
"""
from __future__ import annotations

import contextlib
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

PROVIDERS = ("nebius", "crusoe", "lambda", "ucloud", "autodl")
SESSION_INPUTS = {
    "RACKRATE_LAMBDA_STORAGE_STATE_JSON": ("LAMBDA_STORAGE_STATE_PATH", "lambda.json"),
    "RACKRATE_AUTODL_STORAGE_STATE_JSON": ("AUTODL_STORAGE_STATE_PATH", "autodl.json"),
    "RACKRATE_UCLOUD_CONSOLE_SESSION_JSON": ("UCLOUD_SESSION_PATH", "ucloud.json"),
}
TOKEN_INPUT = "RACKRATE_NEBIUS_ACCESS_TOKEN"
AUTH_MODE_INPUT = "RACKRATE_NEBIUS_AUTH_MODE"
OIDC_INPUTS = ("ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "GITHUB_REPOSITORY", "GITHUB_REF",
               "RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID", "RACKRATE_NEBIUS_OIDC_AUDIENCE")
SECRET_INPUTS = (*SESSION_INPUTS, TOKEN_INPUT)
# A publication allowlist, not a dump of library/account responses. Keep every
# quote and its configuration, currency, unit, location and tariff evidence.
QUOTE_FIELDS = set("""
provider product_type product_line gpu_model raw_name raw_sku gpu_variant vram_gb gpu_count
amount currency unit billing_mode price_basis quote_status regions zones compute_countries
geographic_scope account_scope tax_scope observed_at source_url source_type availability notes
resources instance_price effective_from effective_until pricing_tier cloud_tier membership_required
membership_discount membership_discount_badge conditions source_conditions minimum_commitment
selected_configuration requested_configuration configuration_id promotion pricing_product_scope
billing_meter price_scope location_source location region_price_verified
applicable_regions applicable_countries price_applicability capacity_locations capacity_regions
worker_resources computed_cluster_total configuration_expansion source_price_fields
conflicting_source_price_fields source_field_conflict price_record_kind pricing_evidence
pricing_terms_unverified duration_unverified visible_source visible_record_id
billing_source_url currency_source_url schema_reference_url availability_metadata
available_gpu_count inventory_label vendor_online_status exact_api_hourly_amount price_source
pricing_page_url pricing_protocol account_project_scope availability_scope catalog_status
cpu_platform_options image_selection network_selection normalization
coverage_countries coverage_location_source coverage_locations coverage_regions coverage_zones
documented_vm_configurations api_documentation_url api_endpoint public_url region_access
source_snapshot_at source_snapshot_basis tax_source_url provider_sku_id
location_validation catalog_discovery configuration_source configuration_sources storage_estimate
storage_quote full_configuration_price catalog_metadata_discrepancy
""".split())
NESTED_FIELDS = frozenset(['BackupType', 'CPU', 'ChargeType', 'Count', 'CpuPlatform', 'Disks', 'GPU', 'GpuType', 'ImageId', 'IsBoot', 'MachineType', 'Memory', 'Name', 'NetCapability', 'Region', 'RelatedToImageFeature', 'ShowPriceDetails', 'Size', 'Snapshot', 'Type', 'UDisk', 'UHost', 'Zone', 'activity_id', 'aggregation_unit', 'aggregation_units', 'allocation_scope', 'amount', 'api_and_product_pages', 'api_gpu_memory_gb', 'architecture', 'attachMode', 'basis', 'billing_increment', 'block_storage_network_description', 'bootDisk', 'boot_disk_catalog_maximum_gb', 'boot_disk_catalog_minimum_gb', 'boot_disk_gib', 'boot_disk_minimum_basis', 'boot_disk_size_gb', 'boot_disk_type', 'breakdown', 'capacity_type', 'catalog_options', 'cents_formatter_source_url', 'cloud_tier', 'cluster_gpu_count', 'cluster_gpu_count_relation', 'cluster_type.price_cents_per_gpu_hour', 'cluster_type.price_cents_per_hour', 'cluster_type.worker_instance_type.price_cents_per_hour', 'components', 'configuration_scope', 'conversion', 'cost_type', 'country_basis', 'country_code', 'country_description', 'country_field_provided_by_api', 'country_mapping_basis', 'country_name', 'country_name_zh', 'country_source', 'country_status', 'coverage_countries', 'coverage_locations', 'coverage_regions', 'coverage_zones', 'cpu', 'cpu_cores_per_gpu', 'cpu_description', 'cpu_platform', 'cpu_range', 'currency', 'currency_basis', 'data_center', 'decimal_places', 'dedicated', 'dedicated_exclusion_basis', 'description', 'details', 'directory_observed_at', 'directory_sha256', 'disk_type', 'disks', 'documentation_discrepancy', 'documentation_url', 'documentation_verified_on', 'documented_gpu_memory_gb', 'does_not_establish', 'duration', 'duration_unit', 'duration_unverified', 'eligibility_verified', 'energy_profile', 'ephemeral_disk_description', 'evidence', 'excluded_dedicated_locations', 'explanation', 'extra_data_disks', 'field', 'final_checkout_verified', 'formula', 'fresh_platform_and_preset_verified', 'frontend_source_url', 'gpu_count', 'gpu_description', 'gpu_model', 'gpu_variant', 'gpu_vendor', 'gpus', 'gpus_per_worker', 'hourly_sku_type', 'identity_basis', 'identity_evidence', 'image_features', 'image_home_zone', 'image_id', 'image_license_price_verified', 'image_name', 'image_selection_basis', 'image_size_gb', 'image_supported_gpu_types', 'image_type', 'included_in_main_gpu_price', 'independent_provider_quote', 'independent_region_quotes', 'independent_regional_quote_count', 'infiniband_network_description', 'label_zh', 'location_basis', 'location_source_url', 'location_status', 'locations', 'managedDisk', 'maximum', 'membership_required', 'memory_gb', 'memory_gib', 'memory_mb', 'memory_per_gpu', 'method', 'minimum', 'mode', 'name', 'native_amount_milli_cny', 'native_currency', 'nested_boot_disk_independently_itemized', 'net_capability', 'normalization', 'notes', 'num_workers', 'observed_at', 'offer_types', 'onDemand', 'only_new_users', 'orderability_verified', 'ordinary_field', 'original_amount', 'original_details', 'os_name', 'os_type', 'per_gpu_amount', 'per_gpu_unit', 'platform', 'platform_catalog_url', 'preset', 'price_applicability_verified', 'price_display_basis', 'pricing_policy_url', 'pricing_terms_unverified', 'pricing_tier', 'private_region', 'project_region_source_url', 'project_region_verified', 'provider', 'public_network_included', 'purchase_limit', 'quantity', 'ram_gb', 'ram_gb_range', 'raw_sku', 'reason', 'record_type', 'region', 'region_field', 'region_name', 'region_name_zh', 'region_sign', 'regions_url', 'required_image_features', 'reservation_term', 'resource_index', 'resource_scope', 'resource_specs', 'resource_type', 'resources', 'reviewed_sha256', 'reviewed_source_url', 'rounded_amount', 'rounding', 'runtime_version_check', 'sales_contact_required', 'scope', 'selection_basis', 'selection_source_url', 'sha256', 'sizeGibibytes', 'size_gib', 'sku_costs', 'sku_id', 'source_field', 'source_label', 'source_sha256', 'source_type', 'source_unit', 'source_url', 'source_urls', 'spec', 'status', 'stock_verified', 'storage', 'storage_gib', 'storage_sku_disjoint', 'title', 'type', 'types_url', 'uniform_price_verified', 'unit', 'url', 'value', 'vcpu_count', 'vcpus', 'vcpus_range', 'verification_status', 'verified_on', 'vm_types_table', 'vpc_network_description', 'vram_gb', 'worker_instance_type', 'zone', 'zone_name', 'zones_url'])
PRIVATE_KEY = re.compile(r"(?:password|secret|token|cookie|authorization|session|credential|email|tenant_id|project_id|project_reference|organization_id|account_id|account_name|user_id|user_name|request_id)", re.I)
SAFE_NEBIUS_GAPS = {
    ("documented_public_region", "no_accessible_project"),
    ("other_accounts_and_contracts", "outside_authorized_account_scope"),
    ("regional_compute_tariff", "compute_tariff_unavailable"),
}


class CollectionFailure(Exception):
    """Only constant, non-sensitive diagnostic codes cross the process boundary."""


def fail(code):
    raise CollectionFailure(code)


def sanitize(value, *, nested=False):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            if (PRIVATE_KEY.search(key) or normalized == "metadata"
                    or any(term in normalized for term in ("parentid", "projectid", "tenantid", "accountid", "userid", "organizationid", "email", "password", "credential", "secret", "token", "cookie"))):
                continue
            if nested and key not in NESTED_FIELDS:
                fail("unreviewed_publication_field")
            result[key] = sanitize(item, nested=True)
        return result
    if isinstance(value, list):
        return [sanitize(item, nested=True) for item in value]
    return value


def sensitive_values(env):
    values = [env.get(TOKEN_INPUT, "")]
    def visit(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"value", "cookie", "token"} and isinstance(item, str):
                    values.append(item)
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
    for name in SESSION_INPUTS:
        try:
            visit(json.loads(env.get(name, "")))
        except (ValueError, TypeError):
            pass
    return {value for value in values if len(value) >= 8}


@contextlib.contextmanager
def authorized_settings(env, Settings):
    # Validate all four inputs before making any network request. Missing input
    # is an error even when another source could supply public prices.
    auth_mode = env.get(AUTH_MODE_INPUT, "token") or "token"
    if auth_mode not in {"token", "oidc"}:
        fail("invalid_nebius_auth_mode")
    for key in (*SESSION_INPUTS, *((TOKEN_INPUT,) if auth_mode == "token" else OIDC_INPUTS)):
        value = env.get(key)
        if not isinstance(value, str) or not value.strip():
            fail("missing_required_credential")
        if len(value.encode("utf-8")) > 1024 * 1024:
            fail("invalid_credential_file")
    parsed = {}
    for name in SESSION_INPUTS:
        try:
            value = json.loads(env[name])
        except (ValueError, TypeError):
            fail("invalid_credential_file")
        if not isinstance(value, dict):
            fail("invalid_credential_file")
        if name == "RACKRATE_UCLOUD_CONSOLE_SESSION_JSON":
            if (value.get("format") != "ucloud-console-visible-cookie-v1"
                    or value.get("origin") != "https://console.ucloud.cn"
                    or not isinstance(value.get("cookie"), str) or not value["cookie"]):
                fail("invalid_credential_file")
        elif not isinstance(value.get("cookies"), list) or not isinstance(value.get("origins"), list):
            fail("invalid_credential_file")
        parsed[name] = value
    if auth_mode == "oidc":
        from nebius_oidc import exchange_nebius_token
        env[TOKEN_INPUT] = exchange_nebius_token(env)
    with tempfile.TemporaryDirectory(prefix="rackrate-auth-") as directory:
        os.chmod(directory, 0o700)
        values = {
            "GPU_PRICE_MONITOR_PROVIDERS": ",".join(PROVIDERS),
            "GPU_PRICE_MONITOR_SOURCE_POLICY": "configured",
            "GPU_PRICE_MONITOR_CATALOG_SCOPE": "complete",
            "LAMBDA_SOURCE": "visible", "AUTODL_SOURCE": "market",
            "UCLOUD_SOURCE": "console", "UCLOUD_CHECK_AVAILABILITY": "false",
            "NEBIUS_SOURCE": "catalog_api", "NEBIUS_ACCESS_TOKEN": env[TOKEN_INPUT],
            "CRUSOE_SOURCE": "public",
        }
        for name, (setting, filename) in SESSION_INPUTS.items():
            path = Path(directory, filename)
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(parsed[name], output, ensure_ascii=False)
            values[setting] = str(path)
        # Explicit mapping ignores inherited dotenv, project selectors and all
        # other environment-based source or credential overrides.
        yield Settings.from_env(values, env_file=None)


def accepted_source(source, selection):
    if (not isinstance(source, dict) or not source.get("returned_count", 0)
            or not source.get("observed_at")):
        fail("source_incomplete")
    if source.get("status") == "success" and not source.get("error"):
        return []
    # The API enumerates only readable projects. Absent projects and a zero
    # compute tariff are explicit visibility/price absence, not stale fallbacks.
    # Preserve partial status and every limitation in the published envelope.
    if selection not in {"nebius_account", "autodl"} or source.get("status") != "partial":
        fail("source_incomplete")
    if source.get("error", {}).get("code") != "partial_collection":
        fail("source_incomplete")
    errors = source.get("source_errors", [])
    gaps = source.get("gaps", [])
    allowed_errors = {"incomplete_catalog", "compute_tariff_unavailable"} if selection == "nebius_account" else {"incomplete_catalog"}
    allowed_gaps = SAFE_NEBIUS_GAPS if selection == "nebius_account" else {("market_region_country", "country_not_verified")}
    if not errors or not gaps or any(
        error.get("code") not in allowed_errors for error in errors
    ) or any((gap.get("scope"), gap.get("status")) not in allowed_gaps for gap in gaps):
        fail("source_incomplete")
    return [{key: gap[key] for key in ("scope", "status", "region", "country_code", "gpu_model", "gpu_count") if key in gap} for gap in gaps]


def collect_authorized(env, *, Settings, collect_prices, report_coverage, version, expected_version):
    if version != expected_version:
        fail("collector_version_mismatch")
    from dataclasses import replace
    env = dict(env)
    prices, observations = [], {provider: [] for provider in PROVIDERS}
    with authorized_settings(env, Settings) as settings:
        # Nebius public API + public website JSON are additional independent
        # sources. They do not replace a failed account request.
        plan = [("nebius", "nebius_public", replace(settings, nebius_source="public", source_policy="api_preferred", catalog_scope="standard")),
                ("nebius", "nebius_account", settings)]
        plan.extend((provider, provider, settings) for provider in PROVIDERS if provider != "nebius")
        for provider, selection, selected in plan:
            result = collect_prices([provider], settings=selected, include_coverage=False)
            sources = result.get("provider_results", [])
            if len(sources) != 1 or sources[0].get("provider") != provider:
                fail("source_incomplete")
            source = sources[0]
            limitations = accepted_source(source, selection)
            rows = result.get("prices", [])
            if not rows or source["returned_count"] != len(rows) or any(q.get("provider") != provider for q in rows):
                fail("source_count_mismatch")
            for quote in rows:
                row = sanitize({key: value for key, value in quote.items() if key in QUOTE_FIELDS})
                row["collection_source"] = selection
                # Account project IDs never leave the bridge. This opaque
                # partition keeps distinct project quote observations separate.
                if quote.get("project_reference"):
                    row["source_partition"] = hashlib.sha256(str(quote["project_reference"]).encode()).hexdigest()[:24]
                prices.append(row)
            observations[provider].append({
                "selection": selection, "status": source["status"],
                "source_url": source.get("source_url"), "source_type": source.get("source_type"),
                "observed_at": source["observed_at"], "returned_count": len(rows),
                "limitations": limitations,
            })
    provider_results = []
    for provider in PROVIDERS:
        sources = observations[provider]
        partial = any(item["status"] == "partial" for item in sources)
        provider_results.append({
            "provider": provider, "status": "partial" if partial else "success", "error": None,
            "observed_at": max(item["observed_at"] for item in sources),
            "returned_count": sum(item["returned_count"] for item in sources),
            "source_url": sources[0]["source_url"],
            "source_type": "mixed_official_sources" if len(sources) > 1 else sources[0]["source_type"],
            "source_observations": sources,
        })
    result = {
        "schema_version": 1,
        "status": "partial" if any(source["status"] == "partial" for source in provider_results) else "success",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "collection_mode": "authorized", "validation_policy": "visible-catalog-v1",
        "prices": prices, "provider_results": provider_results,
    }
    result["coverage"] = report_coverage(result)
    secrets = sensitive_values(env)
    def contains_secret(value):
        if isinstance(value, str):
            return any(secret in value for secret in secrets)
        if isinstance(value, dict):
            return any(contains_secret(item) for item in value.values())
        if isinstance(value, list):
            return any(contains_secret(item) for item in value)
        return False
    if contains_secret(result):
        fail("sensitive_output_rejected")
    return result


def main():
    env = {key: os.environ.pop(key, "") for key in (*SECRET_INPUTS, AUTH_MODE_INPUT, *OIDC_INPUTS)}
    try:
        # Discard unexpected library/network debug output, even on exceptions.
        with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            from gpu_price_monitor import Settings, __version__, collect_prices
            from gpu_price_monitor.coverage import report_coverage
            result = collect_authorized(env, Settings=Settings, collect_prices=collect_prices,
                                        report_coverage=report_coverage, version=__version__, expected_version=sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    except BaseException as error:
        code = str(error) if isinstance(error, CollectionFailure) else "authorized_collection_failed"
        print("RackRate collection failed: " + code, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
