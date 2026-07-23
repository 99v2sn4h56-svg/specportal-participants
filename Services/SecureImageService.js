/**
 * Permission-safe image delivery for Participant and Staff headshots.
 * Source references never leave the server; browsers receive short-lived data
 * URLs only after the canonical record and current-user scope are validated.
 */
const SecureImageService = (() => {
  const MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 1500 * 1024;
  const CACHE_SECONDS = 30 * 60;
  let requestContext_ = null;

  function resolve(request) {
    const started = Date.now();
    const input = normaliseRequest_(request);
    try {
      const resolved = resolveEntity_(input);
      if (!resolved.reference) return failure_(input, "NO_IMAGE_REFERENCE", started);
      const parsed = parseReference(resolved.reference);
      if (!parsed.valid) return failure_(input, parsed.errorCategory, started);
      const cache = CacheService.getUserCache();
      const key = cacheKey_(input, parsed);
      const cached = cache.get(key);
      if (cached) {
        const value = JSON.parse(cached);
        value.cacheHit = true;
        value.durationMs = Date.now() - started;
        recordHealth_(true, "", value.durationMs);
        return value;
      }
      const image = parsed.type === "drive" ? fetchDrive_(parsed.fileId, input.pixels) : fetchHttps_(parsed.url);
      const response = success_(input, image, started, false);
      if (response.dataUrl.length < 90000) try { cache.put(key, JSON.stringify(response), CACHE_SECONDS); } catch (err) {}
      return response;
    } catch (err) {
      return failure_(input, errorCategory_(err), started);
    }
  }

  function resolveMany(requests, options) {
    const values = Array.isArray(requests) ? requests.slice(0, 12) : [];
    const participantRequest = values.some(item => String(item && item.entityType || "").toLowerCase() === "participant");
    const staffRequest = values.some(item => String(item && item.entityType || "").toLowerCase() === "staff");
    const trustedIds = options && Array.isArray(options.trustedParticipantIds) ? new Set(options.trustedParticipantIds.map(String)) : null;
    requestContext_ = { user: trustedIds ? null : UserContextService.getCurrent(), trustedParticipantIds: trustedIds, permissionScope: trustedIds ? "trusted-attendance" : "interactive", participants: participantRequest ? ParticipantService.getAll() : [], staff: staffRequest ? StaffService.getAll() : [] };
    try { return values.map(resolve); }
    finally { requestContext_ = null; }
  }

  function parseReference(value) { return HeadshotAssetService.parseReference(value); }

  function resolveEntity_(input) {
    const trustedIds = requestContext_ && requestContext_.trustedParticipantIds;
    const user = requestContext_ && requestContext_.user || (!trustedIds ? UserContextService.getCurrent() : null);
    if (!trustedIds && (!user || !user.email)) throw coded_("AUTHENTICATION_REQUIRED");
    if (input.entityType === "participant") {
      if (!trustedIds && !AuthorizationService.hasCapability(user, "Participants.View")) throw coded_("PERMISSION_SCOPE_DENIED");
      if (trustedIds && !trustedIds.has(input.entityId)) throw coded_("PERMISSION_SCOPE_DENIED");
      const visible = trustedIds ? (requestContext_ && requestContext_.participants || ParticipantService.getAll()) : filterParticipantsForUser_(requestContext_ && requestContext_.participants || ParticipantService.getAll(), user);
      const item = visible.find(record => [record.id, record.studentKey].map(String).includes(input.entityId));
      if (!item) throw coded_("PERMISSION_SCOPE_DENIED");
      const asset = HeadshotAssetService.getAsset("participant", input.entityId, visible);
      return { reference: asset.fileId || asset.url || "", assetVersion: asset.assetVersion, sourceField: asset.matchMethod };
    }
    if (input.entityType === "staff") {
      const item = (requestContext_ && requestContext_.staff || StaffService.getAll()).find(record => [record.id, record.staffId, record.email, record.primaryEmail].map(value => String(value || "")).includes(input.entityId));
      const own = item && String(item.email || item.primaryEmail || "").toLowerCase() === String(user.email).toLowerCase();
      if (!item || (!own && !AuthorizationService.hasCapability(user, "Operations.View"))) throw coded_("PERMISSION_SCOPE_DENIED");
      const asset = HeadshotAssetService.getAsset("staff", input.entityId, requestContext_ && requestContext_.staff || StaffService.getAll());
      return { reference: asset.fileId || asset.url || "", assetVersion: asset.assetVersion, sourceField: asset.matchMethod };
    }
    throw coded_("UNSUPPORTED_REFERENCE");
  }

  function fetchDrive_(fileId, pixels) {
    const token = ScriptApp.getOAuthToken();
    const options = { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true, followRedirects: true };
    const metadataResponse = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?fields=id,mimeType,size,thumbnailLink", options);
    const code = metadataResponse.getResponseCode();
    if (code === 404) throw coded_("FILE_NOT_FOUND");
    if (code === 401 || code === 403) throw coded_("FILE_ACCESS_DENIED");
    if (code < 200 || code >= 300) throw coded_("UNKNOWN_IMAGE_ERROR");
    const metadata = JSON.parse(metadataResponse.getContentText() || "{}");
    let response;
    if (metadata.thumbnailLink) {
      // Drive can safely render thumbnails for HEIC/TIFF and large originals.
      // Validate the returned thumbnail bytes below rather than rejecting the
      // source format or full-resolution size before conversion.
      if (!/^image\//i.test(String(metadata.mimeType || ""))) throw coded_("UNSUPPORTED_MIME_TYPE");
      const link = String(metadata.thumbnailLink).replace(/=s\d+(?:-c)?$/, "=s" + pixels + "-c");
      response = UrlFetchApp.fetch(link, options);
    } else {
      validateMeta_(metadata.mimeType, Number(metadata.size) || 0);
      response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media", options);
    }
    if (response.getResponseCode() === 401 || response.getResponseCode() === 403) throw coded_("FILE_ACCESS_DENIED");
    if (response.getResponseCode() === 404) throw coded_("FILE_NOT_FOUND");
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw coded_("IMAGE_CONVERSION_FAILED");
    return blobResult_(response.getBlob(), metadata.mimeType);
  }

  function fetchHttps_(url) {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (response.getResponseCode() === 404) throw coded_("FILE_NOT_FOUND");
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw coded_("FILE_ACCESS_DENIED");
    return blobResult_(response.getBlob(), response.getHeaders()["Content-Type"] || response.getBlob().getContentType());
  }

  function blobResult_(blob, hintedMime) {
    const bytes = blob.getBytes();
    const mime = String(blob.getContentType() || hintedMime || "").split(";")[0].toLowerCase();
    validateMeta_(mime, bytes.length);
    if (bytes.length > MAX_OUTPUT_BYTES) throw coded_("FILE_TOO_LARGE");
    return { bytes, mimeType: mime, sizeBytes: bytes.length };
  }

  function validateMeta_(mime, size) {
    if (!MIME.includes(String(mime || "").toLowerCase())) throw coded_("UNSUPPORTED_MIME_TYPE");
    if (Number(size) > MAX_SOURCE_BYTES) throw coded_("FILE_TOO_LARGE");
  }

  function getHealth() {
    UserContextService.requireCapability("Administration.View");
    const diagnostics = HeadshotAssetService.diagnostics();
    const recordCount = diagnostics.reduce((sum, item) => sum + Number(item.counts.explicit || 0) + Number(item.counts.filename || 0) + Number(item.counts.ambiguous || 0) + Number(item.counts.unmatched || 0), 0);
    const unresolved = diagnostics.reduce((sum, item) => sum + Number(item.counts.unmatched || 0) + Number(item.counts.ambiguous || 0), 0);
    const delivery = readHealth_();
    return { name: "Headshot delivery", status: unresolved || delivery.failures ? "Degraded" : "Healthy", lastAttempted: delivery.lastAttempted || "", lastSuccessful: delivery.lastSuccessful || "", responseMs: delivery.lastResponseMs || 0, cacheAge: "Asset index · 6 hours; delivery · per user 30 minutes", recordCount, parsed: recordCount - unresolved, unsupported: diagnostics.reduce((sum, item) => sum + Number(item.counts.invalidReference || 0), 0), inaccessible: Number(delivery.categories.FILE_ACCESS_DENIED || 0) + Number(delivery.categories.FILE_NOT_FOUND || 0), unresolved, delivery, diagnostics, error: unresolved || delivery.failures ? "One or more headshots are unresolved, ambiguous, or failed secure delivery" : "" };
  }

  function normaliseRequest_(request) { const type = String(request && request.entityType || "").toLowerCase(); const id = String(request && request.entityId || "").trim().slice(0, 220); const rawSize = String(request && request.size || "medium").toLowerCase(); const size = rawSize === "profile" ? "large" : rawSize === "card" ? "small" : ["small", "medium", "large"].includes(rawSize) ? rawSize : "medium"; return { entityType: type, entityId: id, assetVersion: String(request && request.assetVersion || "").slice(0, 80), size, pixels: size === "large" ? 640 : size === "small" ? 120 : 240 }; }
  function cacheKey_(input, parsed) { const user = requestContext_ && requestContext_.user || {}; const scope = requestContext_ && requestContext_.permissionScope === "trusted-attendance" ? "trusted-attendance" : ProjectionContractService.permissionScopeKey(user); const identity = [input.entityType, input.entityId, input.size, input.assetVersion || "", parsed.fileId || parsed.url, scope].join("|"); return "SC_IMG_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, identity)).replace(/=+$/, "").slice(0, 60); }
  function success_(input, image, started, cacheHit) { const durationMs = Date.now() - started; recordHealth_(true, "", durationMs); return { ok: true, entityType: input.entityType, entityId: input.entityId, requestedSize: input.size, dataUrl: "data:" + image.mimeType + ";base64," + Utilities.base64Encode(image.bytes), mimeType: image.mimeType, sizeBytes: image.sizeBytes, cacheHit: !!cacheHit, durationMs, expiresAt: new Date(Date.now() + CACHE_SECONDS * 1000).toISOString(), errorCategory: "" }; }
  function failure_(input, category, started) { const errorCategory = category || "UNKNOWN_IMAGE_ERROR", durationMs = Date.now() - started; recordHealth_(false, errorCategory, durationMs); return { ok: false, entityType: input.entityType, entityId: input.entityId, requestedSize: input.size, dataUrl: "", mimeType: "", sizeBytes: 0, cacheHit: false, durationMs, expiresAt: "", errorCategory }; }
  function recordHealth_(ok, category, durationMs) { try { const cache = CacheService.getScriptCache(), key = "SC_HEADSHOT_DELIVERY_HEALTH_V1", value = JSON.parse(cache.get(key) || "null") || { attempts: 0, successes: 0, failures: 0, categories: {} }; value.attempts++; value.lastAttempted = new Date().toISOString(); value.lastResponseMs = Number(durationMs) || 0; if (ok) { value.successes++; value.lastSuccessful = value.lastAttempted; } else { value.failures++; value.categories[category] = Number(value.categories[category] || 0) + 1; } cache.put(key, JSON.stringify(value), 21600); } catch (_) {} }
  function readHealth_() { try { return JSON.parse(CacheService.getScriptCache().get("SC_HEADSHOT_DELIVERY_HEALTH_V1") || "null") || { attempts: 0, successes: 0, failures: 0, categories: {} }; } catch (_) { return { attempts: 0, successes: 0, failures: 0, categories: {} }; } }
  function coded_(category) { const err = new Error(category); err.imageCategory = category; return err; }
  function errorCategory_(err) { return err && err.imageCategory || (/not found/i.test(String(err && err.message)) ? "FILE_NOT_FOUND" : /permission|access/i.test(String(err && err.message)) ? "FILE_ACCESS_DENIED" : "UNKNOWN_IMAGE_ERROR"); }
  return { resolve, resolveMany, parseReference, getHealth };
})();
