# VPS deployment

## Current M3 / phone writing

M3 adds frozen migration 3, versioned reply edits and history, structured quotes, reply image binding, explicit content translation and operator release ordering. The phone editor can move the same reply form into a native full-screen dialog, with visual-viewport tracking and reversible collapse. Details and current release evidence are in `../docs/M3_COMPLETION.md` and `../docs/MOBILE_REPLY_WRITING.md`. The M0/M1 sections below are historical baselines, not descriptions of remaining M3 work. Schema-2 releases are not automatic recovery candidates for a schema-3 database. Package all assets using the inventory builder; do not hand-copy an old file list.

## Upgrade M1

The verified pre-M1 runtime is `20261021T070826Z-denki-v5`, application `0.1.1`, schema 1 and tariff dataset `2026-10-21.tokyo-v5`. Preserve the newer tariff source: the M0 notes below are historical.

M1 adds migration 2 for account language preferences, member mute/ban flags and report processing state. Version 1 remains frozen. `community-policy.mjs` enforces restrictions; `community-admin.mjs` provides report processing, restriction controls and paginated audit reads. Do not test these operations on production members. The current administrator and all other administrators are protected from restriction controls.

First interface visit defaults to Simplified Chinese with a browser-language suggestion. Five dictionaries remain maintained by hand. Preferences are persisted per account and explicit guest choice, with account-bound writes and stale-response protection. Post click-to-translate belongs to M3; changing interface language does not batch-translate user posts in the page.

Migration rehearsal checks existing business columns unchanged, verifies the entire previous migration ledger as an immutable prefix, and permits the next entry. It restores and compares the complete post-migration database, including new tables and columns. Schema-1 code is not an automatic recovery candidate for schema 2.

Run `node ops/check-i18n.mjs`, the complete Node suite and Python installer checks before publishing. New required modules include `migration-v2.mjs`, `community-policy.mjs`, `audit-cursor.mjs`, `dist/preferences.js` and `dist/language-ui.js`. Refresh static asset versions before generating the release.

The dedicated GitHub repository contains source and public tariff evidence; exclude environment files, keys, databases, generated archives and private verification copies. GitHub checks do not deploy production automatically. Actual release and verification results are in `../docs/M1_COMPLETION.md`.

## Existing deployment details

Domain: `www.jp-lifebase.com` for the community; the apex also serves it. Tools use `/denkikakaku` and `/moving-checklist` on both hostnames. The canonical homepage is `https://www.jp-lifebase.com/`.

Server: ConoHa `160.251.179.158`, existing verified SSH deployment entry point. The new service is isolated from the existing websites.

- Service: `jplifebase.service`
- Listener: `127.0.0.1:8797` only
- User: `jplifebase`
- Code: `/srv/jplifebase/current`, symlink to an immutable release
- Data: `/var/lib/jplifebase/community.sqlite` (WAL)
- Private configuration: `/etc/jplifebase/app.env`, root-only
- Backup: `jplifebase-backup.timer`, daily at 03:30 Japan time with jitter
- Backup directory: `/var/backups/jplifebase`, 14 SQLite snapshots

`install-vps.py` installs a release and service. `route-vps.py` checks application health, saves the current tunnel configuration, validates a new configuration, and adds only the two new hostnames. It preserves all existing hostname routes.

Both proxied DNS CNAMEs point to the existing tunnel `7f977808-e647-4b57-bd71-180ccda8034b.cfargotunnel.com`. No application port is exposed to the public network.

## Sitemaps (deployed October 21, 2026)

Release `20261021T030013Z-sitemap` extends `20261021T025120Z-denki-notes` with only `server.mjs` and `sitemap.mjs`. An online database backup ran before switching; both public HTTPS `/sitemap.xml` endpoints now return 200 XML and each hostname's `robots.txt` declares its matching map. The homepage, electricity page, health endpoint and service checks passed. All 84 local isolated tests passed before deployment. Search Console submission and Google's next fetch are separate steps; deployment does not prove indexing.

