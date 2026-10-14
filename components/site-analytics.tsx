"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const consentKey = "flatkey_analytics_consent";
const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "";

type EventProperties = Record<string, boolean | number | string | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function analyticsAllowed() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(consentKey) === "granted";
  } catch {
    return false;
  }
}

function initializeGa4() {
  if (!analyticsAllowed() || !/^G-[A-Z0-9]+$/.test(measurementId)) return false;
  if (document.getElementById("rackrate-ga4")) return true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.id = "rackrate-ga4";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
  return true;
}

export function trackSiteEvent(event: string, properties: EventProperties = {}) {
  if (!initializeGa4()) return;
  const page = new URL(window.location.href);
  const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  for (const key of [...page.searchParams.keys()]) {
    if (!campaignKeys.includes(key)) page.searchParams.delete(key);
  }
  page.hash = "";
  let referrer = "";
  try { const url = new URL(document.referrer); referrer = url.origin + url.pathname; } catch {}
  window.gtag?.("event", event === "page_viewed" ? "page_view" : event, {
    ...properties,
    send_to: measurementId,
    source_site: "rackrate",
    page_location: page.toString(),
    page_referrer: referrer,
    page_title: document.title,
  });
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
  const lastPageView = useRef<string | null>(null);
  const [consent, setConsent] = useState<"denied" | "granted" | "unknown">("unknown");

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(consentKey); window.localStorage.removeItem("rackrate_analytics_id"); } catch {}
    setConsent(stored === "granted" || stored === "denied" ? stored : "unknown");
  }, []);

  useEffect(() => {
    if (consent !== "granted" || lastPageView.current === pathname) return;
    trackSiteEvent("page_viewed", { page_path: pathname });
    lastPageView.current = pathname;
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
      <p><strong>Help improve RackRate</strong><span>Allow Google Analytics to measure visits and interactions. We do not send account details or search text.</span></p>
      <div>
        <button type="button" onClick={() => { window.localStorage.setItem(consentKey, "denied"); setConsent("denied"); }}>Decline</button>
        <button type="button" className="consent-accept" onClick={() => { window.localStorage.setItem(consentKey, "granted"); setConsent("granted"); }}>Allow analytics</button>
      </div>
    </aside>
  );
}
