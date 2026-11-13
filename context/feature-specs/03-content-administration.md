# Content, profiles, imports, and review

Status: implemented and locally verified on 12 November 2026. See [progress tracker](../progress-tracker.md) for evidence and remaining content/release gates.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-11; PRD §§4, 8, 13.

## Scope and acceptance

Depends on foundation and admin authorization. Routes: /admin/content, /admin/imports, /admin/profiles, /admin/reports, /admin/users. Use draft → reviewed → published → retired for lessons/questions. Initial self-review requires an explicit checklist and audit record.

Question records include stable ID/version, level, topic, language, difficulty, prompt, stable-ID choices, one key, explanation, optional passage/media, authorship/rights, relevant references, reviewer/date. Assign one primary scoring topic. Sanitize rich text and media references.

CSV/JSON import provides preview and row-level errors; reject duplicate external IDs, invalid keys, empty explanations, unsupported topics. Validation/commit never silently publishes; publication is explicit. Record import file hash, operator, validation, and status.

Profiles are versioned with source URL/title, publication date when known, verification date, and reviewer. PRD baseline: Professional 150 scored items/190 minutes; Subprofessional 145/160. Exclude the 20 EDQ items from app scoring. Both cover verbal, numerical, general information; Professional adds analytical and Subprofessional clerical. Exact topic breakdown follows PRD §4; blueprint quotas are editorial, not official distributions. Reverify an applicable announcement before activating a new cycle; never auto-publish scraped rules.

Acceptance:
- Only admins can author/review/publish/import/change profiles or roles.
- Published versions are immutable; corrections create versions with visible errata on historical results.
- Wrong-answer reports can quarantine content; exclude disputed/retired items from future selection/review.
- Original scoring is preserved; any rescore is explicit, audited, and distinguished.
- Inventory checks enforce a lesson/example per enabled topic, 300 reviewed unique questions per launched level, 30 per major area, all quotas, and two nonoverlapping complete mock forms.
- Rights and review metadata are required; no leaked/confidential reconstructed items or automatic AI answer keys.