Include `sitemap.mjs` in every future release archive alongside `server.mjs`. The installer now rejects an archive missing this module before creating or switching a release. Do not publish the old package file list without adding it.

## Translation

Japanese, English, Korean and Chinese (Simplified and Traditional) interface dictionaries and the four marked sample topics are maintained by hand. First visit defaults to Simplified Chinese; browser language is a suggestion until explicitly selected. Other selected interface languages use the server-side translation provider and carry an automatic-translation notice. User posts retain their original text in the frontend regardless of interface selection; click-to-translate is M3. Unavailable interface translations retain their source text and show a failure notice. The older explicit public translation API remains compatible.

Only public interface text and public topics are sent for translation. Contact submissions, passwords, sessions and private reply notifications are not sent. The translation provider is `gpt-4.1-mini` through the existing OpenAI account. The service receives only a dedicated translation environment file, not the unrelated applications' settings. The daily translation input limit is 200,000 characters and concurrency is two. Secrets are never copied into this repository.

## Administration

Public registration always creates a member account. After the intended owner has registered, an authorized operator can run `node /srv/jplifebase/current/ops/admin.mjs promote <registered-email>` on the VPS. No public registration can create an administrator.

The management screen is `/admin`. The forum shows its entry only to an authenticated administrator, and every `/api/admin/*` request enforces the role on the server (anonymous 401, ordinary member 403). Login returns through the exact allowed `/admin` path. The screen provides real counts, topic search, reversible hide/restore and pinning, member mute/ban controls, report processing, paginated audit history and contact submissions. All administrator accounts are protected from restrictions. No permanent-delete, role-change or password-reset control is exposed in this screen.

`community-admin.mjs` adds `topics.hidden` and `admin_actions` without replacing existing records. Hidden topics are excluded from public lists, direct detail requests, replies/reports, personal topics and reply notifications. Restoring preserves the original topic and replies. Moderation records the operator and before/after flags without copying private message content. All management data is rendered as text and never submitted for automatic translation; only the static interface dictionary may be translated for other system languages.

The operator can also inspect contact submissions and reports with `admin.mjs inbox`. Contact messages are stored in the database; contact-form email forwarding is not configured. `admin.mjs hide-topic <id> <registered-admin-email>` and `restore-topic` use the same reversible, audited transaction as HTTP moderation. Missing or non-admin actors are rejected. HTTP DELETE also hides instead of erasing records; use the management screen to restore.

## Account mail and avatars

Resend sends account mail from `Japan Life Base <no-reply@jp-lifebase.com>`, using the verified `jp-lifebase.com` domain in Tokyo. The sending-only API key is restricted to this domain. `/etc/jplifebase/app.env` is root-owned, mode 0600, and contains `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` and a stable random `AUTH_TOKEN_SECRET`. Preserve this secret across restarts; it authenticates verification challenges. Never include its value or the provider key in logs, release archives or source control.

Registration and recovery use six-digit codes valid for ten minutes, with five incorrect attempts and a 180-second resend cooldown. Limits and cooldown state persist in SQLite. Only provider acceptance activates a replacement code; a failed resend preserves the previous code. Verification grants expire after fifteen minutes and are single-use. New passwords are 12–128 characters, preserving intentional spaces. Resetting a password revokes existing sessions.

Schema migration is additive. Existing accounts retain roles, sessions and content, and are marked as legacy accounts with unverified email. They can continue using their original password and verify the original email from the account screen after re-entering that password. An unverified legacy email cannot be used to reset a password. Missing mail configuration must produce a recoverable service error, never unverified registration.

Avatar uploads accept JPEG, PNG or WebP up to 5 MB in the browser, crop to a square PNG and strip the original metadata. The server accepts only validated PNG images up to 256×256 and 90 KB. Images stay in the existing SQLite database and are included in the normal backups. Removing a picture restores a nickname-based avatar; no third-party avatar service is used.

The test-only file outbox requires `NODE_ENV=test` and `JPL_TEST_MAIL_OUTBOX=1`. It writes only inside the isolated test data directory. Never enable it in production or ship its files. Integration test processes remove inherited mail and translation credentials.

