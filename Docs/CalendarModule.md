# Calendar Module

## Purpose
The Calendar module shows Timeline/Rehearsal data in month and agenda/list views.

## Current Implementation
- Page: `Portal/Pages/Calendar.html`
- Data source: `TimelineService.getCalendarData()`
- Backend wrapper: `portalGetCalendarData()`
- UI: month grid, agenda view, today/previous/next controls, type and venue filters, event detail panel.

## Service Contract
`TimelineService.getCalendarData()` returns:

```js
{
  source,
  generatedAt,
  events: [{
    id,
    title,
    date,
    dateKey,
    start,
    finish,
    venue,
    type,
    rehearsalType,
    groups,
    items,
    allocatedStaffCount,
    attendanceStatus,
    colour,
    sourceRow,
    source
  }]
}
```

## Placeholder Rules
If the Timeline sheet cannot be read, `TimelineService` falls back to clearly labelled placeholder rehearsal records. The UI must not present fallback data as live production data.

## Future Mapping
Connect allocated staff, attendance status, event links, and item/group references from Timeline and Staff Production Team once those columns are final.
