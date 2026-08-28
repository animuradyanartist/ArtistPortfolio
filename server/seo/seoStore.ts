/**
 * SEO STORE — DB access for the SEO system + the cost-control fetch gate. Raw SQL against pool
 * (these tables are created by the boot self-heal). The `cachedFetch` wrapper is the ONE place a
 * DataForSEO call is made from the service: it dedups against `seo_api_cache` (never pays twice for
 * fresh data), stores the raw response for later re-analysis, and logs every call/hit to
 * `seo_api_usage` so spend is visible in admin. Fails safe with no DB (returns empties).
 */

import { pool, hasDatabase } from "../db";
import { cacheKey, decideCache, TTL_HOURS, type SeoDataType } from "@shared/seo/cache";

// ── Keywords ──────────────────────────────────────────────────────────────────────────────
export interface KeywordRow {
  id: number; keyword: string; family: string; primary_target_url: string | null;
  status: string; source: string; notes: string | null;
}

export async function listKeywords(status?: string): Promise<KeywordRow[]> {
  if (!hasDatabase) return [];
  const { rows } = status
    ? await pool.query(`SELECT * FROM seo_keywords WHERE status = $1 ORDER BY keyword`, [status])
    : await pool.query(`SELECT * FROM seo_keywords ORDER BY keyword`);
  return rows as KeywordRow[];
}

export async function upsertKeyword(k: { keyword: string; family: string; source?: string; primaryTargetUrl?: string | null }): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `INSERT INTO seo_keywords (keyword, family, source, primary_target_url, updated_at)
       VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (keyword) DO UPDATE SET family = EXCLUDED.family,
       primary_target_url = COALESCE(EXCLUDED.primary_target_url, seo_keywords.primary_target_url),
       updated_at = now()`,
    [k.keyword, k.family, k.source ?? "seed", k.primaryTargetUrl ?? null],
  );
}

export async function setKeywordStatus(id: number, status: string): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(`UPDATE seo_keywords SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

export async function setKeywordTarget(id: number, url: string | null): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(`UPDATE seo_keywords SET primary_target_url = $2, updated_at = now() WHERE id = $1`, [id, url]);
}

// ── Snapshots (append-only, historical) ─────────────────────────────────────────────────────
export interface SnapshotRow {
  id: number; keyword_id: number; captured_at: Date; search_volume: number | null; cpc: string | null;
  competition: string | null; difficulty: number | null; main_intent: string | null;
  our_rank: number | null; our_ranking_url: string | null; opportunity_score: number | null;
  top_domains: string | null; serp_features: string | null;
}

export async function insertSnapshot(s: Omit<SnapshotRow, "id" | "captured_at"> & { raw?: string }): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `INSERT INTO seo_keyword_snapshots
       (keyword_id, search_volume, cpc, competition, difficulty, main_intent, our_rank, our_ranking_url, opportunity_score, top_domains, serp_features, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [s.keyword_id, s.search_volume, s.cpc, s.competition, s.difficulty, s.main_intent, s.our_rank, s.our_ranking_url, s.opportunity_score, s.top_domains, s.serp_features, s.raw ?? null],
  );
}

/** The latest snapshot per keyword (for the current view). */
export async function latestSnapshots(): Promise<Map<number, SnapshotRow>> {
  if (!hasDatabase) return new Map();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (keyword_id) * FROM seo_keyword_snapshots ORDER BY keyword_id, captured_at DESC`,
  );
  return new Map((rows as SnapshotRow[]).map((r) => [r.keyword_id, r]));
}

/** The full history for one keyword (before → 2w → 4w → 8w). */
export async function snapshotHistory(keywordId: number): Promise<SnapshotRow[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT * FROM seo_keyword_snapshots WHERE keyword_id = $1 ORDER BY captured_at ASC`, [keywordId],
  );
  return rows as SnapshotRow[];
}

// ── Actions ─────────────────────────────────────────────────────────────────────────────────
export async function replaceOpenActions(actions: Array<Record<string, unknown>>): Promise<void> {
  if (!hasDatabase) return;
  // Regenerate the 'todo' set; never touch actions a human has moved to doing/done/ignored.
  await pool.query(`DELETE FROM seo_actions WHERE status = 'todo'`);
  for (const a of actions) {
    await pool.query(
      `INSERT INTO seo_actions (keyword, family, type, action_group, target_url, priority, effort, objective, reason, evidence, recommended_change, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'todo')`,
      [a.keyword, a.family, a.type, a.group, a.targetUrl, a.priority, a.effort, a.objective, a.reason, a.evidence, a.recommendedChange],
    );
  }
}

