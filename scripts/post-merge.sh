#!/bin/bash
# Runs automatically after every Pull (Replit [postMerge] hook). Its job is to make sure
# the workspace can NEVER get stuck in a diverged state after Replit's "Published your App"
# commit — so the owner never needs the shell.
set -e

# 1) SELF-HEALING PULLS. Replit's Publish adds an empty "Published your App" commit to the
#    workspace. With rebase-on-pull, a later Pull replays that empty commit on top of
#    origin/main cleanly (empty commits never conflict) instead of failing with a
#    non-fast-forward / MERGE_CONFLICT. Set once; persists in the workspace's .git/config.
git config pull.rebase true 2>/dev/null || true
git config rerere.enabled true 2>/dev/null || true

# 2) SCHEMA FIRST, AND FAST — the step that stops Replit deleting production.
#
#    Replit's publish syncs the DEVELOPMENT database onto production, so anything present in
#    production and missing from development is scheduled for DELETION. On 2026-08-20 that
#    proposed dropping the whole commerce schema.
#
#    The reason development was behind is this hook: it is capped at 20 seconds (see .replit),
#    `npm install` on this project takes longer than that, and `set -e` plus the kill meant
#    `db:push` never ran at all. Before the drizzle-kit prompt was fixed it would also have
#    blocked forever on a question no hook can answer.
#
#    So the cheap, idempotent, add-only sync runs FIRST, in about a second, using the pg
#    module already present in node_modules. Even if everything after it is killed, development
#    has what production has.
npm run db:sync || echo "[post-merge] db:sync did not complete — run 'npm run db:sync' before publishing"

# 3) Everything else is best-effort and must never abort the hook.
set +e
npm install
npm run db:push

# 4) KEEP ORIGIN AND THE WORKSPACE IDENTICAL. Push the publish commit up so main never
#    diverges in the first place. Best-effort: if the push credential isn't available in
#    the hook it simply no-ops, and step (1) still keeps future Pulls clean. Never blocks.
git push origin HEAD:main 2>/dev/null || true
