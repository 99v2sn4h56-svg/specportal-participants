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

  function resolveMany(requests) {
    const values = Array.isArray(requests) ? requests.slice(0, 12) : [];
    const participantRequest = values.some(item => String(item && item.entityType || "").toLowerCase() === "participant");
    const staffRequest = values.some(item => String(item && item.entityType || "").toLowerCase() === "staff");
    requestContext_ = { user: UserContextService.getCurrent(), participants: participantRequest ? ParticipantService.getAll() : [], staff: staffRequest ? StaffService.getAll() : [], photoIndex: participantRequest ? ProfilePhotoService.getStudentPhotos() : {} };
    try { return values.map(resolve); }
    finally { requestContext_ = null; }
  }

  function parseReference(value) {
    const first = String(value || "").split(/[\n,]+/).map(item => item.trim()).filter(Boolean)[0] || "";
    if (!first) return { valid: false, errorCategory: "NO_IMAGE_REFERENCE" };
    const patterns = [/\/file\/d\/([a-zA-Z0-9_-]{20,})/, /[?&]id=([a-zA-Z0-9_-]{20,})/, /\/d\/([a-zA-Z0-9_-]{20,})/, /^([a-zA-Z0-9_-]{20,})$/];
    for (const pattern of patterns) {
      const match = first.match(pattern);
      if (match) return { type: "drive", fileId: match[1], valid: true };
    }
    if (/^https:\/\//i.test(first)) return { type: "https", url: first, valid: true };
    return { valid: false, errorCategory: /drive|docs\.google/i.test(first) ? "FILE_ID_PARSE_FAILED" : "UNSUPPORTED_REFERENCE" };
  }

  function resolveEntity_(input) {
    const user = requestContext_ && requestContext_.user || UserContextService.getCurrent();
    if (!user.email) throw coded_("PERMISSION_SCOPE_DENIED");
    if (input.entityType === "participant") {
      if (!AuthorizationService.hasCapability(user, "Participants.View")) throw coded_("PERMISSION_SCOPE_DENIED");
      const visible = filterParticipantsForUser_(requestContext_ && requestContext_.participants || ParticipantService.getAll(), user);
      const item = visible.find(record => [record.id, record.studentKey].map(String).includes(input.entityId));
      if (!item) throw coded_("PERMISSION_SCOPE_DENIED");
      const indexed = (requestContext_ && requestContext_.photoIndex || ProfilePhotoService.getStudentPhotos())[normalisePhotoKey_(item.name || [item.firstName, item.lastName].filter(Boolean).join(" "))] || {};
      return { reference: item.photoId || item.photoUrl || indexed.fileId || "", sourceField: item.photoId ? "PhotoID" : item.photoUrl ? "Photo URL" : indexed.fileId ? "Headshot folder" : "" };
    }
    if (input.entityType === "staff") {
      const item = (requestContext_ && requestContext_.staff || StaffService.getAll()).find(record => [record.id, record.staffId, record.email, record.primaryEmail].map(value => String(value || "")).includes(input.entityId));
      const own = item && String(item.email || item.primaryEmail || "").toLowerCase() === String(user.email).toLowerCase();
      if (!item || (!own && !AuthorizationService.hasCapability(user, "Operations.View"))) throw coded_("PERMISSION_SCOPE_DENIED");
      return { reference: item.photo || "", sourceField: "Display Picture" };
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
    validateMeta_(metadata.mimeType, Number(metadata.size) || 0);
    let response;
    if (metadata.thumbnailLink) {
      const link = String(metadata.thumbnailLink).replace(/=s\d+(?:-c)?$/, "=s" + pixels + "-c");
      response = UrlFetchApp.fetch(link, options);
    } else {
      response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media", options);
    }
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
    const references = [];
    const index = ProfilePhotoService.getStudentPhotos ? ProfilePhotoService.getStudentPhotos() : {};
    ParticipantService.getAll().forEach(item => { const indexed = index[normalisePhotoKey_(item.name || [item.firstName, item.lastName].filter(Boolean).join(" "))] || {}; const value = item.photoId || item.photoUrl || indexed.fileId || ""; if (value) references.push(value); });
    StaffService.getAll().forEach(item => { if (item.photo) references.push(item.photo); });
    const parsed = references.map(parseReference);
    return { name: "Headshot delivery", status: parsed.some(item => !item.valid) ? "Degraded" : "Healthy", lastAttempted: new Date().toISOString(), lastSuccessful: new Date().toISOString(), responseMs: 0, cacheAge: "Per-user · 30 minutes", recordCount: references.length, parsed: parsed.filter(item => item.valid).length, unsupported: parsed.filter(item => !item.valid).length, inaccessible: 0, unresolved: parsed.filter(item => !item.valid).length, error: parsed.some(item => !item.valid) ? "One or more references could not be parsed" : "" };
  }

  function normaliseRequest_(request) { const type = String(request && request.entityType || "").toLowerCase(); const id = String(request && request.entityId || "").trim().slice(0, 220); const size = String(request && request.size || "card"); return { entityType: type, entityId: id, size, pixels: size === "profile" ? 640 : 180 }; }
  function normalisePhotoKey_(value) { return String(value || "").replace(/\.[^.]+$/, "").replace(/\s*-\s*Headshot$/i, "").replace(/[\-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase(); }
  function cacheKey_(input, parsed) { const identity = [input.entityType, input.entityId, input.size, parsed.fileId || parsed.url].join("|"); return "SC_IMG_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, identity)).replace(/=+$/, "").slice(0, 60); }
  function success_(input, image, started, cacheHit) { return { ok: true, entityType: input.entityType, entityId: input.entityId, dataUrl: "data:" + image.mimeType + ";base64," + Utilities.base64Encode(image.bytes), mimeType: image.mimeType, sizeBytes: image.sizeBytes, cacheHit: !!cacheHit, durationMs: Date.now() - started, errorCategory: "" }; }
  function failure_(input, category, started) { return { ok: false, entityType: input.entityType, entityId: input.entityId, dataUrl: "", mimeType: "", sizeBytes: 0, cacheHit: false, durationMs: Date.now() - started, errorCategory: category || "UNKNOWN_IMAGE_ERROR" }; }
  function coded_(category) { const err = new Error(category); err.imageCategory = category; return err; }
  function errorCategory_(err) { return err && err.imageCategory || (/not found/i.test(String(err && err.message)) ? "FILE_NOT_FOUND" : /permission|access/i.test(String(err && err.message)) ? "FILE_ACCESS_DENIED" : "UNKNOWN_IMAGE_ERROR"); }
  return { resolve, resolveMany, parseReference, getHealth };
})();
