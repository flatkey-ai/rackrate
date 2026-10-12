import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { flatkeyComputeUrl, siteConfig } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Cloud GPU price intelligence`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    title: `${siteConfig.name} — Cloud GPU price intelligence`,
    description: siteConfig.description,
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="shell header-inner">
            <Link href="/" className="brand" aria-label={`${siteConfig.name} home`}>
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <span>{siteConfig.name}</span>
            </Link>
            <nav className="main-nav" aria-label="Main navigation">
              <Link href="/#prices">Prices</Link>
              <Link href="/#gpus">GPUs</Link>
              <Link href="/#providers">Providers</Link>
              <Link href="/methodology">Methodology</Link>
            </nav>
            <a href={flatkeyComputeUrl("header")} className="header-cta">Find GPU compute <span>↗</span></a>
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
              <Link href="/#prices">Live comparison</Link>
              <Link href="/#gpus">GPU catalogue</Link>
              <Link href="/#providers">Cloud providers</Link>
            </div>
            <div>
              <strong>About the data</strong>
              <Link href="/methodology">Methodology</Link>
              <a href={flatkeyComputeUrl("footer")}>Flatkey Compute ↗</a>
              <a href="mailto:data@example.com">Report a price</a>
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
