/** Permission-scoped participant projections. Complete records remain detail-only. */
const ParticipantProjectionService = (() => {
  const LIST_FRESH_SECONDS = 5 * 60, LIST_RETAIN_SECONDS = 30 * 60;
  const PAGE_FRESH_SECONDS = 5 * 60, PAGE_RETAIN_SECONDS = 30 * 60;
  const FILTER_FRESH_SECONDS = 15 * 60, FILTER_RETAIN_SECONDS = 60 * 60;
  const DASHBOARD_FRESH_SECONDS = 5 * 60, DASHBOARD_RETAIN_SECONDS = 30 * 60;
  const DEFAULT_PAGE_SIZE = 50;
  const DASHBOARD_SNAPSHOT_PROPERTY = "SC_DASHBOARD_PARTICIPANT_SUMMARY_V2";

  function getList(user, options) {
    const actor = user || UserContextService.getCurrent(), key = ProjectionContractService.cacheKey("participantList", {}, actor), started = Date.now();
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, LIST_FRESH_SECONDS, LIST_RETAIN_SECONDS, () => buildList_(actor), cacheOptions_("participantList", options));
    PerformanceTelemetryService.record("participants.list.request", Date.now() - started, { cache: cached.meta.cache, records: cached.value && cached.value.participants ? cached.value.participants.length : 0, payloadBytes: estimateBytes_(cached.value), projection: "participant-list-v2", isStale: !!cached.meta.isStale });
    return withRequestMeta_(cached.value, cached.meta);
  }

  function getPage(query, user, options) {
    const actor = user || UserContextService.getCurrent(), request = normalisePageQuery_(query), started = Date.now();
    const logicalKey = ProjectionContractService.cacheKey("participantPage", request, actor);
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(logicalKey, PAGE_FRESH_SECONDS, PAGE_RETAIN_SECONDS, () => buildPage_(request, actor), cacheOptions_("participantPage", options));
    const response = withRequestMeta_(cached.value, cached.meta);
    PerformanceTelemetryService.record("participants.page.request", Date.now() - started, { cache: cached.meta.cache, records: (response.participants || []).length, payloadBytes: estimateBytes_(response), projection: "participant-list-page-v2", isStale: !!cached.meta.isStale });
    return response;
  }

  function getFilters(user, options) {
    const actor = user || UserContextService.getCurrent(), key = ProjectionContractService.cacheKey("participantFilters", {}, actor), started = Date.now();
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, FILTER_FRESH_SECONDS, FILTER_RETAIN_SECONDS, () => buildFilters_(getList(actor).participants || []), cacheOptions_("participantFilters", options));
    PerformanceTelemetryService.record("participants.filters.request", Date.now() - started, { cache: cached.meta.cache, records: Object.keys(cached.value && cached.value.values || {}).reduce((sum, field) => sum + cached.value.values[field].length, 0), payloadBytes: estimateBytes_(cached.value), projection: "participant-filter-v1", isStale: !!cached.meta.isStale });
    return withRequestMeta_(cached.value, cached.meta);
  }

  function getDetail(studentKey, user) {
    const started = Date.now(), actor = user || UserContextService.getCurrent(), key = String(studentKey || "").trim();
    if (!key) throw new Error("A stable Student Key is required.");
    const participant = filterParticipantsForUser_(ParticipantService.getAll(), actor).find(item => String(item.studentKey || item.id || "") === key);
    if (!participant) throw new Error("Participant not found or outside your permitted scope.");
    const response = { participant: sanitiseDetail_(participant), generatedAt: new Date().toISOString(), projection: ProjectionContractService.contract("participantDetail").version };
    ProjectionContractService.validate("participantDetail", response);
    PerformanceTelemetryService.record("participants.detail.request", Date.now() - started, { records: 1, payloadBytes: estimateBytes_(response), projection: "participant-detail-v2" });
    return response;
  }

  function pageQueryKey(query) {
    const request = normalisePageQuery_(query);
    const base = ["participant-list-page-v2", "page=" + request.page, "pageSize=" + request.pageSize];
    if (request.search || Object.keys(request.filters).length) base.push("query=" + digest_(JSON.stringify({ search: request.search, filters: request.filters }), 16));
    return base.join(":");
  }

  function getDashboardSnapshot() {
    const key = ProjectionContractService.cacheKey("dashboard", { component: "participants" }, null), cached = PerformanceCacheService.peek(key);
    if (cached) return Object.assign({}, cached, { cache: "hit" });
    const stored = readDashboardSnapshot_();
    return stored ? Object.assign({}, stored, { cache: "durable-snapshot" }) : emptyDashboard_("Not warmed", "miss");
  }

  function rebuildDashboardSnapshot(options) {
    const started = Date.now(), key = ProjectionContractService.cacheKey("dashboard", { component: "participants" }, null);
    const result = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, DASHBOARD_FRESH_SECONDS, DASHBOARD_RETAIN_SECONDS, () => {
      const participants = ParticipantService.getAll(), categories = ParticipantService.getProductionOverview(participants);
      const snapshot = { categories, totalParticipants: participants.length, status: "Connected", generatedAt: new Date().toISOString(), projection: ProjectionContractService.contract("dashboard").version };
      ProjectionContractService.validate("dashboard", snapshot);
      PropertiesService.getScriptProperties().setProperty(DASHBOARD_SNAPSHOT_PROPERTY, JSON.stringify(snapshot));
      return snapshot;
    }, cacheOptions_("dashboard", options));
    PerformanceTelemetryService.record("dashboard.participant-summary.rebuild", Date.now() - started, { cache: result.meta.cache, records: result.value.totalParticipants || 0, payloadBytes: estimateBytes_(result.value), projection: "dashboard-v2", isStale: !!result.meta.isStale });
    return Object.assign({}, result.value, { cache: result.meta.cache, isStale: !!result.meta.isStale });
  }

  function warm() {
    const started = Date.now(), user = UserContextService.getCurrent();
    if (!user.email) throw new Error("An authenticated user is required to warm projections.");
    const dashboard = rebuildDashboardSnapshot({ refresh: true });
    const participantPage = AuthorizationService.hasCapability(user, "Participants.View") ? getPage({ page: 1, pageSize: DEFAULT_PAGE_SIZE }, user, { refresh: true }) : null;
    const filters = AuthorizationService.hasCapability(user, "Participants.View") ? getFilters(user, { refresh: true }) : null;
    const result = { generatedAt: new Date().toISOString(), dashboardRecords: dashboard.totalParticipants || 0, participantListRecords: participantPage && participantPage.participants ? participantPage.participants.length : 0, filterValues: filters ? Object.keys(filters.values || {}).reduce((sum, field) => sum + filters.values[field].length, 0) : 0, durationMs: Date.now() - started };
    PerformanceTelemetryService.record("projections.warm", result.durationMs, { records: result.participantListRecords, projection: "startup-projections-v2" });
    return result;
  }

  function warmShared() {
    const started = Date.now();
    // Canonical source cache is built once, then all shared projections reuse it.
    const canonical = ParticipantService.getPortalData();
    const dashboard = rebuildDashboardSnapshot({ refresh: true });
    const productionScope = { isAdmin: false, scope: { type: "production", values: [] }, capabilities: ["Participants.View"] };
    const page = getPage({ page: 1, pageSize: DEFAULT_PAGE_SIZE }, productionScope, { refresh: true });
    const filters = getFilters(productionScope, { refresh: true });
    const result = { generatedAt: new Date().toISOString(), canonicalParticipants: (canonical.participants || []).length, dashboardRecords: dashboard.totalParticipants || 0, firstPageRecords: (page.participants || []).length, filterValues: Object.keys(filters.values || {}).reduce((sum, field) => sum + filters.values[field].length, 0), durationMs: Date.now() - started };
    PerformanceTelemetryService.record("projections.warm.shared", result.durationMs, { records: result.canonicalParticipants, projection: "shared-projections-v2" });
    return result;
  }

  function invalidate(user) {
    PropertiesService.getScriptProperties().setProperty("SC_PARTICIPANT_PROJECTION_EPOCH", String(Date.now()));
    [
      ProjectionContractService.cacheKey("dashboard", { component: "participants" }, null),
      ProjectionContractService.cacheKey("participantList", {}, user || {}),
      ProjectionContractService.cacheKey("participantFilters", {}, user || {}),
      ProjectionContractService.cacheKey("participantPage", normalisePageQuery_({ page: 1, pageSize: DEFAULT_PAGE_SIZE }), user || {})
    ].forEach(PerformanceCacheService.remove);
    PropertiesService.getScriptProperties().deleteProperty(DASHBOARD_SNAPSHOT_PROPERTY);
  }

  function buildList_(actor) {
    const started = Date.now(), canonical = ParticipantService.getPortalData();
    const visibleParticipants = filterParticipantsForUser_(canonical.participants || [], actor);
    const headshots = HeadshotAssetService.getMetadataMany("participant", visibleParticipants);
    const participants = visibleParticipants.map(item => toListItem_(item, headshots[String(item.studentKey || item.id || "")]));
    const groups = filterGroupsForUser_(canonical.groups || [], actor).map(toGroupItem_);
    const allowedSchools = new Set(participants.concat(groups).map(item => String(item.school || "").toLowerCase()).filter(Boolean));
    const schools = (canonical.schools || []).filter(item => !allowedSchools.size || allowedSchools.has(String(item.schoolName || item.name || "").toLowerCase())).map(toSchoolItem_);
    const response = { participants, groups, schools, photos: {}, generatedAt: new Date().toISOString(), sourceUpdatedAt: "", projection: ProjectionContractService.contract("participantList").version };
    ProjectionContractService.validate("participantList", response);
    PerformanceTelemetryService.record("participants.list.transform", Date.now() - started, { records: participants.length, payloadBytes: estimateBytes_(response), projection: "participant-list-v2" });
    return response;
  }

  function buildPage_(request, actor) {
    // The first-page route should not build the complete participant-list
    // projection or resolve every headshot. Filter the canonical rows first,
    // then resolve asset metadata only for the records actually being returned.
    const visibleRecords = filterParticipantsForUser_(ParticipantService.getAll(), actor);
    const recordsById = visibleRecords.reduce((output, item) => {
      output[String(item.studentKey || item.id || "")] = item;
      return output;
    }, {});
    const filtered = applyQuery_(visibleRecords.map(item => toListItem_(item, null)), request);
    const start = (request.page - 1) * request.pageSize;
    const pageItems = filtered.slice(start, start + request.pageSize);
    const pageRecords = pageItems.map(item => recordsById[String(item.studentKey || item.id || "")]).filter(Boolean);
    const headshots = HeadshotAssetService.getMetadataMany("participant", pageRecords);
    const participants = pageRecords.map(item => toListItem_(item, headshots[String(item.studentKey || item.id || "")]));
    const response = {
      participants,
      pagination: { page: request.page, pageSize: request.pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / request.pageSize)) },
      generatedAt: new Date().toISOString(), sourceUpdatedAt: "",
      projection: ProjectionContractService.contract("participantPage").version,
      queryKey: pageQueryKey(request)
    };
    ProjectionContractService.validate("participantPage", response);
    return response;
  }

  function buildFilters_(participants) {
    const values = {
      schools: uniqueField_(participants, "school"), years: uniqueField_(participants, "year"), disciplines: uniqueField_(participants, "discipline"),
      categories: uniqueField_(participants, "category"), items: uniqueListField_(participants, "item"), regions: uniqueField_(participants, "region"),
      directorates: uniqueField_(participants, "directorate"), statuses: uniqueField_(participants, "applicationStatus"),
      participationTypes: uniqueField_(participants, "participationType"), segments: uniqueField_(participants, "segment"), schoolGroups: uniqueField_(participants, "schoolGroup")
    };
    const response = { values, generatedAt: new Date().toISOString(), projection: ProjectionContractService.contract("participantFilters").version };
    ProjectionContractService.validate("participantFilters", response);
    return response;
  }

  function applyQuery_(participants, request) {
    const search = request.search.toLowerCase(), filters = request.filters || {};
    return participants.filter(item => {
      if (search && [item.name, item.school, item.year, item.discipline, item.subDiscipline, item.category, item.categoryDetail, item.item, item.applicationStatus, item.schoolGroup].filter(Boolean).join(" ").toLowerCase().indexOf(search) < 0) return false;
      return Object.keys(filters).every(field => {
        if (!filters[field]) return true;
        if (field === "item") return splitListValue_(item.item).includes(filters[field]);
        return String(item[field] || "") === filters[field];
      });
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true }));
  }

  function toListItem_(item, headshot) {
    const value = pick_(item, ProjectionContractService.LIST_FIELDS.filter(field => !["hasPhoto", "assetKey", "assetVersion"].includes(field)));
    value.id = String(item && (item.studentKey || item.id) || "").trim();
    value.studentKey = value.id;
    value.hasPhoto = !!(headshot && headshot.hasPhoto);
    if (value.hasPhoto) {
      value.assetKey = headshot.assetKey;
      value.assetVersion = headshot.assetVersion;
    }
    return value;
  }
  function toGroupItem_(item) { return pick_(item, ["id", "groupId", "school", "segment", "item", "category", "groupName", "acceptedCount", "allocatedCount", "count", "acceptanceStatus", "teacherName", "secondTeacherName", "classroom"]); }
  function toSchoolItem_(item) { return pick_(item, ["id", "schoolId", "code", "schoolName", "name", "directorate", "region"]); }
  function sanitiseDetail_(item) { const value = JSON.parse(JSON.stringify(item || {})); const stableId = String(value.studentKey || value.id || ""); const headshot = HeadshotAssetService.getMetadataMany("participant", [item])[stableId] || {}; value.hasPhoto = !!headshot.hasPhoto; value.assetKey = headshot.assetKey || ""; value.assetVersion = headshot.assetVersion || ""; delete value.photoId; delete value.photoUrl; delete value.driveUrl; return value; }
  function normalisePageQuery_(query) {
    const value = query && typeof query === "object" ? query : {}, allowed = ["school", "year", "discipline", "category", "item", "region", "directorate", "applicationStatus", "participationType", "segment", "schoolGroup"], filters = {};
    Object.keys(value.filters || {}).filter(field => allowed.includes(field)).forEach(field => { const cleaned = String(value.filters[field] || "").trim().slice(0, 120); if (cleaned) filters[field] = cleaned; });
    return { page: Math.max(1, Math.floor(Number(value.page) || 1)), pageSize: Math.min(100, Math.max(10, Math.floor(Number(value.pageSize) || DEFAULT_PAGE_SIZE))), search: String(value.search || "").trim().slice(0, 160), filters };
  }
  function cacheOptions_(name, options) { return Object.assign({}, options || {}, { validator: value => ProjectionContractService.validate(name, value) }); }
  function uniqueField_(rows, field) { return Array.from(new Set((rows || []).map(item => String(item && item[field] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
  function uniqueListField_(rows, field) { return Array.from(new Set((rows || []).flatMap(item => splitListValue_(item && item[field])))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
  function splitListValue_(value) { return String(value || "").split(/[;,\n]+/).map(item => item.trim()).filter(Boolean); }
  function pick_(source, fields) { return fields.reduce((output, field) => { if (source && source[field] !== undefined) output[field] = source[field]; return output; }, {}); }
  function digest_(value, length) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))).replace(/=+$/, "").slice(0, length || 24); }
  function estimateBytes_(value) { try { return JSON.stringify(value || {}).length; } catch (_) { return 0; } }
  function readDashboardSnapshot_() { try { const value = JSON.parse(PropertiesService.getScriptProperties().getProperty(DASHBOARD_SNAPSHOT_PROPERTY) || "null"); ProjectionContractService.validate("dashboard", value); return value; } catch (_) { return null; } }
  function emptyDashboard_(status, cache) { return { categories: [], totalParticipants: 0, status, generatedAt: "", projection: ProjectionContractService.contract("dashboard").version, cache }; }
  function withRequestMeta_(value, meta) { const control = PlatformControlService.getConfig(); return Object.assign({}, value || {}, { requestMeta: { cache: meta.cache, cacheStatus: meta.cacheStatus || meta.cache, durationMs: meta.durationMs, payloadBytes: estimateBytes_(value), isStale: !!meta.isStale, schemaVersion: control.schemaVersion, cacheEpoch: control.cacheEpoch, generatedAt: meta.generatedAt || value && value.generatedAt || "", expiresAt: meta.expiresAt || "" } }); }

  return { getList, getPage, getFilters, pageQueryKey, getDetail, getDashboardSnapshot, rebuildDashboardSnapshot, warm, warmShared, invalidate };
})();
