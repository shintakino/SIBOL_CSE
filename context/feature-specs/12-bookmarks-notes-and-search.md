# Bookmarks, notes, and search

Status: implemented; backend and mobile Chromium verification passed.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-10.

## Scope and acceptance

Depends on published lessons, permitted question reviews, and owner authorization. Route: /bookmarks; integrate controls into lessons/practice/review. Search published lessons and permitted completed-question reviews by topic/keyword.

Acceptance:
- Bookmark lessons/questions and create/edit/delete private notes.
- Owner checks apply to every list/read/mutation; admins have no routine access.
- Search excludes unpublished content and unauthorized solutions, including active strict-mock items.
- Search/notes obey input and pagination bounds and sanitize displayed content.
- Provide useful empty/no-results/failure states without leaking content through snippets.

## Implemented decisions

`/bookmarks` has saved-item, private-note and keyword/topic search views, plus original permitted question-review routes. Lesson/player/review controls share owner-scoped targets. Search returns 20 items per kind/page, accepts 120-character keywords and escapes wildcard input. Notes accept plain text up to 10,000 characters and checked revisions; deleted text is cleared while revision tombstones prevent stale overwrites. Each owner may keep 1,000 active notes/bookmarks. Unavailable sources retain an owner-editable note/removable bookmark. All library/search/note access pauses during an active diagnostic or strict mock. Corrections reveal only the owner's permitted original version, with errata.

Verification covers other owners/admins, unpublished and uncommitted content, correction permissions, races/replays/deleted-note revisions, collection caps and disjoint pages, literal wildcard search, active strict guards, and mobile bookmark/note/search flows with axe scans. Final regression counts and remaining release gates are in the [tracker](../progress-tracker.md).
