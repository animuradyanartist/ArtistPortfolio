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

# 2) App setup (unchanged).
npm install
npm run db:push

# 3) KEEP ORIGIN AND THE WORKSPACE IDENTICAL. Push the publish commit up so main never
#    diverges in the first place. Best-effort: if the push credential isn't available in
#    the hook it simply no-ops, and step (1) still keeps future Pulls clean. Never blocks.
git push origin HEAD:main 2>/dev/null || true
