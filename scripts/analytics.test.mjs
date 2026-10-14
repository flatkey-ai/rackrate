import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../components/site-analytics.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(consent, id = "G-PP87NKBGK5", blockedStorage = false) {
  const scripts = [];
  const window = {
    localStorage: { getItem() { if (blockedStorage) throw new Error("blocked"); return consent; } },
    location: { href: "https://rackrate.org/?q=private&email=user%40example.com&utm_source=test#secret" },
  };
  const document = {
    referrer: "https://example.com/guide?email=user%40example.com",
    title: "RackRate",
    getElementById: id => scripts.find(s => s.id === id),
    createElement: () => ({}),
    head: { appendChild: s => scripts.push(s) },
  };
  const exports = {};
  vm.runInNewContext(compiled, { window, document, URL, Date, exports, process: { env: { NEXT_PUBLIC_GA4_MEASUREMENT_ID: id } }, require: () => ({}) });
  return { window, scripts, track: exports.trackSiteEvent };
}
test("no tag or events without consent, including blocked storage", () => {
  for (const f of [fixture(null), fixture("denied"), fixture("granted", undefined, true)]) {
    f.track("page_viewed");
    assert.equal(f.scripts.length, 0);
    assert.equal(f.window.dataLayer, undefined);
  }
});
test("consent loads one GA4 tag and keeps event routing and URL privacy", () => {
  const f = fixture("granted");
  f.track("page_viewed", { page_path: "/" });
  f.track("price_filter_changed", { filter: "gpu", value: "nvidia-h100" });
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-PP87NKBGK5");
  const events = f.window.dataLayer.filter(e => e[0] === "event");
  assert.equal(events[0][1], "page_view");
  assert.equal(events[1][1], "price_filter_changed");
  assert.equal(events[0][2].page_location, "https://rackrate.org/?utm_source=test");
  assert.equal(events[0][2].page_referrer, "https://example.com/guide");
  assert.equal(events[0][2].send_to, "G-PP87NKBGK5");
  assert.equal(f.window.dataLayer.find(e => e[0] === "config")[2].send_page_view, false);
  assert.equal(f.window.dataLayer.find(e => e[0] === "consent")[2].ad_storage, "denied");
});
test("missing or invalid Measurement ID does not load a tag", () => {
  for (const id of ["", "invalid"]) {
    const f = fixture("granted", id);
    f.track("page_viewed");
    assert.equal(f.scripts.length, 0);
  }
});
