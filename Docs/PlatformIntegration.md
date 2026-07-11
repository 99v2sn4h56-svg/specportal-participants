# Spec Central Platform Integration

## Application Flow

```
SpecCentral.html
  -> App.bootstrapState()
      -> App.registerCoreServices()
      -> App.bindApplicationEvents()
      -> App.registerDefaultSearchProviders()
  -> App.services.request("config")
      -> portalGetSpecCentralConfig()
      -> DashboardService.getContext()
  -> App.services.request("portalData")
      -> portalGetPortalData()
      -> ParticipantService.getPortalData()
```

Pages consume `App.state`. Pages should not read spreadsheets directly and should not own long-lived data.

## Service Registry

Browser services register through:

```js
App.registerService(id, {
  label,
  serverFunction,
  owner
});
```

Current registered services:

| ID | Label | Server Function | Purpose |
| --- | --- | --- | --- |
| `config` | Dashboard | `portalGetSpecCentralConfig` | Staff context, dashboard context, announcements, timeline summary, service health |
| `portalData` | Participants | `portalGetPortalData` | Participants, schools, groups, cached photos |
| `calendar` | Timeline | `portalGetCalendarData` | Timeline event contract for Calendar and Rehearsals |
| `attendance` | Attendance | External URL for now | Attendance app link and future event metadata |
| `staff` | Staff | `portalGetStaffProductionTeam` | Staff Production Team records |
| `announcements` | Announcements | Included in config | Active operational announcements |
| `operations` | Operations | `portalGetOperationsData` | Protected operations overview, project tasks, integrations and diagnostics |
| `mediaTimeline` | Media | `portalGetMediaTimelineData` | Protected media timeline data |
| `photos` | Profile Photos | `portalGetStudentPhotos` | Headshot map and future photo prefetch |

All full-page server calls should use `App.services.request()`. It provides success, failure, timeout, service status updates, simple client memory caching, and event emission.

## Shared State

`App.state` owns:

- current user, module, page, permissions
- loaded service flags and system status
- service cache and timestamps
- participants, schools, groups, photos
- rehearsals, calendar data, attendance URL/events
- project and media data
- recent searches and recently viewed records
- selected participant, school, group, item, teacher, event and staff records
- navigation history
- dashboard context and dashboard stats

## Search Registry

```
App.SearchRegistry.search(query)
  -> participants provider
  -> schools provider
  -> groups provider
  -> items provider
  -> teachers provider
  -> staff provider
  -> timeline provider
```

Search providers return:

```js
{
  resultType,
  title,
  meta,
  score,
  providerId,
  providerPriority
}
```

`getParticipantResults()` remains as a compatibility wrapper for the Participants page.

## Application Events

Current emitted events:

| Event | Emitted When |
| --- | --- |
| `service:loading` | A registered server request starts |
| `service:loaded` | A registered server request succeeds |
| `service:error` | A registered server request fails or times out |
| `search:providers-ready` | Search providers are rebuilt |
| `participant:selected` | Participant result/profile is opened |
| `school:selected` | School result/profile is opened |
| `group:selected` | Group result/profile is opened |
| `item:selected` | Item result/profile is opened |
| `teacher:selected` | Teacher result/profile is opened |
| `event:selected` | Timeline event is opened |
| `staff:selected` | Staff result/profile is opened |
| `dashboard:refresh` | Dashboard stats/context should refresh |

Future modules should emit events instead of directly calling unrelated components.

## Timeline Event Contract

Timeline events should use this shared shape:

```js
{
  id,
  title,
  event,
  type,
  rehearsalType,
  venue,
  date,
  dateKey,
  start,
  finish,
  participants,
  schools,
  groups,
  items,
  staff,
  allocatedStaffCount,
  attendanceEvent: {
    sheet,
    status,
    participantCount,
    markedCount,
    outstandingCount,
    lastUpdated
  },
  attendanceStatus,
  colour,
  status,
  sourceRow,
  source,
  raw
}
```

Fields not yet available from Timeline or Attendance are returned as `null`, empty arrays, or `"Not connected"` rather than fabricated values.

## Cache Contract

Current browser cache:

- `serviceCache`: short-lived in-memory results for lazy-loaded services.
- `cacheTimestamps`: last successful service load time.
- `localStorage specCentralSearchHistory`: recent global searches.
- `localStorage specCentralRecentlyViewed`: recently opened records.

Current server cache:

- `ProfilePhotoService` caches the Drive headshot map in chunked `CacheService` entries.

## Integration Progress

Completed:

- App now owns full-page runtime state.
- Service Registry exists.
- Search Registry facade exists.
- Dashboard context has a service owner.
- Status ribbon consumes central system state.
- Timeline event objects include attendance metadata placeholders.
- ProfilePhotoService has additive photo lookup/prefetch/cache wrappers.

Remaining:

- Share the sidebar and full-page search implementation.
- Cache item and teacher aggregates after portal data load.
- Connect real Timeline workbook fields beyond existing `RehearsalService` coverage.
- Connect Attendance event metadata without changing Attendance behaviour.
- Connect real Project Management and Media Timeline sources when available.
