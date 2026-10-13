import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { absoluteUrl, siteConfig } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Compare GPU rental prices per hour`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: { canonical: absoluteUrl("/") },
  verification: { google: "dmaO3nL690AKnVSn-LzYLH3zMF71rz8U-DsKzvhnZSs" },
  openGraph: {
    title: `${siteConfig.name} — Compare GPU rental prices per hour`,
    description: siteConfig.description,
    type: "website",
    url: absoluteUrl("/"),
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <header className="site-header">
          <div className="shell header-inner">
            <Link href="/" className="brand" aria-label={`${siteConfig.name} home`}>
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <span>{siteConfig.name}</span>
            </Link>
            <nav className="main-nav" aria-label="Main navigation">
              <Link href="/#prices">Prices</Link>
              <Link href="/gpus">GPUs</Link>
              <Link href="/providers">Providers</Link>
              <Link href="/regions">Regions</Link>
              <Link href="/guides/gpu-rental-pricing">Guide</Link>
              <Link href="/blog">Blog</Link>
            </nav>
            <Link href="/#prices" className="header-cta">Compare prices <span>↓</span></Link>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell footer-grid">
            <div>
              <div className="brand footer-brand">
                <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
                <span>{siteConfig.name}</span>
              </div>
              <p>Price intelligence for people who actually deploy GPUs.</p>
            </div>
            <div>
              <strong>Explore</strong>
              <Link href="/#prices">Price comparison</Link>
              <Link href="/gpus">GPU rental prices</Link>
              <Link href="/providers">Cloud providers</Link>
              <Link href="/regions">GPU cloud regions</Link>
              <Link href="/blog">RackRate blog</Link>
            </div>
            <div>
              <strong>Learn</strong>
              <Link href="/guides/gpu-rental-pricing">GPU pricing guide</Link>
              <Link href="/methodology">Methodology</Link>
              <Link href="/gpus">Browse GPU profiles</Link>
              <span>Sample data for launch preview</span>
            </div>
          </div>
          <div className="shell footer-bottom">
            <span>© {new Date().getFullYear()} {siteConfig.name}</span>
            <span>Prices exclude tax, storage, and negotiated discounts.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
