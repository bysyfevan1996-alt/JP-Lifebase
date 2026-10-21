# Japan Life Base

在日人们论坛 · JP-Lifebase

Live community: https://www.jp-lifebase.com/

## Current M3

M3 implements Markdown replies/images, versioned edits/history, conflict recovery, structured quotes, image lightboxes and explicit per-post translation. User content stays original until requested. Phone replies have a dedicated inline layout and full-screen writing mode; expanding/collapsing preserves the same text, quotes and uploads. Reply drafts are page-memory only. See `docs/M3_COMPLETION.md` and `docs/MOBILE_REPLY_WRITING.md` for current behavior and release evidence. First-version sections below are historical. M2 stable URLs, full server pagination/search and persistent reading progress remain pending.

Tool entry: https://jp-lifebase.com/denkikakaku

## First version

- Fixed header, collapsible left navigation, new topic / my posts / replies at left.
- Separate desktop, tablet and phone layouts in `dist/responsive.css`: fluid desktop content with an expanded sidebar from 1100px, drawer navigation below 1100px, and a dedicated phone layout at 760px and below. Keep the drawer breakpoint aligned with `drawerQuery` in `dist/app.js`.
- Tool entry links in the left navigation above Content; General chat channel at left; Contact us at the bottom.
- Hand-maintained Japanese, English, Korean, Simplified and Traditional Chinese interface and sample topics.
- First visit defaults to Simplified Chinese, with an optional browser-language suggestion. Explicit choices are saved locally and in the signed-in account. Other selected languages use labelled automatic interface translation.
- Persistent accounts, login sessions, topics, replies, personal posts/reply notifications, contact submissions and reporting API.
- Email verification before registration, six-digit codes, a server-enforced 180-second resend cooldown, and password recovery for verified email addresses.
- Optional account avatars; without an uploaded picture, the nickname supplies a stable initial and background color.
- Four clearly marked sample topics. Reply counts come from stored replies, with no invented activity.

## Runtime

Node.js 24+, built-in HTTP, crypto and SQLite; no package installation or build step.

`npm start` starts the server on `127.0.0.1:8797`. The default local data directory is `data/`. For a local HTTP preview, set `COOKIE_SECURE=0`; the deployed HTTPS service keeps secure cookies enabled.

`npm test` runs isolated server integration checks. No production data or provider key is used by these checks.

The public frontend is in `dist/`; HTTP/session/database code is in `server.mjs`, account flows in `auth.mjs`, mail delivery in `mailer.mjs`, avatar validation in `avatar.mjs`, topic creation and retry receipts in `topic-posting.mjs`, and translation caching in `translation.mjs`. VPS installation, backup and administration scripts are in `ops/`.

## Post composer (phases 2–3, deployed October 21, 2026)

The working tree includes the independent desktop/phone composer in `dist/composer.js` and `dist/composer.css`, five maintained interface languages, shared safe Markdown preview/detail rendering in `dist/markdown.js`, and account-scoped seven-day browser drafts in `dist/compose-drafts.js`. Drafts remain in this browser, rather than syncing across devices. Storage failures and another window's changes require explicit recovery; they must not claim a successful save or silently replace the current text.

New posts explicitly use Markdown; old posts and replies remain plain text. Additive migration records `topics.body_format` and account-scoped `topic_create_requests` receipts. Retrying the same request returns its existing topic; a changed payload conflicts, and hidden/deleted topics are not recreated. The composer freezes an unconfirmed submission until its result is checked. A changed server account cannot publish the previous account's draft. Markdown bodies are preserved in their source language during automatic translation.

Phase 3 adds a searchable maintained tag catalog (up to five per topic), public tag labels and server-side filtering before the 250-topic response limit. JPEG/PNG/WebP originals up to 5 MiB are rewritten in the browser as metadata-free static PNGs, bounded to 2048px on the longest side, then independently checked by the server. Up to five images are kept in selection order and displayed as a gallery after the post body. Arbitrary remote Markdown image URLs remain unsupported.

Images use `topic_attachments` in the same SQLite database, so the existing backup includes their bytes and ownership. Pending images are author-only, expire after seven days without renewal, and support safe retry/removal. Publish binds images and tags inside the topic transaction. Browser drafts store only tag IDs and confirmed attachment IDs; an unfinished file must be selected again after a reload, with an explicit warning. Missing/expired images block a fresh publish until the user removes or replaces them.

