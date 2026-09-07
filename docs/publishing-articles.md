# Publishing blog articles

The live site is DB-driven: `/blog`, `/blog/:slug`, the sitemap, canonical, meta and Article JSON-LD
all come from a `blog_posts` row. Article **source** lives in git; a single command turns the source
into that row.

## Canonical source

One file per article:

```
research/articles/<slug>.md
```

It begins with a small frontmatter block, then the markdown body (the same subset the site renders —
`##`/`###` headings, `-` lists, `**bold**`, `[links](/path)`; **no tables**):

```
---
title: Wall Art Size Guide: How to Choose the Right Size for Your Space
slug: wall-art-size-guide
excerpt: One sentence — this becomes the meta description and the lead paragraph.
coverImage: /img/print/19/0          # optional; internal path or http(s) URL
coverImageAlt: A short description   # optional
---

Here's the short answer, before the detail: …
```

The file's name **is** the slug (`<slug>.md`), and the `slug:` field must match it. Do not put an
`# H1` in the body — the `title` becomes the page's H1.

## Preview (no writes)

```
npm run article:publish -- <slug> --dry-run
```

Validates the file and reports **CREATE** vs **UPDATE**, the slug/title/status, and which database
would be targeted (name + host only — never credentials). Writes nothing.

## Publish

```
npm run article:publish -- <slug>
```

It targets the database in `DATABASE_URL` for that process (the project's normal env convention — one
Neon database by default; `DEV_DATABASE_URL` isolates a dev database). It:

- creates the row if the slug is new (as a draft, then publishes — which stamps `publishedAt` once), or
- updates the existing row for that slug (title, excerpt, body, and cover when supplied), keeping the
  original `publishedAt` and leaving `origin` / measurement metadata untouched.

Running it again is safe and idempotent — it never creates a duplicate. It **fails closed** (exits
non-zero, writes nothing) if `DATABASE_URL` is unset or the file is malformed.

### Publishing to production

Run the same command in an environment whose `DATABASE_URL` points at the production database (the
project's existing production env). No credentials are stored in code; the script only uses the
`DATABASE_URL` it is given.

## Where the code lives

- `shared/articleSource.ts` — parse + validate the frontmatter and body (pure).
- `server/publishArticle.ts` — create/update using the existing storage methods and publish semantics.
- `scripts/publish-article.ts` — the `article:publish` CLI (arg parsing, fail-closed, safe output).

Older articles authored in the previous comment-header format are already live in the database and are
not reprocessed; only new/edited articles use this frontmatter format.
