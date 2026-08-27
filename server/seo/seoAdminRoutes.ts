/**
 * SEO ADMIN ROUTES — the decision surface (Phase 12), all behind requireAdminAuth. The read views
 * (overview / opportunities / page-map / print-seo / actions / usage) work with or without live
 * DataForSEO data; the refresh + seed endpoints mutate. Nothing calls DataForSEO unless credentials
 * are configured (the client fails closed).
 */

import type { Express } from "express";
import { requireAdminAuth } from "../auth";
import { dataForSeoMode } from "./dataForSeoClient";
import * as seo from "./seoService";
import * as store from "./seoStore";
import { JOB_CADENCE, COST_TIER } from "@shared/seo/cache";

export function registerSeoAdminRoutes(app: Express): void {
  app.get("/api/admin/seo/status", requireAdminAuth, async (_req, res) => {
    res.json({
      mode: dataForSeoMode(),
      configured: seo.seoConfigured(),
      cadence: JOB_CADENCE,
      costTier: COST_TIER,
      market: { locationCode: Number(process.env.SEO_LOCATION_CODE) || 2826, languageCode: process.env.SEO_LANGUAGE_CODE?.trim() || "en" },
    });
  });

  app.get("/api/admin/seo/overview", requireAdminAuth, async (_req, res) => {
    try { res.json(await seo.overview()); }
    catch (e) { res.status(500).json({ message: "Could not build the SEO overview.", detail: (e as Error).message }); }
  });

  app.get("/api/admin/seo/opportunities", requireAdminAuth, async (_req, res) => {
    try { res.json({ keywords: await seo.opportunities() }); }
    catch { res.status(500).json({ message: "Could not load keyword opportunities." }); }
  });

  app.get("/api/admin/seo/page-map", requireAdminAuth, async (_req, res) => {
    try { res.json({ pages: await seo.pageMap() }); }
    catch { res.status(500).json({ message: "Could not build the page map." }); }
  });

  app.get("/api/admin/seo/print-seo", requireAdminAuth, async (_req, res) => {
    try { res.json({ recommendations: await seo.printLandingRecommendations() }); }
    catch { res.status(500).json({ message: "Could not load print SEO recommendations." }); }
  });

  app.get("/api/admin/seo/actions", requireAdminAuth, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({ actions: await store.listActions(status) });
    } catch { res.status(500).json({ message: "Could not load actions." }); }
  });

  app.post("/api/admin/seo/actions/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const status = String((req.body ?? {}).status ?? "");
      if (!["todo", "doing", "done", "ignored"].includes(status)) return res.status(400).json({ message: "Bad status" });
      await store.setActionStatus(id, status);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Could not update the action." }); }
  });

  app.get("/api/admin/seo/usage", requireAdminAuth, async (_req, res) => {
    try { res.json({ usage: await store.usageSummary(), cadence: JOB_CADENCE, costTier: COST_TIER }); }
    catch { res.status(500).json({ message: "Could not load usage." }); }
  });

  // ── Mutations ──
  app.post("/api/admin/seo/seed", requireAdminAuth, async (_req, res) => {
    try { res.json({ ok: true, seeded: await seo.seedKeywords() }); }
    catch { res.status(500).json({ message: "Could not seed keywords." }); }
  });

  app.post("/api/admin/seo/regenerate-actions", requireAdminAuth, async (_req, res) => {
    try { const { actions } = await seo.analyzeAll(); res.json({ ok: true, actions: actions.length }); }
    catch (e) { res.status(500).json({ message: "Could not regenerate actions.", detail: (e as Error).message }); }
  });

  // WEEKLY cheap refresh (bulk keyword_overview). Gated on credentials; dedups via the cache.
  app.post("/api/admin/seo/refresh/keyword-overview", requireAdminAuth, async (_req, res) => {
    try {
      const r = await seo.refreshKeywordOverview();
      if (!r.ran) return res.status(503).json({ ok: false, message: "DataForSEO is not configured — set DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD." });
      res.json({ ok: true, ...r });
    } catch (e) { res.status(502).json({ ok: false, message: "DataForSEO request failed.", detail: (e as Error).message?.slice(0, 200) }); }
  });
}