These phases were deployed to the existing VPS as release `20261021T022645Z`, with static asset version `20261021022413677`. All 83 tests passed locally and again under the VPS service account before deployment. Migration against a private copy of the actual database preserved all 14 existing tables; production checks confirmed the original records and configuration were unchanged. No production test account or post was created. Evidence and remaining device checks are in the historical local deployment record; the maintained summary is in `docs/IMPLEMENTATION_PROGRESS.md`; implementation history is in the phase 2 and phase 3 records.

## Search engine sitemaps

`GET /sitemap.xml` and `/robots.txt` are served directly, with GET and HEAD support. Each hostname lists only its own canonical public pages: `https://www.jp-lifebase.com/sitemap.xml` lists the community homepage; `https://jp-lifebase.com/sitemap.xml` lists the electricity tool. Local preview uses the community sitemap. Robots declares the corresponding sitemap and excludes API, account and administration routes from crawling (access control remains enforced by the server).

Topic URLs currently use `/#topic=<id>` and are deliberately excluded: fragments do not identify separate documents for sitemap indexing. `/t/<id>` still lacks frontend detail routing and must not be advertised as a public permalink until implemented. Account pages, private views, the moving-tool placeholder and filter variations are also excluded. No artificial modification dates are generated.

## Deployment

The active deployment is on the user's VPS, with a dedicated `jplifebase` service account and SQLite data directory. Cloudflare proxies both hostnames through the existing tunnel. The existing `.openai/hosting.json` identifies the earlier private design preview; this deployment does not use Sites hosting or its database.

See `ops/README.md` for service names, backup, rollback and operator administration. Private keys, API tokens, passwords, sessions and production database files must stay outside this repository.

## Current boundaries

The electricity tool uses verified historical monthly rates and a versioned calculation engine; see `denki/README.md` for coverage and evidence. The moving tool remains in preparation. Contact messages are stored for the operator; email forwarding is not configured. Arbitrary file attachments, remote Markdown images and cross-device drafts are not implemented. The administrator interface is at `/admin`; public registration cannot grant administrator privileges. Existing accounts retain their privileges and must confirm their original password before verifying their email; an unverified legacy email cannot reset a password.

## Upgrade baseline M0

Schema adoption is tracked in schema_migrations through the frozen schema.mjs baseline. HTTP topic deletion now hides reversibly, preserving replies, images, tags and retry receipts; administrators restore topics. Operator hide/restore commands require an explicit existing administrator actor.

Release packages are generated by ops/build-release.mjs, with per-file and aggregate SHA-256 checksums. Production requires a matching manifest; /api/health identifies the actual release, source, schema and tariff dataset. The installer tests a copy of a real online backup and an isolated candidate before switching. Unknown/incompatible old releases are not restored automatically, and code recovery never overwrites the database.

See docs/CODEBASE_AUDIT.md, docs/FEATURE_GAP.md, docs/IMPLEMENTATION_PLAN.md and docs/IMPLEMENTATION_PROGRESS.md. M0 is a historical baseline. M1 implements first-visit Simplified Chinese and account preferences; user-triggered post translation remains M3.

## V1.1 reading navigation

The V1.1 user release (application 0.2.1) adds topic navigation: a right rail on wide screens, a compact sticky bar on smaller desktop/tablet screens, and two bottom actions on phones. Readers can jump to the first or latest replies, focus the existing reply input, and return to their previous paragraph in this page. Original posts remain expanded. This is not persistent reading progress or the full M2/M3 feature set. Details and the published announcement are recorded in `docs/V1.1_READING.md`.

## Dedicated repository

The maintained source repository is https://github.com/bysyfevan1996-alt/JP-Lifebase. The repository contains the complete VPS application, tests, official tariff evidence and maintenance documentation. Runtime databases, private configuration, keys, test output and generated release archives are excluded. The existing remote initialization history is retained.

## M1 language and moderation

M1 adds account language preferences, manually checked five-language interface dictionaries, report processing, mute/ban controls for member accounts and paginated audit history. Administrators cannot restrict themselves or other administrators. Bans revoke sessions; muting prevents community content writes but permits reading and account maintenance. Private moderation data never enter translation requests.

The exact execution, test counts and deployment status are recorded in docs/IMPLEMENTATION_PROGRESS.md. Post translation, stable topic links, reading progress and notifications remain later milestones.
