# Search Architecture

## Current Search Surfaces

Spec Central has two client search implementations:

- compact sidebar search in `Portal/Pages/Search.html`
- full-page search providers inside `SpecCentral.html`

Both use the same server data bundle from `portalGetPortalData()`, but they build and query indexes differently.

## Sidebar Search

Sidebar search currently builds indexes after data load:

- participants by school
- participants by item
- participants by teacher
- groups by school
- groups by item
- participant search index
- item search records

This gives the sidebar decent responsiveness once loaded.

## Full-Page Search

Full-page search currently uses provider functions:

- participants
- schools
- groups
- items
- teachers
- staff
- timeline

The provider contract is useful, but some providers still rescan or rebuild maps per query.

## Target Indexes

After participant data loads, the full-page app should build:

- participant search records
- school records with aggregate participant counts
- group records
- item records
- teacher records
- staff records where permitted
- participant ID map
- photo key map

Search providers should query these cached indexes rather than rebuilding maps on every keystroke.

## Ranking Rules

Preserve current ranking:

- people/name matches should rank ahead of schools when a person-like query is entered
- exact/prefix matches should beat loose substring matches
- result type should remain visible through colour and pill labels

## Performance Rules

- debounce input
- do not call Apps Script per card
- do not rebuild item maps per query
- cap initial results
- support load-more later
- keep old result shapes compatible while migrating
