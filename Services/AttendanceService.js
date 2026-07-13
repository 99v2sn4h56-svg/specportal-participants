const AttendanceService = (() => {
  const DEFAULT_WEB_APP_URL = "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbxdsxgTxywWxGyF8mVTfvs04E1WeOcAma5hOEsjMBcbCXOOvHkeO5o7B6VqvtV33db9Tw/exec";
  const STALE_WEB_APP_URLS = [
    "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbz4lRBirmgoHtz3T7d_Pba-gEVkFHzj_TQVlqg4XKT8A-5WPhxC9lONV9j9N3i3DH7sdA/exec",
    "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbzcPYzqJQrJ8qeaxCic3ZGZdQGDd-HvtAHgklkE15LiM01vsudPX-9ok3IolHzHukc_NQ/exec"
  ];
  const SUMMARY_CACHE_SECONDS = 2 * 60;
  const EVENTS_CACHE_SECONDS = 5 * 60;
  const PARTICIPANT_HISTORY_CACHE_SECONDS = 2 * 60;
  const ERROR_CACHE_SECONDS = 30;
  const BACKOFF_SECONDS = 20;
  const CACHE_PREFIX = "SPEC_CENTRAL_ATTENDANCE_API_V1";

  function getWebAppUrl() {
    const properties = PropertiesService.getScriptProperties();
    const configuredUrl = properties.getProperty("SPEC_CENTRAL_ATTENDANCE_URL") ||
      properties.getProperty("ATTENDANCE_WEB_APP_URL");

    if (configuredUrl && STALE_WEB_APP_URLS.indexOf(configuredUrl) === -1) {
      return configuredUrl;
    }

    return DEFAULT_WEB_APP_URL;
  }

  function getConfig() {
    const url = getWebAppUrl();
    if (!url) return waitingResult_("config");

    const health = getHealth();
    return {
      url,
      status: health.status,
      mode: "linked-web-app",
      source: url === DEFAULT_WEB_APP_URL ? "Default Attendance deployment" : "Script property",
      error: health.error || "",
      generatedAt: health.generatedAt
    };
  }

  function getSummary() {
    return requestPublicApi_("summary", {}, SUMMARY_CACHE_SECONDS);
  }

  function getEvents() {
    return requestPublicApi_("events", {}, EVENTS_CACHE_SECONDS);
  }

  function invalidate() {
    const cache = CacheService.getScriptCache();
    cache.remove(buildCacheKey_("summary", {}));
    cache.remove(buildCacheKey_("events", {}));
  }

  function getEvent(sessionIdOrSheetName) {
    const identifier = String(sessionIdOrSheetName || "").trim();
    if (!identifier) return failureResult_("event", "Session ID or Sheet Name is required.");

    return requestPublicApi_("event", {
      sessionId: identifier,
      sheetName: identifier
    }, 0);
  }

  function getParticipantHistory(studentKey) {
    const action = "participant-history";
    const key = String(studentKey || "").trim();
    if (!key) return failureResult_(action, "Student Key is required.");

    const secret = PropertiesService.getScriptProperties()
      .getProperty("SPEC_CENTRAL_ATTENDANCE_SECRET");
    if (!secret || secret.length < 32) {
      return unavailableResult_(action, "Secure Attendance integration is not configured.");
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = `${CACHE_PREFIX}:participant-history:${digestCacheValue_(key)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        cache.remove(cacheKey);
      }
    }

    let result;
    try {
      const response = UrlFetchApp.fetch(getWebAppUrl(), {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ action, studentKey: key, secret }),
        followRedirects: true,
        muteHttpExceptions: true
      });
      const statusCode = response.getResponseCode();

      result = statusCode >= 200 && statusCode < 300
        ? parseParticipantHistoryResponse_(response.getContentText())
        : failureResult_(action, `Attendance API returned HTTP ${statusCode}.`, statusCode);
    } catch (err) {
      result = failureResult_(
        action,
        `Attendance API request failed: ${err && err.message ? err.message : String(err)}`
      );
    }

    if (result.ok) {
      try {
        cache.put(cacheKey, JSON.stringify(result), PARTICIPANT_HISTORY_CACHE_SECONDS);
      } catch (err) {
        Logger.log("AttendanceService participant history cache failed.");
      }
    }

    return result;
  }

  function parseParticipantHistoryResponse_(responseText) {
    const action = "participant-history";
    let parsed;
    try {
      parsed = JSON.parse(String(responseText || ""));
    } catch (err) {
      return failureResult_(action, "Attendance API returned invalid JSON.");
    }

    if (!parsed || parsed.ok !== true || parsed.action !== action || !Array.isArray(parsed.data)) {
      return failureResult_(action, parsed && parsed.error
        ? parsed.error
        : "Attendance API returned an invalid participant history response.");
    }

    return {
      ok: true,
      action,
      status: "Connected",
      generatedAt: parsed.generatedAt || new Date().toISOString(),
      data: parsed.data.map(sanitiseParticipantHistoryEntry_)
    };
  }

  function sanitiseParticipantHistoryEntry_(entry) {
    entry = entry || {};
    return {
      date: entry.date || "",
      time: entry.time || "",
      eventName: entry.eventName || "",
      location: entry.location || "",
      status: entry.status || "Waiting",
      attendanceNotes: entry.attendanceNotes || "",
      markedTime: entry.markedTime || "",
      markedBy: entry.markedBy || ""
    };
  }

  function digestCacheValue_(value) {
    return Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))
    ).slice(0, 32);
  }

  function getHealth() {
    const url = getWebAppUrl();
    if (!url) return waitingResult_("health");

    const summary = getSummary();
    return {
      ok: summary.ok,
      action: "health",
      status: summary.ok ? "Connected" : "Degraded",
      generatedAt: summary.generatedAt || new Date().toISOString(),
      url,
      error: summary.error || ""
    };
  }

  function getServiceHealth() {
    const cache = CacheService.getScriptCache();
    let metadata = {};
    try { metadata = JSON.parse(cache.get(`${CACHE_PREFIX}:health-metadata`) || "{}"); } catch (err) {}
    const summary = getSummary();
    return {
      name: "Attendance API",
      status: summary.ok ? "Healthy" : summary.status === "Waiting" ? "Not Configured" : "Degraded",
      lastAttempted: metadata.lastAttempted || summary.generatedAt || "",
      lastSuccessful: metadata.lastSuccessful || "",
      responseMs: Number(metadata.responseMs) || 0,
      cacheAge: metadata.lastSuccessful ? Math.max(0, Math.round((Date.now() - new Date(metadata.lastSuccessful).getTime()) / 1000)) + "s" : "Unknown",
      recordCount: summary.ok && summary.data ? Number(summary.data.totalEvents) || 0 : 0,
      error: summary.error || "",
      apiUrlConfigured: !!getWebAppUrl(),
      iframeUrlConfigured: !!getWebAppUrl()
    };
  }

  function requestPublicApi_(action, parameters, successCacheSeconds) {
    const url = getWebAppUrl();
    if (!url) return waitingResult_(action);

    const cache = CacheService.getScriptCache();
    const cacheKey = buildCacheKey_(action, parameters);
    const backoffKey = `${CACHE_PREFIX}:backoff:${action}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        cache.remove(cacheKey);
      }
    }

    const backoff = cache.get(backoffKey);
    if (backoff) {
      try { return JSON.parse(backoff); } catch (err) { cache.remove(backoffKey); }
    }

    let result;
    const started = Date.now();
    try {
      const query = Object.assign({ api: "1", action }, parameters || {});
      const response = UrlFetchApp.fetch(buildApiUrl_(url, query), {
        method: "get",
        followRedirects: true,
        muteHttpExceptions: true
      });
      const statusCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (statusCode < 200 || statusCode >= 300) {
        result = failureResult_(action, `Attendance API returned HTTP ${statusCode}.`, statusCode);
      } else {
        result = parseApiResponse_(action, responseText);
      }
    } catch (err) {
      result = failureResult_(
        action,
        `Attendance API request failed: ${err && err.message ? err.message : String(err)}`
      );
    }

    const cacheSeconds = result.ok ? successCacheSeconds : ERROR_CACHE_SECONDS;
    if (cacheSeconds > 0) {
      try {
        cache.put(cacheKey, JSON.stringify(result), cacheSeconds);
      } catch (err) {
        Logger.log("AttendanceService cache failed: " + (err && err.message ? err.message : err));
      }
    }
    const now = new Date().toISOString();
    const metadata = { lastAttempted: now, lastSuccessful: result.ok ? now : "", responseMs: Date.now() - started, status: result.ok ? "Healthy" : "Degraded", error: result.error || "" };
    try {
      if (!result.ok) cache.put(backoffKey, JSON.stringify(result), BACKOFF_SECONDS);
      const previous = JSON.parse(cache.get(`${CACHE_PREFIX}:health-metadata`) || "{}");
      if (!metadata.lastSuccessful) metadata.lastSuccessful = previous.lastSuccessful || "";
      cache.put(`${CACHE_PREFIX}:health-metadata`, JSON.stringify(metadata), 6 * 60 * 60);
    } catch (err) {}

    return result;
  }

  function parseApiResponse_(action, responseText) {
    let parsed;
    try {
      parsed = JSON.parse(String(responseText || ""));
    } catch (err) {
      return failureResult_(action, "Attendance API returned invalid JSON.");
    }

    if (!parsed || typeof parsed !== "object" || typeof parsed.ok !== "boolean") {
      return failureResult_(action, "Attendance API returned an invalid response shape.");
    }

    if (String(parsed.action || "") !== action) {
      return failureResult_(action, "Attendance API returned an unexpected action.");
    }

    if (!parsed.ok) {
      return failureResult_(action, parsed.error || "Attendance API reported a failure.");
    }

    if (!("data" in parsed)) {
      return failureResult_(action, "Attendance API response did not include data.");
    }

    return {
      ok: true,
      action,
      status: "Connected",
      generatedAt: parsed.generatedAt || new Date().toISOString(),
      data: sanitisePublicData_(action, parsed.data),
      source: "Live Attendance API"
    };
  }

  function sanitisePublicData_(action, data) {
    if (action === "summary") {
      const summary = data || {};
      return {
        totalEvents: Number(summary.totalEvents) || 0,
        upcomingEvents: Number(summary.upcomingEvents) || 0,
        pastEvents: Number(summary.pastEvents) || 0,
        totalStudentEventRecords: Number(summary.totalStudentEventRecords) || 0,
        countsByStatus: summary.countsByStatus && typeof summary.countsByStatus === "object"
          ? summary.countsByStatus
          : {},
        lastUpdated: summary.lastUpdated || ""
      };
    }

    if (action === "events") {
      return Array.isArray(data) ? data.map(sanitiseEvent_) : [];
    }

    if (action === "event") {
      const response = data || {};
      return {
        event: sanitiseEvent_(response.event || {}),
        participantsIncluded: false
      };
    }

    return null;
  }

  function sanitiseEvent_(event) {
    const counts = event.attendanceCounts || {};
    return EntityModelService.attendanceSession({
      sessionId: event.sessionId || "",
      sheetName: event.sheetName || "",
      date: event.date || "",
      dateKey: event.dateKey || "",
      time: event.time || "",
      eventName: event.eventName || "",
      location: event.location || "",
      categories: event.categories || "",
      studentGroups: event.studentGroups || "",
      studentCount: event.studentCount || "",
      staff: event.staff || "",
      eventNotes: event.eventNotes || "",
      attendanceCounts: {
        total: Number(counts.total) || 0,
        byStatus: counts.byStatus && typeof counts.byStatus === "object" ? counts.byStatus : {}
      }
    });
  }

  function buildApiUrl_(baseUrl, parameters) {
    const query = Object.keys(parameters || {})
      .filter(key => parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== "")
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
      .join("&");

    return baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + query;
  }

  function buildCacheKey_(action, parameters) {
    const suffix = Object.keys(parameters || {})
      .sort()
      .map(key => `${key}:${parameters[key]}`)
      .join("|");
    return `${CACHE_PREFIX}:${action}:${suffix}`;
  }

  function waitingResult_(action) {
    return {
      ok: false,
      action,
      status: "Waiting",
      generatedAt: new Date().toISOString(),
      error: "Attendance web app URL is not configured.",
      url: ""
    };
  }

  function failureResult_(action, error, httpStatus) {
    const result = {
      ok: false,
      action,
      status: getWebAppUrl() ? "Degraded" : "Waiting",
      generatedAt: new Date().toISOString(),
      error: String(error || "Attendance API request failed.")
    };
    if (httpStatus) result.httpStatus = httpStatus;
    return result;
  }

  function unavailableResult_(action, error) {
    return {
      ok: false,
      action,
      status: "Unavailable",
      generatedAt: new Date().toISOString(),
      error: String(error || "Attendance integration is unavailable.")
    };
  }

  return {
    getWebAppUrl,
    getConfig,
    getSummary,
    getEvents,
    getEvent,
    getParticipantHistory,
    getHealth,
    getServiceHealth,
    invalidate
  };
})();
