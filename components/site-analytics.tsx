"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const consentKey = "flatkey_analytics_consent";
const identityKey = "rackrate_analytics_id";
const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "cf2f149bd61f607c3fd578596ad86921";

type EventProperties = Record<string, boolean | number | string | undefined>;

function analyticsAllowed() {
  return typeof window !== "undefined" && window.localStorage.getItem(consentKey) === "granted";
}

function getDistinctId() {
  const current = window.localStorage.getItem(identityKey);
  if (current) return current;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(identityKey, created);
  return created;
}

export function trackSiteEvent(event: string, properties: EventProperties = {}) {
  if (!analyticsAllowed()) return;
  const payload = [{
    event,
    properties: {
      token,
      distinct_id: getDistinctId(),
      source_site: "rackrate",
      path: window.location.pathname,
      url: window.location.href,
      referrer: document.referrer || undefined,
      time: Math.floor(Date.now() / 1000),
      ...properties,
    },
  }];
  void fetch("https://api-js.mixpanel.com/track/?verbose=0", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

function classifyLink(anchor: HTMLAnchorElement) {
  const destination = new URL(anchor.href, window.location.href);
  if (destination.hostname === "console.flatkey.ai") return "flatkey_console_clicked";
  if (destination.hostname === "flatkey.ai" || destination.hostname === "www.flatkey.ai") return "flatkey_website_clicked";
  if (destination.origin !== window.location.origin) return "external_source_clicked";
  return null;
}

export function SiteAnalytics() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<"denied" | "granted" | "unknown">("unknown");

  useEffect(() => {
    const stored = window.localStorage.getItem(consentKey);
    setConsent(stored === "granted" || stored === "denied" ? stored : "unknown");
  }, []);

  useEffect(() => {
    if (consent === "granted") trackSiteEvent("page_viewed", { page_path: pathname });
  }, [consent, pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const eventName = classifyLink(anchor);
      if (!eventName) return;
      const destination = new URL(anchor.href, window.location.href);
      trackSiteEvent(eventName, {
        destination: destination.origin + destination.pathname,
        utm_campaign: destination.searchParams.get("utm_campaign") || undefined,
        utm_content: destination.searchParams.get("utm_content") || undefined,
        link_text: anchor.textContent?.trim().replace(/\s+/g, " ").slice(0, 120),
      });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (consent !== "unknown") return null;

  return (
    <aside className="analytics-consent" aria-label="Analytics preference">
      <p><strong>Help improve RackRate</strong><span>Allow anonymous usage analytics. No account or search text is collected.</span></p>
      <div>
        <button type="button" onClick={() => { window.localStorage.setItem(consentKey, "denied"); setConsent("denied"); }}>Decline</button>
        <button type="button" className="consent-accept" onClick={() => { window.localStorage.setItem(consentKey, "granted"); setConsent("granted"); }}>Allow analytics</button>
      </div>
    </aside>
  );
}
