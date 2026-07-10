"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const sessionKey = "rr_anon_session";

export function ConversionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const anonymousId = getAnonymousId();
    const utm = readUtm(searchParams);
    void track({ anonymousId, eventName: "page_view", path: pathname, referrerHost: safeReferrerHost(), utm });

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest("a");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      const eventName = href.startsWith("/signup") ? "trial_click" : href === "/pricing" ? "pricing_click" : href === "/contact" ? "contact_click" : href === "/login" ? "login_click" : null;
      if (!eventName) return;
      void track({ anonymousId, eventName, path: pathname, referrerHost: safeReferrerHost(), utm, metadata: { href } });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname, searchParams]);

  return null;
}

function getAnonymousId() {
  const existing = window.sessionStorage.getItem(sessionKey);
  if (existing) return existing;
  const value = window.crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey, value);
  return value;
}

function safeReferrerHost() {
  try { return document.referrer ? new URL(document.referrer).hostname : undefined; } catch { return undefined; }
}

function readUtm(params: ReturnType<typeof useSearchParams>) {
  const result: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 200);
  }
  return result;
}

async function track(payload: Record<string, unknown>) {
  try { await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true }); } catch { /* Analytics must never interrupt the product. */ }
}
