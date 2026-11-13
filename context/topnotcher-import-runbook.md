# Permitted Topnotcher content preparation

This is an offline administrator workflow, not a runtime quiz/grade integration. Provider questions are private content, not source-code fixtures. The operator confirmed permission in the conversation; written provider terms were not supplied. Preserve that distinction in provenance. Attach actual permission terms privately when available and apply any rate, attribution, storage or expiry conditions they specify.

## Commands

Create an operator-only permission JSON under `.cache/content-authoring/topnotcher/permission.json`, with `provider: "topnotcher"`, the actual `attestation`, `recordedAt` (UTC ISO datetime), `reference`, `attribution`, `scopes` (questions, answers, explanations, and images when permitted), `intervalMs` (at least 2000) and `maxRequests` (at most 200). Never describe user-attested permission as a provider-issued licence. Keep this file unchanged for a collection because snapshots bind its SHA-256.

With Bun on PATH:

```sh
pnpm content:topnotcher collect \
  --permission .cache/content-authoring/topnotcher/permission.json \
  --out .cache/content-authoring/topnotcher/bank-v1 \
  --rounds 2 --interval-ms 15000

pnpm content:topnotcher images \
  --permission .cache/content-authoring/topnotcher/permission.json \
  --out .cache/content-authoring/topnotcher/bank-v1

pnpm content:topnotcher prepare \
  --permission .cache/content-authoring/topnotcher/permission.json \
  --out .cache/content-authoring/topnotcher/bank-v1 \
  --level professional
```

The `prepare`/`content:import` commands are the legacy, track-specific workflow. Use the shared-bank synchronization below for new imports. This does not enable the second track's content launch. The collector covers the union of 16 provider topics, always sending `exam: "cse"`, count 50 and preloaded feedback. Track filtering uses the constant catalog (14 Professional / 11 Subprofessional topics).

Collection resumes from successful snapshots and a persisted request budget; increasing `--rounds` allows further sampling within the original budget. It stops on a provider error, three successive duplicate-only batches, or the request/round budget. After a 429/503 it records Retry-After (at least a one-minute cooldown); do not circumvent throttling or switch identities. Slower intervals may be selected without changing the permission record. Successful snapshots omit provider attempt tokens. Failure logs omit upstream bodies and answer content.

**There is no proof of complete-bank coverage.** Random quiz responses, even repeated duplicate-only responses, cannot establish the provider's inventory total. Reports explicitly set `completeBankVerified: false`. An authorised full export with an inventory manifest is needed to establish completeness. First collect breadth across topics rather than spending the request budget on only one topic.

## Review and native draft import

Raw snapshots retain question IDs, passages, explanations, keys, question/choice images and unsupported question types. Conflicting content/topic assignments under one ID are held. Choice shuffling is ignored during conflict comparison. All output stays under ignored `.cache/content-authoring/` with private permissions.

Preparation validates every converted row against `questionInput`, remaps provider choice IDs and the matching answer key together, and emits batches of at most 100 rows and 512 KiB (UTF-8). It does not guess missing keys, explanations, topic assignments or alt text. English and medium are explicit draft placeholders pending editorial language/difficulty review. General-information questions need an item-specific mapping to one of Sibol's four general topics. HTML and unsupported question types remain held; source text is never executed or silently stripped.

Use an annotations JSON keyed by the `key` in the preparation report, passing `--annotations FILE`. An annotation can supply reviewed `topicId`, `language`, `difficulty`, plain-text `prompt`, `passage`, `explanation` and question `image: { src, alt }`. An image annotation must name an already deployed local `/media/` raster with meaningful, reviewed alt text. The preparer does not deploy images or verify the semantics of their description; the publication checklist must check both.

Downloads allow only direct HTTPS URLs under Topnotcher's uploads directory; no redirects, SVG/HTML, arbitrary hosts or hotlinks are accepted. MIME and raster signatures must agree, responses have time/byte limits, and images use content-hashed filenames. The image manifest records missing/unsupported assets. Image files remain private staging artifacts until shared-bank synchronization registers them. The current player supports question images, image choices with zoom, fixed error-recognition labels and reorderable answers. Legacy preparation continues to hold formats it cannot adapt; use shared-bank synchronization for these. Provider attribution and copyright terms must also be checked before any separate media deployment.

Static asset downloads use a separate sequential interval (default one second, configurable with `--image-interval-ms`), a 500-asset / 128 MiB per-bank budget and 5 MiB per-response limit. A rate-limit response stops the image pass. Repeated runs verify cached file hashes and signatures before fetching missing assets. Original GIFs may be archived but are not accepted by the native question-media contract; the offline review links to them explicitly instead of autoplaying them. Do not deploy these originals without a separate accessible media adaptation. The CLI can generate an escaped, script-free private HTML pack with local images:

```sh
pnpm content:topnotcher review \
  --permission .cache/content-authoring/topnotcher/permission.json \
  --out .cache/content-authoring/topnotcher/bank-v1
```

