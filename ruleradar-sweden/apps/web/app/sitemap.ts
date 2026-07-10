import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL || "https://ruleradar.se";
  const routes = ["", "/pricing", "/sample-alerts", "/faq", "/security", "/privacy", "/terms", "/contact"];
  return routes.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "weekly" : "monthly", priority: path === "" ? 1 : path === "/pricing" ? 0.9 : 0.6 }));
}
