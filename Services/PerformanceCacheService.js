/**
 * Versioned compressed cache with generation-based atomic publication and
 * short per-projection build leases. CacheService remains an acceleration
 * layer; source systems remain authoritative.
 */
const PerformanceCacheService = (() => {
  const PREFIX = "SC_PERF_V3", CHUNK_SIZE = 80000, MAX_CHUNKS = 12;
  const DEFAULT_WAIT_MS = 5000, DEFAULT_LEASE_SECONDS = 45;
  const activeBuilds_ = {};

  function getOrLoad(key, ttl, loader, options) { return getOrLoadDetailed_(CacheService.getScriptCache(), "script", key, ttl, loader, options || {}).value; }
  function getOrLoadUser(key, ttl, loader, options) { return getOrLoadDetailed_(CacheService.getUserCache(), "user", key, ttl, loader, options || {}).value; }
  function getOrLoadDetailed(key, ttl, loader, options) { return getOrLoadDetailed_(CacheService.getScriptCache(), "script", key, ttl, loader, options || {}); }
  function getOrLoadUserDetailed(key, ttl, loader, options) { return getOrLoadDetailed_(CacheService.getUserCache(), "user", key, ttl, loader, options || {}); }
  function getOrLoadStaleWhileRevalidate(key, freshSeconds, retainSeconds, loader, options) { return getOrLoadStaleWhileRevalidate_(CacheService.getScriptCache(), "script", key, freshSeconds, retainSeconds, loader, options || {}); }
  function getOrLoadStaleWhileRevalidateUser(key, freshSeconds, retainSeconds, loader, options) { return getOrLoadStaleWhileRevalidate_(CacheService.getUserCache(), "user", key, freshSeconds, retainSeconds, loader, options || {}); }

  function getOrLoadStaleWhileRevalidate_(cache, scope, key, freshSeconds, retainSeconds, loader, options) {
    const started = Date.now(), cached = read_(cache, key), envelope = cached.hit && isStaleEnvelope_(cached.value) ? cached.value : null;
    if (envelope && !options.refresh) return finishStale_(key, started, Date.now() <= envelope.freshUntil ? "hit-fresh" : "hit-stale", envelope, cached.manifest, false);
    if (envelope && options.refresh) return refreshStale_(cache, scope, key, freshSeconds, retainSeconds, loader, envelope, options, started);
    const envelopeOptions = Object.assign({}, options, { validator: value => validate_(isStaleEnvelope_(value) ? value.value : value, options) });
    const loaded = getOrLoadDetailed_(cache, scope, key, retainSeconds, () => staleEnvelope_(loader(), freshSeconds), envelopeOptions);
    const value = isStaleEnvelope_(loaded.value) ? loaded.value : staleEnvelope_(loaded.value, freshSeconds);
    return finishStale_(key, started, loaded.meta.cache, value, loaded.meta.manifest, false, loaded.meta.lockWaitMs);
  }

  function refreshStale_(cache, scope, key, freshSeconds, retainSeconds, loader, staleEnvelope, options, started) {
    const lease = acquireLease_(key, options);
    if (!lease.owner) return finishStale_(key, started, "stale-refresh-busy", staleEnvelope, {}, true, lease.waitMs);
    activeBuilds_[lease.base] = true;
    try {
      const rechecked = read_(cache, key), current = rechecked.hit && isStaleEnvelope_(rechecked.value) ? rechecked.value : staleEnvelope;
      if (current !== staleEnvelope && Date.now() <= current.freshUntil) return finishStale_(key, started, "hit-after-refresh", current, rechecked.manifest, false, lease.waitMs);
      try {
        const raw = loader();
        validate_(raw, options);
        const next = staleEnvelope_(raw, freshSeconds), manifest = publish_(cache, key, next, retainSeconds);
        if (!manifest) return finishStale_(key, started, "stale-refresh-unpublished", current, rechecked.manifest, true, lease.waitMs);
        return finishStale_(key, started, "refreshed", next, manifest, false, lease.waitMs);
      } catch (error) {
        PerformanceTelemetryService.record("cache.stale-refresh-failed", Date.now() - started, { cache: scope, projection: cacheLabel_(key), lockWaitMs: lease.waitMs });
        return finishStale_(key, started, "stale-refresh-failed", current, rechecked.manifest, true, lease.waitMs);
      }
    } finally {
      delete activeBuilds_[lease.base];
      releaseLease_(lease);
    }
  }

  function getOrLoadDetailed_(cache, scope, key, ttl, loader, options) {
    const started = Date.now(), cached = read_(cache, key);
    if (cached.hit) return finish_(key, started, "hit", cached.value, cached.manifest, 0);
    const base = cacheKey_(key);
    if (activeBuilds_[base]) return buildAndPublish_(cache, scope, key, ttl, loader, options, started, { owner: true, nested: true, base, waitMs: 0 });

    let lease = acquireLease_(key, options);
    if (!lease.owner) {
      const late = waitForPublication_(cache, key, Math.max(100, Number(options.lockWaitMs) || DEFAULT_WAIT_MS));
      if (late.hit) return finish_(key, started, "hit-after-wait", late.value, late.manifest, Date.now() - started);
      lease = acquireLease_(key, Object.assign({}, options, { lockWaitMs: 100 }));
      if (!lease.owner) {
        PerformanceTelemetryService.record("cache.rebuild.busy", Date.now() - started, { cache: scope, projection: cacheLabel_(key), lockWaitMs: Date.now() - started });
        throw new Error("CACHE_REBUILD_BUSY");
      }
    }
    return buildAndPublish_(cache, scope, key, ttl, loader, options, started, lease);
  }

  function buildAndPublish_(cache, scope, key, ttl, loader, options, started, lease) {
    activeBuilds_[lease.base] = true;
    try {
      const rechecked = read_(cache, key);
      if (rechecked.hit) return finish_(key, started, "hit-after-lock", rechecked.value, rechecked.manifest, lease.waitMs);
      const loadStarted = Date.now(), loaded = loader();
      validate_(loaded, options);
      const manifest = publish_(cache, key, loaded, ttl);
      return finish_(key, started, manifest ? (lease.nested ? "miss-published-nested" : "miss-published") : "miss-uncached", loaded, manifest || { complete: false, loadMs: Date.now() - loadStarted }, lease.waitMs);
    } finally {
      delete activeBuilds_[lease.base];
      if (!lease.nested) releaseLease_(lease);
    }
  }

  function acquireLease_(key, options) {
    const started = Date.now(), base = cacheKey_(key);
    if (activeBuilds_[base]) return { owner: true, nested: true, base, token: "nested", waitMs: 0 };
    const lock = LockService.getScriptLock(), waitMs = Math.min(1000, Math.max(100, Number(options && options.lockWaitMs) || 500));
    if (!lock.tryLock(waitMs)) return { owner: false, base, token: "", waitMs: Date.now() - started };
    try {
      const cache = CacheService.getScriptCache(), leaseKey = base + ":lease", now = Date.now();
      let current = null;
      try { current = JSON.parse(cache.get(leaseKey) || "null"); } catch (_) {}
      if (current && Number(current.expiresAt) > now) return { owner: false, base, leaseKey, token: "", waitMs: Date.now() - started };
      const seconds = Math.max(15, Number(options && options.leaseSeconds) || DEFAULT_LEASE_SECONDS);
      const token = Utilities.getUuid ? Utilities.getUuid() : digest_(base + ":" + now + ":" + Math.random(), 24);
      cache.put(leaseKey, JSON.stringify({ token, expiresAt: now + seconds * 1000, projection: cacheLabel_(key) }), seconds);
      return { owner: true, base, leaseKey, token, waitMs: Date.now() - started };
    } finally { lock.releaseLock(); }
  }

  function releaseLease_(lease) {
    if (!lease || !lease.token || lease.nested) return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(500)) return;
    try {
      const cache = CacheService.getScriptCache();
      let current = null;
      try { current = JSON.parse(cache.get(lease.leaseKey) || "null"); } catch (_) {}
      if (current && current.token === lease.token) cache.remove(lease.leaseKey);
    } finally { lock.releaseLock(); }
  }

  function waitForPublication_(cache, key, waitMs) {
    const deadline = Date.now() + Math.min(10000, Math.max(100, waitMs));
    let result = read_(cache, key);
    while (!result.hit && Date.now() < deadline) {
      if (Utilities.sleep) Utilities.sleep(Math.min(100, Math.max(1, deadline - Date.now())));
      else break;
      result = read_(cache, key);
    }
    return result;
  }

  function publish_(cache, key, value, ttl) {
    try {
      const json = JSON.stringify(value), encoded = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, "application/json")).getBytes()), chunks = [];
      for (let i = 0; i < encoded.length; i += CHUNK_SIZE) chunks.push(encoded.slice(i, i + CHUNK_SIZE));
      if (!chunks.length || chunks.length > MAX_CHUNKS) return null;
      const seconds = Math.max(30, Number(ttl) || 60), base = cacheKey_(key), previous = readPointer_(cache, base);
      const generation = digest_(Date.now() + ":" + Math.random() + ":" + encoded.length, 16), entries = {};
      chunks.forEach((chunk, index) => entries[generationKey_(base, generation, index)] = chunk);
      cache.putAll(entries, seconds);
      const manifest = { complete: true, generation, chunks: chunks.length, bytes: json.length, cachedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), namespace: namespace_() };
      cache.put(generationManifestKey_(base, generation), JSON.stringify(manifest), seconds);
      // The active pointer is the only key readers consult first and is written last.
      cache.put(base, JSON.stringify({ complete: true, generation, previousGeneration: previous && previous.generation || "", cachedAt: manifest.cachedAt }), seconds);
      return manifest;
    } catch (error) {
      Logger.log("Performance cache skipped: " + (error && error.message ? error.message : error));
      return null;
    }
  }

  function read_(cache, key) {
    const base = cacheKey_(key), pointer = readPointer_(cache, base);
    if (!pointer || !pointer.complete || !pointer.generation) return { hit: false, value: null, manifest: null };
    const active = readGeneration_(cache, base, pointer.generation);
    if (active.hit) return active;
    if (pointer.previousGeneration) {
      const previous = readGeneration_(cache, base, pointer.previousGeneration);
      if (previous.hit) return Object.assign({}, previous, { fallbackGeneration: true });
    }
    return active;
  }

  function readGeneration_(cache, base, generation) {
    try {
      const manifest = JSON.parse(cache.get(generationManifestKey_(base, generation)) || "null");
      if (!manifest || !manifest.complete || manifest.generation !== generation || !manifest.chunks || manifest.chunks > MAX_CHUNKS) return { hit: false, value: null, manifest };
      const keys = Array.from({ length: manifest.chunks }, (_, index) => generationKey_(base, generation, index)), values = cache.getAll(keys);
      if (keys.some(item => !values[item])) return { hit: false, value: null, manifest };
      const encoded = keys.map(item => values[item]).join("");
      const value = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString("UTF-8"));
      return { hit: true, value, manifest };
    } catch (_) { return { hit: false, value: null, manifest: null }; }
  }

  function readPointer_(cache, base) { try { const value = JSON.parse(cache.get(base) || "null"); return value && typeof value === "object" ? value : null; } catch (_) { return null; } }
  function validate_(value, options) { if (options && typeof options.validator === "function") options.validator(value); }
  function staleEnvelope_(value, freshSeconds) { return { __projectionCache: "swr-v2", value, generatedAt: new Date().toISOString(), freshUntil: Date.now() + Math.max(30, Number(freshSeconds) || 60) * 1000 }; }
  function isStaleEnvelope_(value) { return !!value && /^swr-v[12]$/.test(value.__projectionCache) && Object.prototype.hasOwnProperty.call(value, "value"); }
  function finishStale_(key, started, cacheStatus, envelope, manifest, isStale, lockWaitMs) {
    const control = safeControl_(), meta = { cache: cacheStatus, cacheStatus, durationMs: Date.now() - started, lockWaitMs: lockWaitMs || 0, manifest: manifest || {}, generatedAt: envelope.generatedAt || "", isStale: !!isStale || Date.now() > Number(envelope.freshUntil || 0), schemaVersion: control.schemaVersion, cacheEpoch: control.cacheEpoch, expiresAt: manifest && manifest.expiresAt || "" };
    PerformanceTelemetryService.record("cache." + cacheStatus, meta.durationMs, { cache: cacheStatus, projection: cacheLabel_(key), lockWaitMs: meta.lockWaitMs, isStale: meta.isStale });
    return { value: envelope.value, meta };
  }
  function finish_(key, started, cacheStatus, value, manifest, lockWaitMs) {
    const result = { value, meta: { cache: cacheStatus, cacheStatus, durationMs: Date.now() - started, lockWaitMs: lockWaitMs || 0, manifest: manifest || {}, generatedAt: manifest && manifest.cachedAt || "", expiresAt: manifest && manifest.expiresAt || "" } };
    PerformanceTelemetryService.record("cache." + cacheStatus, result.meta.durationMs, { cache: cacheStatus, projection: cacheLabel_(key), lockWaitMs: result.meta.lockWaitMs });
    return result;
  }

  function peek(key) { const result = read_(CacheService.getScriptCache(), key); return result.hit ? result.value : null; }
  function peekUser(key) { const result = read_(CacheService.getUserCache(), key); return result.hit ? result.value : null; }
  function getMetadata(key) { const result = read_(CacheService.getScriptCache(), key); return result.hit ? result.manifest : null; }
  function remove(key) { remove_(CacheService.getScriptCache(), key); }
  function removeUser(key) { remove_(CacheService.getUserCache(), key); }
  function remove_(cache, key) {
    const base = cacheKey_(key), pointer = readPointer_(cache, base), keys = [base, base + ":lease"];
    [pointer && pointer.generation, pointer && pointer.previousGeneration].filter(Boolean).forEach(generation => {
      keys.push(generationManifestKey_(base, generation));
      for (let index = 0; index < MAX_CHUNKS; index++) keys.push(generationKey_(base, generation, index));
    });
    cache.removeAll(keys);
  }
  function namespace_() { try { return PlatformControlService.getCacheNamespace(); } catch (_) { return "default:1"; } }
  function safeControl_() { try { return PlatformControlService.getConfig(); } catch (_) { return { schemaVersion: "unknown", cacheEpoch: 1 }; } }
  function cacheKey_(key) { return PREFIX + ":" + digest_(namespace_() + "|" + String(key || ""), 32); }
  function generationKey_(base, generation, index) { return [base, generation, index].join(":"); }
  function generationManifestKey_(base, generation) { return [base, generation, "manifest"].join(":"); }
  function digest_(value, length) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))).replace(/=+$/, "").slice(0, length || 32); }
  function debugKey(key) { return cacheKey_(key); }
  function cacheLabel_(value) { return String(value || "").split("|")[0].replace(/[^a-z0-9:._=-]/gi, "-").slice(0, 100); }
  function userProjectionKey(prefix, user) { const record = user || {}; return [prefix, digest_([String(record.email || "").toLowerCase(), record.role || "", JSON.stringify(record.scope || {}), (record.capabilities || []).slice().sort().join(",")].join("|"), 24)].join("|"); }

  return { getOrLoad, getOrLoadUser, getOrLoadDetailed, getOrLoadUserDetailed, getOrLoadStaleWhileRevalidate, getOrLoadStaleWhileRevalidateUser, peek, peekUser, getMetadata, remove, removeUser, debugKey, userProjectionKey };
})();
