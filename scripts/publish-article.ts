/**
 * article:publish — the ONE supported way to publish a blog article.
 *
 *   npm run article:publish -- <slug>            create or update the published blog_posts row
 *   npm run article:publish -- <slug> --dry-run  validate + show CREATE/UPDATE, write NOTHING
 *
 * It reads research/articles/<slug>.md (frontmatter + markdown body), validates it, and reuses the
 * site's storage + publish semantics (see server/publishArticle.ts). It targets whatever database
 * DATABASE_URL points at for THIS process — the project's existing env convention (one Neon DB by
 * default; DEV_DATABASE_URL isolates dev). It FAILS CLOSED without DATABASE_URL rather than writing to
 * the in-memory preview store, and it never prints credentials.
 *
 * Run:  npm run article:publish -- wall-art-size-guide --dry-run
 */
import fs from "fs";
import path from "path";
import { hasDatabase } from "../server/db";
import { storage } from "../server/storage";
import { publishArticle } from "../server/publishArticle";

function out(s = "") { process.stdout.write(s + "\n"); }
function fail(msg: string): never { process.stderr.write("\n✗ " + msg + "\n"); process.exit(1); }

/** Database name + host ONLY — never the user, password, or query string. Mirrors db.ts's own logging. */
function safeDbLabel(): string {
  const raw =
    (process.env.NODE_ENV !== "production" && process.env.DEV_DATABASE_URL) || process.env.DATABASE_URL || "";
  if (!raw) return "(none — no DATABASE_URL set)";
  try {
    const u = new URL(raw);
    return `${u.pathname.replace(/^\//, "") || "(db)"} @ ${u.hostname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) fail("Usage: npm run article:publish -- <slug> [--dry-run]");

  const rel = path.join("research", "articles", `${slug}.md`);
  const file = path.join(process.cwd(), rel);
  if (!fs.existsSync(file)) fail(`No such article source: ${rel}`);
  const source = fs.readFileSync(file, "utf8");

  out(`article:publish — ${dryRun ? "DRY RUN (no writes)" : "PUBLISH"}`);
  out(`  source : ${rel}`);
  out(`  target : ${safeDbLabel()}`);

  if (!dryRun && !hasDatabase) {
    fail(
      "No DATABASE_URL — refusing to publish.\n" +
        "  Without it, storage is the in-memory preview and the write would be lost.\n" +
        "  Set DATABASE_URL to the target database (dev or production) and re-run.",
    );
  }
  if (dryRun && !hasDatabase) {
    out("  note   : no DATABASE_URL set — cannot check for an existing row, so CREATE/UPDATE below is a best guess.");
  }

  let result;
  try {
    result = await publishArticle({ slug, source, storage, dryRun });
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }

  out("");
  out(`  action                : ${result.action.toUpperCase()}${result.wrote ? "" : " (no write)"}`);
  out(`  id                    : ${result.id ?? "(new)"}`);
  out(`  slug                  : ${result.slug}`);
  out(`  title                 : ${result.title}`);
  out(`  status                : ${result.status}`);
  out(`  publishedAt           : ${result.publishedAt ?? "(stamped on first publish)"}`);
  out(`  publishedAt preserved : ${result.publishedAtPreserved}`);
  out("");
  out(
    dryRun
      ? "✓ dry run complete — nothing was written."
      : `✓ ${result.action === "create" ? "created" : "updated"} and published /blog/${result.slug}`,
  );

  // The pg pool keeps the event loop alive; exit cleanly once the work is done.
  process.exit(0);
}

main();