The October 20, 2026 configuration check sent the one authorized test message to the owner's Gmail address. Resend reported Delivered. Enforced TLS is enabled. Cloudflare Email Routing now receives `admin@jp-lifebase.com` and forwards it to the owner's verified Gmail address, with an active routing rule. The owner's existing verified account now uses that login address and has the admin role; its password, avatar, sessions and content were preserved. The management screen was verified with the existing owner session. This domain receiving rule does not add contact-form email delivery. Future maintenance should check actual account state instead of assigning privileges based only on this historical note.

## Restore / rollback

Before restoring data, stop `jplifebase.service` and preserve a fresh full copy of the database including its WAL/SHM files. Restore a verified backup, set ownership to `jplifebase`, then start only this service. Do not restore other websites' databases or routing.

For code recovery, use a retained release with a verified manifest declaring the same schema version; older or unknown releases are not automatic recovery candidates. Prefer a forward repair when compatibility is not proven. The tunnel configuration prior to adding this app is saved under `/var/backups/jplifebase/cloudflared-before-*.yml`.

The October 2026 account release adds columns to `users`. Older releases that insert seven positional values into `users` cannot register accounts against this migrated database. For this upgrade, prefer a forward fix or a reviewed migration-compatible recovery release. A successful electricity health check after switching old code does not verify account recovery. Do not restore a database snapshot over new accounts or posts as an automatic code-rollback step.

## First-version limits

Registration, email verification, password recovery, avatars, sessions, public topics/replies, personal topic and reply lists, reporting API, contact storage, the management screen and topic image attachments are implemented. Reply email notifications and private messaging remain future work. The moving tool is still in preparation. The electricity tool is implemented with the coverage and limits documented in `denki/README.md`.

## Electricity updates

Package `denki/` together with `dist/`, `server.mjs`, `auth.mjs`, `mailer.mjs`, `avatar.mjs`, `community-admin.mjs`, `topic-posting.mjs`, `topic-attachments.mjs`, `topic-image.mjs`, `translation.mjs`, `package.json` and `ops/`. The `dist/` package includes the independent desktop/tablet/phone layout in `responsive.css`, all `admin*` files, and the composer, draft, Markdown, tag catalog, image processing and composer-language modules. The dataset is imported into `denki_datasets` in the existing community database, so the daily database backup includes all imported historical tariff versions. A version identifier cannot be reused with changed content. Missing months and incomplete plans must remain excluded from rankings. Publishing another month requires primary-source verification and the calculation tests; no live scraper modifies published prices.

The M0 updater verifies the exact release/source/schema identity plus community reads, anonymous session/admin boundaries and the electricity catalog. It may recover only to a schema-compatible manifested release; it never restores the database automatically. Existing tariff snapshots are append-only and do not require a destructive migration.

## Composer phases 2–3 (deployed October 21, 2026)

The local composer release adds `topics.body_format` with a `plain` default and a separate `topic_create_requests` receipt ledger. Both are additive and included in existing SQLite backups. Keep receipts when topics are hidden or deleted: they prevent delayed retries from creating another topic. Existing rows and replies remain plain text; new Markdown posts require the matching frontend renderer. A code rollback must retain these columns and receipts and must use a compatible renderer; restoring an old database over newer posts is not a rollback strategy. Browser drafts are local to each account/device and are not part of the server backup.

Release `20261021T022645Z` replaced `20261020T131306Z`, using asset version `20261021022413677`. All 83 tests passed locally and on the VPS with the service account and a 192 MiB JavaScript heap. Migration of a private production-database copy preserved the existing 14 tables. Online backups ran before and after the switch; the later backup includes the new schema and passed SQLite integrity and foreign-key checks. Public HTTPS assets match the packaged files, original topics remain plain text, and tag filtering and anonymous access boundaries passed. Full authenticated posting, images, retries, moderation and image backup restoration were checked with isolated data, not production test posts. See `../../../design/composer-v3/上线验证记录.md`.