export async function listActions(status?: string): Promise<Record<string, unknown>[]> {
  if (!hasDatabase) return [];
  const { rows } = status
    ? await pool.query(`SELECT * FROM seo_actions WHERE status = $1 ORDER BY priority DESC`, [status])
    : await pool.query(`SELECT * FROM seo_actions ORDER BY priority DESC`);
  return rows;
}

export async function setActionStatus(id: number, status: string, metrics?: { before?: unknown; after?: unknown }): Promise<void> {
  if (!hasDatabase) return;
  const completed = status === "done" ? "now()" : "completed_at";
  await pool.query(
    `UPDATE seo_actions SET status = $2, completed_at = ${completed},
        before_metrics = COALESCE($3, before_metrics), after_metrics = COALESCE($4, after_metrics)
      WHERE id = $1`,
    [id, status, metrics?.before ? JSON.stringify(metrics.before) : null, metrics?.after ? JSON.stringify(metrics.after) : null],
  );
}

// ── Cost-control fetch gate + usage ──────────────────────────────────────────────────────────
async function logUsage(dataType: string, endpoint: string, cost: number | null, cacheHit: boolean): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `INSERT INTO seo_api_usage (data_type, endpoint, cost, cache_hit) VALUES ($1,$2,$3,$4)`,
    [dataType, endpoint, cost != null ? String(cost) : null, cacheHit],
  );
}

/**
 * The ONE gate every DataForSEO call goes through. Serves fresh cache without paying (dedup),
 * otherwise calls `fetcher`, stores the raw response, and logs usage. `now` is injectable for tests.
 */
export async function cachedFetch<T>(
  dataType: SeoDataType,
  params: Record<string, unknown>,
  endpoint: string,
  fetcher: () => Promise<{ data: T; cost: number | null }>,
  now: number = Date.now(),
): Promise<{ data: T; fromCache: boolean }> {
  const key = cacheKey(dataType, params);

  if (hasDatabase) {
    const { rows } = await pool.query(`SELECT response, fetched_at FROM seo_api_cache WHERE cache_key = $1`, [key]);
    const cached = rows[0] ? { fetchedAtMs: new Date(rows[0].fetched_at).getTime() } : null;
    const decision = decideCache(dataType, cached, now);
    if (decision.hit && rows[0]?.response) {
      await logUsage(dataType, endpoint, 0, true);
      return { data: JSON.parse(rows[0].response) as T, fromCache: true };
    }
  }

  const { data, cost } = await fetcher();

  if (hasDatabase) {
    const expiresAt = new Date(now + TTL_HOURS[dataType] * 3600 * 1000);
    await pool.query(
      `INSERT INTO seo_api_cache (cache_key, data_type, params, response, cost, fetched_at, expires_at)
         VALUES ($1,$2,$3,$4,$5, now(), $6)
       ON CONFLICT (cache_key) DO UPDATE SET response = EXCLUDED.response, cost = EXCLUDED.cost,
         params = EXCLUDED.params, fetched_at = now(), expires_at = EXCLUDED.expires_at`,
      [key, dataType, JSON.stringify(params), JSON.stringify(data), cost != null ? String(cost) : null, expiresAt],
    );
    await logUsage(dataType, endpoint, cost, false);
  }
  return { data, fromCache: false };
}

export async function usageSummary(): Promise<{ dataType: string; calls: number; cacheHits: number; cost: number }[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT data_type,
            count(*) FILTER (WHERE cache_hit = false)::int AS calls,
            count(*) FILTER (WHERE cache_hit = true)::int AS cache_hits,
            COALESCE(sum(CASE WHEN cache_hit = false THEN cost::numeric ELSE 0 END), 0)::float AS cost
       FROM seo_api_usage
      WHERE created_at > now() - interval '30 days'
      GROUP BY data_type ORDER BY cost DESC`,
  );
  return rows.map((r) => ({ dataType: r.data_type, calls: r.calls, cacheHits: r.cache_hits, cost: r.cost }));
}
