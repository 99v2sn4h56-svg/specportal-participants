/** Small platform-control interface backed by Script Properties. */
const PlatformControlService = (() => {
  const CONFIG_TTL_MS = 60 * 1000;
  const DEFAULTS = Object.freeze({
    environment: "production",
    schemaVersion: "spec-central-projections-v2",
    buildVersion: "19",
    configEpoch: 1,
    cacheEpoch: 1,
    maintenanceMode: false,
    featureFlags: {
      lightweightBootstrap: true,
      participantListProjection: true,
      stableIdHeadshots: true,
      sharedHeadshotService: true,
      attendanceEnabled: true,
      communicationsEnabled: true,
      financeEnabled: false,
      reportsEnabled: true,
      newParticipantViewEnabled: true
    }
  });
  let cachedConfig_ = null;

  function getConfig() {
    if (cachedConfig_ && cachedConfig_.expiresAt > Date.now()) return clone_(cachedConfig_.value);
    const properties = PropertiesService.getScriptProperties();
    const config = {
      environment: parseEnvironment_(properties.getProperty("SC_ENVIRONMENT"), DEFAULTS.environment),
      schemaVersion: clean_(properties.getProperty("SC_SCHEMA_VERSION"), DEFAULTS.schemaVersion),
      buildVersion: clean_(properties.getProperty("SC_BUILD_VERSION"), DEFAULTS.buildVersion),
      configEpoch: parseInteger_(properties.getProperty("SC_CONFIG_EPOCH"), DEFAULTS.configEpoch),
      cacheEpoch: parseInteger_(properties.getProperty("SC_CACHE_EPOCH"), DEFAULTS.cacheEpoch),
      maintenanceMode: parseBoolean_(properties.getProperty("SC_MAINTENANCE_MODE") || properties.getProperty("SC_MAINTENANCE"), DEFAULTS.maintenanceMode),
      featureFlags: Object.assign({}, DEFAULTS.featureFlags, parseJson_(properties.getProperty("SC_FEATURE_FLAGS"), {}))
    };
    cachedConfig_ = { value: config, expiresAt: Date.now() + CONFIG_TTL_MS };
    return clone_(config);
  }

  function getCacheNamespace() {
    const config = getConfig();
    return [config.schemaVersion, config.cacheEpoch].join(":");
  }

  function advanceCacheEpoch(reason) {
    const properties = PropertiesService.getScriptProperties();
    const next = Date.now();
    properties.setProperty("SC_CACHE_EPOCH", String(next));
    cachedConfig_ = null;
    PerformanceTelemetryService.record("cache.epoch.advanced", 0, { reason: safeLabel_(reason) });
    return { cacheEpoch: next, advancedAt: new Date().toISOString() };
  }

  function clearLocalConfigCache() { cachedConfig_ = null; }
  function clean_(value, fallback) { const text = String(value || "").trim(); return text || fallback; }
  function parseBoolean_(value, fallback) { if (value === null || value === "") return fallback; return /^(1|true|yes|on)$/i.test(String(value)); }
  function parseInteger_(value, fallback) { const parsed = Number.parseInt(String(value || ""), 10); return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback; }
  function parseEnvironment_(value, fallback) { const normalised = String(value || "").trim().toLowerCase(); return ["development", "test", "staging", "production"].includes(normalised) ? normalised : fallback; }
  function parseJson_(value, fallback) { try { const parsed = JSON.parse(value || ""); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback; } catch (_) { return fallback; } }
  function safeLabel_(value) { return String(value || "manual").replace(/[^a-z0-9 .:_-]/gi, "").slice(0, 80); }
  function clone_(value) { return JSON.parse(JSON.stringify(value)); }

  return { getConfig, getCacheNamespace, advanceCacheEpoch, clearLocalConfigCache };
})();