The previous release uses named-column user/topic inserts and remains retained, but it lacks the Markdown renderer, image route and retry receipts. It is not a complete functional rollback after new-format posts exist. Prefer a forward fix or a reviewed compatible recovery release. No production rollback or database restoration was performed; never overwrite newer content with the pre-release backup as an automatic code rollback.

## Composer phase 3 storage and backup

Topic tags use `topic_tags`, with a maintained catalog in `dist/topic-tags.js`. Topic images use `topic_attachments` in the same SQLite database, including validated PNG bytes. The existing `node:sqlite` backup in `ops/backup.mjs` therefore includes image bytes, ownership, publish association and order together with the topic. No separate public upload directory, symlink or filesystem backup needs to be installed. Restore and run a compatible phase 3 service before testing the image URLs; an old service does not know this route.

The browser accepts JPEG, PNG and WebP originals up to 5 MiB and 40 million pixels, strips metadata by rewriting pixels, and sends a static PNG with a longest side of 2048 or less and a maximum size of 5 MiB. Server validation independently checks the PNG structure and bounded decompression. Each topic can attach at most five images. Raw upload uses a separate authenticated `image/png` endpoint; the ordinary JSON body limit stays unchanged.

Unpublished images are author-only and expire after seven days without a retained draft reference; retain requests refresh their deadline. Startup, requests and an hourly cleanup remove expired unpublished data. Published images have no draft deadline and remain only while their associated topic exists. The image endpoint reads the current topic visibility and uses no-store caching: hiding a topic blocks new image requests, restoring it makes them available again. Hard topic deletion cascades its images; temporary-image removal cannot delete a published image. Avoid the legacy SQL/CLI deletion paths that omit foreign-key enforcement.

The October 21 release verified member/anonymous attachment access, hide/restore, an image post, request replay and restored image bytes in isolated environments. Static asset versions include the composer controller and its image/tag dependencies. Real iOS/Android keyboards, IME candidate selection and assistive technology still require device checks; deployment does not imply those checks passed.

## Upgrade M0 (October 21, 2026)

The verified starting release was 20261021T055009Z-denki-v4, with dataset 2026-10-21.tokyo-v4 and 115 passing pre-change tests. The old health version was not a reliable deployment identity.

Runtime schema is now managed by schema.mjs and migrations.mjs. Version 1 adopts the existing tables and is frozen: add a new numbered migration for subsequent DDL. The ledger stores name/checksum/time and fails closed for changed, gapped or future migrations. Standalone constructor migration defaults remain for isolated module use; server startup uses the central runner.

Build each immutable release with node ops/build-release.mjs <YYYYMMDDTHHMMSSZ-label>, then archive the generated artifacts/releases/<id> directory, including release-manifest.json. Do not use the old hand-maintained tar file list: the updater rejects missing, altered, unlisted, linked or unsafe files. Production startup verifies actual source against the manifest. Health returns version, releaseId, sourceSha256, schemaVersion and datasetVersion, without credentials.

Before switching, the updater runs the online backup, tests a private copy under the service identity with a 192 MiB heap, checks every existing table's records, repeats migration, restores a second backup and checks integrity/foreign keys. Image BLOBs are hashed row by row. A shadow service has a loopback random port and no mail or translation credentials. Only after these checks pass does the existing service restart. Restart failures use the same compatibility recovery gate as health failures. The updater does not read another application's keys or change DNS, routing, systemd units or configuration.

Backup now checks foreign keys as well as SQLite integrity and writes a matching .sha256 sidecar. The 14-snapshot retention remains. JPL_DB and JPL_BACKUP_DIR overrides are for explicitly isolated validation; production leaves them unset.

Run node --test tests/*.test.mjs and Python -B tests/installer_test.py. Tests include migration rollback/checksum/future-version refusal, recoverable deletion and CLI actors, image preservation, source tamper detection, backup checksums, and simulated restart failure/recovery. The final execution and deployment evidence is in ../docs/IMPLEMENTATION_PROGRESS.md.
