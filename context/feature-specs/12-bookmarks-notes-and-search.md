# Bookmarks, notes, and search

Status: specified; not implemented.
Source: [Sibol CSE PRD](../../Sibol-CSE-PRD.md), FR-10.

## Scope and acceptance

Depends on published lessons, permitted question reviews, and owner authorization. Route: /bookmarks; integrate controls into lessons/practice/review. Search published lessons and permitted completed-question reviews by topic/keyword.

Acceptance:
- Bookmark lessons/questions and create/edit/delete private notes.
- Owner checks apply to every list/read/mutation; admins have no routine access.
- Search excludes unpublished content and unauthorized solutions, including active strict-mock items.
- Search/notes obey input and pagination bounds and sanitize displayed content.
- Provide useful empty/no-results/failure states without leaking content through snippets.