With the intended database's `DATABASE_URL` available privately, preview the native import:

```sh
pnpm content:import \
  --manifest .cache/content-authoring/topnotcher/bank-v1/preparation-professional.json \
  --admin-email admin@example.com
```

Add `--commit` only for the intended database, after an encrypted backup. Preview is read-only. The command verifies the complete manifest's hashes, sizes, row counts and IDs before connecting, requires an existing administrator, skips existing stable external IDs without modifying them, and delegates writes to the existing audited `validateImport` / `commitImport` services. Rerunning resumes remaining rows; it never updates or publishes an existing version. Per-batch transactions and receipts expose partial completion. Concurrent imports can reject duplicates safely; do not run two operators against the same bank.

Drafts are visible only to administrators. Use the normal human review checklist and explicit publication operation. Collection/import does not grant editorial approval, change learner history or make the 300-reviewed-question/full-mock gate pass. Keep permission files, captures, annotations, keys, review packs, receipts and downloaded media outside the public GitHub repository and Docker build context.

The initial collection has a private `bank-manifest.json` covering the snapshots, image originals, review HTML and prepared batches. Verify its SHA-256 before approving that exact pack. A one-time age-encrypted tar of the bank and permission record is stored on the existing production backup volume under `/backups/content/`; its ciphertext hash and database-backup receipts are in the private operator directory. This content archive contains no learner records, is separate from the recurring 30-day database archives, and has no recurring/off-host content-backup job. Preserve the recipient's offline age identity for recovery; do not write decrypted bank files or keys to public paths.


## Shared-bank synchronization and coverage

Migration 10 adds shared track eligibility, native `choice`/`error`/`order` versions, pinned item arrangements, checked ordered responses, immutable hash-addressed raster bytes and administrator-only source snapshots. It preserves published legacy versions and historical attempts. This follows the supplied CSE Question Bank Import Guide using the existing Sibol taxonomy and services rather than introducing parallel learning tables.

Prepare without connecting to a database:

```sh
pnpm content:sync \
  --source .cache/content-authoring/topnotcher/bank-v1 \
  --out .cache/content-authoring/topnotcher/bank-v2 \
  --permission .cache/content-authoring/topnotcher/permission.json \
  --annotations .cache/content-authoring/topnotcher/classification-v2.json
```

After applying migration 10 and taking an encrypted backup, repeat with `--admin-email admin@example.com --commit`. `--retire-legacy` retires only old track-specific draft/reviewed versions, refusing published/disputed or pinned versions. It never deletes originals or changes the 80 published starter questions. Use one operator per bank. Per-batch transactions, import hashes and receipts support retries; a changed normalized revision creates a draft instead of overwriting a published version.

The command hashes captures, permission, annotation and image manifests, verifies each binary and stores all source records, including held records. Shared common-topic questions have one identity eligible for both tracks. Ordinary choice identity ignores display shuffle; keys resolve to canonical option content. Error labels remain fixed. Ordering answers retain the full correct sequence separately from the attempt's pinned shuffled arrangement. Ambiguous options, conflicting keys, unsupported media and missing explanations remain held. General Information requires item-specific classification; source provenance remains separate from the proposed study topic.

Raster bytes live in PostgreSQL `content_asset`, so normal encrypted database backups include them. `/api/content-media/<hash>.<ext>` authenticates every request; administrators can inspect source assets and learners need a reference pinned to their own attempt or permitted review event. Responses are private/no-store. No licensed question/media files enter Git or Docker build layers. Original GIFs remain archival attachments and cannot become playable media without an accessible static adaptation.

New image descriptions are explicitly pending. Use the native content editor to upload replacement PNG/JPEG/WebP, describe each question/choice image and confirm its description. Pending descriptions block editorial approval. Review keys, context, explanations, language/difficulty defaults and classifications before publishing through the existing checklist. Completing the import never publishes content.

`/admin/coverage` shows collected IDs, mapped source records, native drafts, published eligibility, holds and expected IDs for each track's source topics. Expand a topic to inspect preserved text, original keys/explanations and question/choice images. Learners have no access to this audit. `/practice` shows category cards and native subcategories; practice, short timed sets and review accept category/topic/source-focus filters. Full mocks retain the configured exam blueprint.

API samples always report completeness as unknown. To verify an authorized export/feed, supply `--expected-manifest FILE` containing `{ "mode": "export", "expectedIds": { "category/subcategory": ["source-id"] } }` (or mode `feed`). Every one of the 16 catalog topic keys must reconcile exactly, including missing and unexpected IDs. A high count or duplicate-only sampling plateau is insufficient evidence.

The full private-bank rehearsal imports twice and restores a custom-format dump to a separate empty database. It verifies all image byte hashes and native answer semantics independently against the preserved source. Temporary databases contain a synthetic operator, no learner records, and are removed after verification. See the progress tracker for current rehearsal and live synchronization evidence.
