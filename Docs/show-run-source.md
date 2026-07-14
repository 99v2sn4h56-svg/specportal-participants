# Show Run source

SpecCentral reads the Schools Spectacular Show Run as an authoritative, read-only production source.

- Spreadsheet ID: `1Hc_p0KAML6LS-EcD7rhuRsubMyQ7jcehDWU_g1yFgCU`
- Sheet gid: `1480106475`
- Owning Apps Script project: `1dO_ETfRe63atBcP7mPa9LfDYq4V5vrr-UKBanzDnvCrnyo0WWGiZr_gr`
- Stable natural key: `Item Number`
- Required columns: `Item Number`, `TITLE`
- Cache: shared ten-minute read cache
- Writes: disabled

`ShowRunService` detects columns by normalised headings and projects rows into canonical Item and Segment entities. Item Number remains the authoritative show-run identity. A separate title-derived participant item ID supports matching against current participant records without changing either source.

The initial source inspection found 42 headings, 366 data rows, 65 numbered items and 11 segment-total rows. Show-run items are available to platform search and the Administration source/health views. Refreshes invalidate the show-run, search, relationship and administration caches.

If the source schema changes, the adapter fails clearly when either required heading is absent. It does not write, renumber or otherwise modify the source workbook.
