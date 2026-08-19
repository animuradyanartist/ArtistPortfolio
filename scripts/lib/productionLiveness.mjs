/**
 * PROVE THE DATABASE IS THE ONE SERVING THE SITE, BEFORE WRITING TO IT.
 *
 * Replit injects a different DATABASE_URL into the workspace than into the deployment. Both
 * are called DATABASE_URL, both connect, both look right. The pilot image migration ran
 * against the workspace copy and only revealed it by reporting "SKIP artwork 79: not found" —
 * a row the live site was serving that the connected database had never seen. Eight of nine
 * images would have moved somewhere invisible while every log said success.
 *
 * That tell generalises, so it belongs in one place: a database missing something production
 * is currently returning is not production.
 *
 * FAILS CLOSED on every uncertainty — unreachable site, unparseable response, empty result.
 * Not being able to prove you are connected to production is not permission to write to it.
 *
 * NO CREDENTIALS are read, compared or printed. The comparison is over public ids.
 */

const DEFAULT_SITE = process.env.PILOT_SITE_URL || "https://animuradyan.com";

/** Compare live-site ids against connected-database ids. Pure. */
export function compareToLive(liveIds, dbIds) {
  const live = new Set(liveIds);
  const db = new Set(dbIds);
  const missingFromDb = [...live].filter((id) => !db.has(id)).sort((a, b) => a - b);
  const extraInDb = [...db].filter((id) => !live.has(id)).sort((a, b) => a - b);
  const matches = live.size > 0 && missingFromDb.length === 0 && extraInDb.length === 0;
  return {
    matches,
    liveCount: live.size,
    dbCount: db.size,
    liveMaxId: live.size ? Math.max(...live) : null,
    dbMaxId: db.size ? Math.max(...db) : null,
    missingFromDb,
    extraInDb,
    verdict: !live.size
      ? "the live site returned nothing, so this cannot be verified — refusing"
      : matches
        ? "this IS the database serving the site"
        : missingFromDb.length
          ? `MISMATCH — the live site is serving ${missingFromDb.length} row(s) this database does not have`
          : `MISMATCH — this database holds ${extraInDb.length} row(s) the live site does not serve`,
  };
}

export function describeLiveness(r, siteUrl = DEFAULT_SITE) {
  const lines = [
    ``,
    `site            : ${siteUrl}`,
    `live artworks   : ${r.liveCount}${r.liveMaxId !== null ? ` (max id ${r.liveMaxId})` : ""}`,
    `connected db    : ${r.dbCount}${r.dbMaxId !== null ? ` (max id ${r.dbMaxId})` : ""}`,
    `missing from db : ${r.missingFromDb.length ? r.missingFromDb.join(", ") : "none"}`,
    `extra in db     : ${r.extraInDb.length ? r.extraInDb.join(", ") : "none"}`,
    `verdict         : ${r.verdict}`,
  ];
  if (!r.matches) {
    lines.push(
      ``,
      `Refusing to write. Both environments name the variable DATABASE_URL and both connect;`,
      `only the data tells them apart. Re-run against the database backing the published site.`,
    );
  }
  return lines.join("\n");
}

/**
 * Fetch live ids and compare. `queryIds` returns the connected database's artwork ids.
 * Throws nothing — returns a report the caller must act on.
 */
export async function checkProductionLiveness(queryIds, siteUrl = DEFAULT_SITE) {
  let liveIds = [];
  try {
    const rows = await (await fetch(`${siteUrl}/api/artworks`)).json();
    liveIds = Array.isArray(rows) ? rows.map((a) => Number(a.id)).filter(Number.isFinite) : [];
  } catch {
    liveIds = [];
  }
  let dbIds = [];
  try {
    dbIds = (await queryIds()).map(Number).filter(Number.isFinite);
  } catch {
    dbIds = [];
  }
  return compareToLive(liveIds, dbIds);
}

/** Refuse loudly. Callers that write production data should use this rather than the raw report. */
export async function assertProductionOrExit(queryIds, siteUrl = DEFAULT_SITE) {
  const report = await checkProductionLiveness(queryIds, siteUrl);
  console.log(describeLiveness(report, siteUrl));
  if (!report.matches) process.exit(3);
  return report;
}
