# Deploying ArtistPortfolio (Replit) — no divergence, no shell

## Why divergence happened
Two things write `main`: **GitHub** (Career OS PR merges) and the **Replit workspace**
(Publish adds an empty "Published your App" commit). If that publish commit isn't on
GitHub when the next PR merges, `main` forks — and Replit's Pull is fast‑forward‑only, so
it refuses with a non‑fast‑forward / MERGE_CONFLICT and you'd reach for the shell.

## The fix (committed here — applies automatically, no shell)
1. **Rebase‑on‑pull** (`pull.rebase=true`, `rerere.enabled=true`). The publish commit is
   **empty**, so a Pull now *replays it on top of* the latest `main` cleanly instead of
   failing. Set automatically by the `prepare` npm script and the `[postMerge]` hook.
2. **Best‑effort auto‑push** in `scripts/post-merge.sh`: after each Pull it pushes the
   workspace up so `main` and the workspace stay **identical** (never fork). If the hook
   lacks push credentials it no‑ops — and rule (1) still keeps every Pull clean.

Proven with real git: a genuinely diverged `main` that a fast‑forward Pull rejects,
rebases cleanly under (1) with no conflict and no shell; the push leaves `local == origin`.

## Your workflow — buttons only, never the shell
Career OS opens a PR → **you merge it on GitHub** → in Replit:

**Pull → Publish → Push**

- **Pull** brings the merged change in (always succeeds now — fast‑forward, or a clean
  auto‑rebase of the last publish commit).
- **Publish** deploys.
- **Push** sends the "Published your App" commit up so `main` stays identical to the
  workspace. This is the guaranteed never‑diverge step and works regardless of anything
  Replit does internally.

**Fewer clicks:** if the hook's auto‑push has credentials (or you confirm Replit's Pull
honors the rebase config), you can drop the manual **Push** and just do **Pull → Publish** —
the automation keeps `main` clean for you.

## One‑time, before this takes over
Apply this from a **clean workspace** (workspace `main` == GitHub `main`). If the workspace
is diverged *right now*, do one final reconcile to get clean, then merge this PR — after
which the workspace self‑maintains and no future deploy needs the shell.
