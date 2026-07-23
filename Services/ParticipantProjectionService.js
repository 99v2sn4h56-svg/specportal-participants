/** Permission-scoped participant projections. Complete records remain detail-only. */
const ParticipantProjectionService = (() => {
  const LIST_FRESH_SECONDS = 5 * 60, LIST_RETAIN_SECONDS = 30 * 60;
  const PAGE_FRESH_SECONDS = 5 * 60, PAGE_RETAIN_SECONDS = 30 * 60;
  const FILTER_FRESH_SECONDS = 15 * 60, FILTER_RETAIN_SECONDS = 60 * 60;
  const GROUP_FRESH_SECONDS = 15 * 60, GROUP_RETAIN_SECONDS = 60 * 60;
  const DASHBOARD_FRESH_SECONDS = 5 * 60, DASHBOARD_RETAIN_SECONDS = 30 * 60;
  const DEFAULT_PAGE_SIZE = 50;
  const DASHBOARD_SNAPSHOT_PROPERTY = "SC_DASHBOARD_PARTICIPANT_SUMMARY_V2";
  const PAGE_SNAPSHOT_COLLECTION = "participant_page_snapshots";

  function getList(user, options) {
    const actor = user || UserContextService.getCurrent(), key = ProjectionContractService.cacheKey("participantList", {}, actor), started = Date.now();
    let cached;
    try {
      cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, LIST_FRESH_SECONDS, LIST_RETAIN_SECONDS, () => buildList_(actor), cacheOptions_("participantList", options));
    } catch (error) {
      // A projection publication collision must not make the highest-use data
      // unavailable. The list transform is deliberately lightweight, so it is
      // safe to return an uncached copy while the other request publishes.
      if (!/CACHE_REBUILD_BUSY/.test(String(error && error.message || ""))) throw error;
      cached = { value: buildList_(actor), meta: { cache: "busy-direct-fallback", cacheStatus: "busy-direct-fallback", durationMs: Date.now() - started, isStale: false, generatedAt: new Date().toISOString(), expiresAt: "" } };
    }
    PerformanceTelemetryService.record("participants.list.request", Date.now() - started, { cache: cached.meta.cache, records: cached.value && cached.value.participants ? cached.value.participants.length : 0, payloadBytes: estimateBytes_(cached.value), projection: "participant-list-v2", isStale: !!cached.meta.isStale });
    return withRequestMeta_(cached.value, cached.meta);
  }

  function getPage(query, user, options) {
    const actor = user || UserContextService.getCurrent(), request = normalisePageQuery_(query), started = Date.now();
    const logicalKey = ProjectionContractService.cacheKey("participantPage", request, actor);
    let cached;
    try {
      cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(logicalKey, PAGE_FRESH_SECONDS, PAGE_RETAIN_SECONDS, () => buildPage_(request, actor), cacheOptions_("participantPage", options));
    } catch (error) {
      const snapshot = /CACHE_REBUILD_BUSY/.test(String(error && error.message || "")) ? readPageSnapshot_(logicalKey) : null;
      if (!snapshot) throw error;
      cached = { value: snapshot, meta: { cache: "durable-snapshot", cacheStatus: "durable-snapshot", durationMs: Date.now() - started, isStale: true, generatedAt: snapshot.generatedAt || "", expiresAt: "" } };
    }
    if (cached.meta.cache !== "hit" || !readPageSnapshot_(logicalKey)) writePageSnapshot_(logicalKey, cached.value);
    const response = withRequestMeta_(cached.value, cached.meta);
    PerformanceTelemetryService.record("participants.page.request", Date.now() - started, { cache: cached.meta.cache, records: (response.participants || []).length, payloadBytes: estimateBytes_(response), projection: "participant-list-page-v2", isStale: !!cached.meta.isStale });
    return response;
  }

  function getFilters(user, options) {
    const actor = user || UserContextService.getCurrent(), key = ProjectionContractService.cacheKey("participantFilters", {}, actor), started = Date.now();
    // Facets only need safe list fields. Building them directly from canonical
    // participants avoids the much heavier complete-list/headshot projection.
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, FILTER_FRESH_SECONDS, FILTER_RETAIN_SECONDS, () => {
      const visible = filterParticipantsForUser_(ParticipantService.getAll(), actor);
      return buildFilters_(visible.map(item => toListItem_(item, null)));
    }, cacheOptions_("participantFilters", options));
    PerformanceTelemetryService.record("participants.filters.request", Date.now() - started, { cache: cached.meta.cache, records: Object.keys(cached.value && cached.value.values || {}).reduce((sum, field) => sum + cached.value.values[field].length, 0), payloadBytes: estimateBytes_(cached.value), projection: "participant-filter-v1", isStale: !!cached.meta.isStale });
    return withRequestMeta_(cached.value, cached.meta);
  }

  function getGroups(user, options) {
    const actor = user || UserContextService.getCurrent(), key = ProjectionContractService.cacheKey("participantGroups", {}, actor), started = Date.now();
    const cached = PerformanceCacheService.getOrLoadStaleWhileRevalidate(key, GROUP_FRESH_SECONDS, GROUP_RETAIN_SECONDS, () => {
      // A source row with no school/item/groupName/category/teacherEmail has no
      // basis for a stable ID (EntityModelService.group falls back to hashing
      // that identity, which is empty too) and isn't a usable group record.
      // Drop it here rather than letting one incomplete row fail validation
      // for every user's Groups tab.
      const groups = filterGroupsForUser_(ParticipantService.getGroups(), actor).map(toGroupItem_).filter(item => String(item && (item.id || item.groupId) || "").trim());
      const response = { groups, generatedAt: new Date().toISOString(), projection: ProjectionContractService.contract("participantGroups").version };
      ProjectionContractService.validate("participantGroups", response);
      return response;
    }, cacheOptions_("participantGroups", options));
    PerformanceTelemetryService.record("participants.groups.request", Date.now() - started, { cache: cached.meta.cache, records: (cached.value.groups || []).length, payloadBytes: estimateBytes_(cached.value), projection: "participant-groups-v1", isStale: !!cached.meta.isStale });
    return withRequestMeta_(cached.value, cached.meta);
  }

  // Contact emails are intentionally not part of LIST_FIELDS/GROUP_FIELDS (see
  // ProjectionContractService's FORBIDDEN_LIST_FIELD) -- the bulk list/group
  // projections must never carry family or teacher email addresses. These
  // three functions are the deliberate, purpose-built exception: they return
  // only normalised email strings for an explicit copy-to-clipboard action,
  // never a full record, and reuse the same capability gate as the detail
  // view that already exposes this same contact data one record at a time.
  function getContactEmailsFor(studentKey, user) {
    const actor = user || UserContextService.getCurrent(), key = String(studentKey || "").trim();
    const emails = [], seen = {};
    if (key) {
      const record = filterParticipantsForUser_(ParticipantService.getAll(), actor).find(item => String(item.studentKey || item.id || "") === key);
      if (record) collectEmails_([record.studentEmail, record.parentEmail, record.additionalParentEmail], seen, emails);
    }
    return { emails };
  }

  function getContactEmails(query, user) {
    const actor = user || UserContextService.getCurrent(), request = normalisePageQuery_(query);
    const filtered = applyQuery_(filterParticipantsForUser_(ParticipantService.getAll(), actor), request);
    const emails = [], seen = {};
    filtered.forEach(item => collectEmails_([item.studentEmail, item.parentEmail, item.additionalParentEmail], seen, emails));
    return { emails, participantCount: filtered.length };
  }

  function getGroupContactEmails(user) {
    const actor = user || UserContextService.getCurrent();
    const emailsById = {};
    filterGroupsForUser_(ParticipantService.getGroups(), actor).forEach(group => {
      const id = String(group.id || group.groupId || "").trim();
      if (!id) return;
      const emails = [], seen = {};
      collectEmails_([group.teacherEmail, group.secondTeacherEmail], seen, emails);
      emailsById[id] = emails;
    });
    return { emailsById };
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
    if (request.search || Object.keys(request.filters).length || request.sortKey !== "name" || request.sortDirection !== "asc") base.push("query=" + digest_(JSON.stringify({ search: request.search, filters: request.filters, sortKey: request.sortKey, sortDirection: request.sortDirection }), 16));
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
      ProjectionContractService.cacheKey("participantGroups", {}, user || {}),
      ProjectionContractService.cacheKey("participantPage", normalisePageQuery_({ page: 1, pageSize: DEFAULT_PAGE_SIZE }), user || {})
    ].forEach(PerformanceCacheService.remove);
    PropertiesService.getScriptProperties().deleteProperty(DASHBOARD_SNAPSHOT_PROPERTY);
  }

  function buildList_(actor) {
    const started = Date.now();
    // Participant records are the priority. Do not make this route wait for
    // school-group/master-school reads or a complete Drive headshot scan.
    const visibleParticipants = filterParticipantsForUser_(ParticipantService.getAll(), actor);
    const headshots = HeadshotAssetService.getMetadataManyFast("participant", visibleParticipants);
    const participants = visibleParticipants.map(item => toListItem_(item, headshots[String(item.studentKey || item.id || "")]));
    const schoolNames = Array.from(new Set(participants.map(item => String(item.school || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const schools = schoolNames.map(name => ({ schoolName: name, name }));
    const response = { participants, schools, photos: {}, generatedAt: new Date().toISOString(), sourceUpdatedAt: "", projection: ProjectionContractService.contract("participantList").version };
    ProjectionContractService.validate("participantList", response);
    PerformanceTelemetryService.record("participants.list.transform", Date.now() - started, { records: participants.length, payloadBytes: estimateBytes_(response), projection: "participant-list-v2" });
    return response;
  }

  function buildPage_(request, actor) {
    // The first-page route should not build the complete participant-list
    // projection or resolve every headshot. Filter the canonical rows first,
    // then resolve asset metadata only for the records actually being returned.
    //
    // applyQuery_ runs against the raw canonical records, not the browser-safe
    // projection, on purpose: some filters (medical alert, support needs,
    // cultural identity, free-text notes) need fields ProjectionContractService
    // deliberately excludes from LIST_FIELDS. Only the resulting page slice is
    // ever sanitised through toListItem_ below -- the full match set (filtered)
    // never leaves this function.
    const visibleRecords = filterParticipantsForUser_(ParticipantService.getAll(), actor);
    const filtered = applyQuery_(visibleRecords, request);
    const start = (request.page - 1) * request.pageSize;
    const pageRecords = filtered.slice(start, start + request.pageSize);
    // Never block the participant route on a full Drive folder scan. Explicit
    // photo references and a previously warmed index are enough for first paint.
    const headshots = HeadshotAssetService.getMetadataManyFast("participant", pageRecords);
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
      participationTypes: uniqueField_(participants, "participationType"), segments: uniqueField_(participants, "segment"), schoolGroups: uniqueField_(participants, "schoolGroup"),
      genders: uniqueField_(participants, "gender")
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
        if (field === "category") return [item.discipline, item.category].map(value => String(value || "")).includes(filters[field]);
        if (field === "hasAttendance") return !!String(item.attendanceStatus || "").trim();
        if (field === "missingAttendance") return !String(item.attendanceStatus || "").trim();
        if (field === "productionText") return [item.discipline, item.category, item.categoryDetail, item.item, item.schoolGroup].filter(Boolean).join(" ").toLowerCase().indexOf(String(filters[field]).toLowerCase()) >= 0;
        // These read notes/medical/cultural-identity fields that ProjectionContractService
        // deliberately never sends to the browser (see FORBIDDEN_LIST_FIELD) -- matching
        // must happen here, server-side, against the raw record.
        if (field === "culturalIdentity") return !!(item.aboriginal || item.torresStraitIslander || notesContain_(item.notes, /\b(?:aboriginal|torres\s+strait\s+islander|atsi|tsi)\b/i));
        if (field === "loteNote") return notesContain_(item.notes, /\blote\b/i);
        if (field === "supportNeededNote") return notesContain_(item.notes, /\bsupport\s+needed\b/i);
        if (field === "medicalNote") return !!(item.hasMedicalAlert || notesContain_(item.notes, /\b(?:medical|med\s*plan)\b/i));
        if (field === "firstTimeNote") return notesContain_(item.notes, /\b1st\b/i);
        return String(item[field] || "") === filters[field];
      });
    }).sort((a, b) => {
      const result = String(a[request.sortKey] || "").localeCompare(String(b[request.sortKey] || ""), undefined, { numeric: true });
      return request.sortDirection === "desc" ? -result : result;
    });
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
  // Uses the no-scan fast path deliberately: participant detail (name, parent
  // contacts, etc.) must never wait on a live Drive folder scan. The profile
  // renderer requests the secure avatar unconditionally, so a cold photo
  // index is filled in afterwards by that lazy per-avatar resolution instead
  // of blocking this response.
  function sanitiseDetail_(item) { const value = JSON.parse(JSON.stringify(item || {})); const stableId = String(value.studentKey || value.id || ""); const headshot = HeadshotAssetService.getMetadataManyFast("participant", [item])[stableId] || {}; value.hasPhoto = !!headshot.hasPhoto; value.assetKey = headshot.assetKey || ""; value.assetVersion = headshot.assetVersion || ""; delete value.photoId; delete value.photoUrl; delete value.driveUrl; return value; }
  function normalisePageQuery_(query) {
    const value = query && typeof query === "object" ? query : {}, allowed = ["school", "year", "discipline", "category", "item", "region", "gender", "directorate", "applicationStatus", "participationType", "segment", "schoolGroup", "hasAttendance", "missingAttendance", "productionText", "culturalIdentity", "loteNote", "supportNeededNote", "medicalNote", "firstTimeNote"], filters = {};
    Object.keys(value.filters || {}).filter(field => allowed.includes(field)).forEach(field => { const cleaned = String(value.filters[field] || "").trim().slice(0, 120); if (cleaned) filters[field] = cleaned; });
    const sortKeys = ["name", "school", "category", "item", "year", "region", "applicationStatus"];
    return { page: Math.max(1, Math.floor(Number(value.page) || 1)), pageSize: Math.min(100, Math.max(10, Math.floor(Number(value.pageSize) || DEFAULT_PAGE_SIZE))), search: String(value.search || "").trim().slice(0, 160), filters, sortKey: sortKeys.includes(value.sortKey) ? value.sortKey : "name", sortDirection: value.sortDirection === "desc" ? "desc" : "asc" };
  }
  function cacheOptions_(name, options) { return Object.assign({}, options || {}, { validator: value => ProjectionContractService.validate(name, value) }); }
  function uniqueField_(rows, field) { return Array.from(new Set((rows || []).map(item => String(item && item[field] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
  function uniqueListField_(rows, field) { return Array.from(new Set((rows || []).flatMap(item => splitListValue_(item && item[field])))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
  function splitListValue_(value) { return String(value || "").split(/[;,\n]+/).map(item => item.trim()).filter(Boolean); }
  function notesContain_(notes, pattern) { return pattern.test(String(notes || "")); }
  function collectEmails_(values, seen, emails) {
    (values || []).forEach(value => {
      String(value || "").split(/[;,\n]+/).forEach(email => {
        const clean = email.trim(), key = clean.toLowerCase();
        if (!clean || clean.indexOf("@") < 1 || seen[key]) return;
        seen[key] = true;
        emails.push(clean);
      });
    });
  }
  function pick_(source, fields) { return fields.reduce((output, field) => { if (source && source[field] !== undefined) output[field] = source[field]; return output; }, {}); }
  function digest_(value, length) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))).replace(/=+$/, "").slice(0, length || 24); }
  function estimateBytes_(value) { try { return JSON.stringify(value || {}).length; } catch (_) { return 0; } }
  function readDashboardSnapshot_() { try { const value = JSON.parse(PropertiesService.getScriptProperties().getProperty(DASHBOARD_SNAPSHOT_PROPERTY) || "null"); ProjectionContractService.validate("dashboard", value); return value; } catch (_) { return null; } }
  function pageSnapshotId_(logicalKey) { return "PAGESNAP-" + digest_(logicalKey, 32); }
  function readPageSnapshot_(logicalKey) { try { const record = PlatformStoreService.listLarge(PAGE_SNAPSHOT_COLLECTION).find(item => item.id === pageSnapshotId_(logicalKey)); const value = record && record.value; if (!value) return null; ProjectionContractService.validate("participantPage", value); return value; } catch (_) { return null; } }
  function writePageSnapshot_(logicalKey, value) { try { ProjectionContractService.validate("participantPage", value); PlatformStoreService.putLarge(PAGE_SNAPSHOT_COLLECTION, { id: pageSnapshotId_(logicalKey), entityType: "ParticipantPageSnapshot", generatedAt: new Date().toISOString(), value }, 8); } catch (_) {} }
  function emptyDashboard_(status, cache) { return { categories: [], totalParticipants: 0, status, generatedAt: "", projection: ProjectionContractService.contract("dashboard").version, cache }; }
  function withRequestMeta_(value, meta) { const control = PlatformControlService.getConfig(); return Object.assign({}, value || {}, { requestMeta: { cache: meta.cache, cacheStatus: meta.cacheStatus || meta.cache, durationMs: meta.durationMs, payloadBytes: estimateBytes_(value), isStale: !!meta.isStale, schemaVersion: control.schemaVersion, cacheEpoch: control.cacheEpoch, generatedAt: meta.generatedAt || value && value.generatedAt || "", expiresAt: meta.expiresAt || "" } }); }

  return { getList, getPage, getFilters, getGroups, getContactEmailsFor, getContactEmails, getGroupContactEmails, pageQueryKey, getDetail, getDashboardSnapshot, rebuildDashboardSnapshot, warm, warmShared, invalidate };
})();
