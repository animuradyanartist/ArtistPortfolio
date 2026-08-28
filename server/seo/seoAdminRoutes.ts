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
import { NEXT_KEYWORD_BATCH } from "@shared/seo/keywords";
import { EXECUTION_LOG, executionSummary } from "@shared/seo/executionLog";

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

  app.get("/api/admin/seo/images", requireAdminAuth, async (_req, res) => {
    try { res.json(await seo.imageSeoAudit()); }
    catch { res.status(500).json({ message: "Could not run the Google Images audit." }); }
  });

  // The auditable next keyword batch (Task 5) — candidates to validate, NOT yet given a paid lookup.
  app.get("/api/admin/seo/next-batch", requireAdminAuth, (_req, res) => {
    res.json({ nextBatch: NEXT_KEYWORD_BATCH });
  });

  // The execution log — decisions taken on the real opportunities (implemented / keep / approval / deferred).
  app.get("/api/admin/seo/execution-log", requireAdminAuth, (_req, res) => {
    res.json({ log: EXECUTION_LOG, summary: executionSummary() });
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
      // Extended lifecycle: todo=Recommended, doing=Ready, done=Implemented, + needs-approval, deferred, ignored.
      if (!["todo", "doing", "done", "ignored", "needs-approval", "deferred"].includes(status)) return res.status(400).json({ message: "Bad status" });
      await store.setActionStatus(id, status);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Could not update the action." }); }
  });

  app.get("/api/admin/seo/usage", requireAdminAuth, async (_req, res) => {
    try { res.json({ usage: await store.usageSummary(), cadence: JOB_CADENCE, costTier: COST_TIER }); }
    catch { res.status(500).json({ message: "Could not load usage." }); }
  });

  // ── Mutations ──

  // INITIAL SCAN (FREE — no API cost). Seeds the small buyer-intent batch, maps it to real pages,
  // and generates actions — so the dashboard is populated with structural analysis immediately.
  app.post("/api/admin/seo/initial-scan", requireAdminAuth, async (_req, res) => {
    try { res.json(await seo.initialScan(false)); }
    catch (e) { res.status(500).json({ message: "Initial scan failed.", detail: (e as Error).message }); }
  });

  // INITIAL SCAN + LIVE METRICS (PAID — ONE keyword_overview call, ~$0.01, cached 30 days). Adds real
  // volume/CPC/intent. A keyword the API returns no record for stays null (never fabricated to 0).
  app.post("/api/admin/seo/initial-scan/live", requireAdminAuth, async (_req, res) => {
    try {
      const r = await seo.initialScan(true);
      if ((r as { ok?: boolean }).ok === false) return res.status(503).json(r);
      res.json(r);
    } catch (e) { res.status(502).json({ ok: false, message: "DataForSEO request failed.", detail: (e as Error).message?.slice(0, 200) }); }
  });

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
