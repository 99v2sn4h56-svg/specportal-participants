const ProfilePhotoService = (() => {
  const FOLDER_ID = "1y9A0Nwh7icSssRzTDVaR3vamCn3oWWlB";
  const CACHE_KEY = "SPEC_CENTRAL_STUDENT_PHOTOS_V2";
  const CACHE_CHUNK_SIZE = 85000;
  const CACHE_SECONDS = 6 * 60 * 60;

  function getStudentPhotos() {
    const cached = getCachedStudentPhotos();
    if (cached) return cached;

    const photos = loadStudentPhotos_();
    cachePhotos_(photos);
    return photos;
  }

  function getCachedStudentPhotos() {
    const cache = CacheService.getScriptCache();
    const metaRaw = cache.get(`${CACHE_KEY}:meta`);
    if (!metaRaw) return null;

    try {
      const meta = JSON.parse(metaRaw);
      const chunks = [];

      for (let index = 0; index < meta.chunks; index++) {
        const chunk = cache.get(`${CACHE_KEY}:${index}`);
        if (chunk === null) return null;
        chunks.push(chunk);
      }

      return JSON.parse(chunks.join(""));
    } catch (err) {
      return null;
    }
  }

  function refreshStudentPhotos() {
    clearStudentPhotosCache();
    return getStudentPhotos();
  }

  function getParticipantPhoto(participantOrKey) {
    const photos = getStudentPhotos();
    const key = toPhotoKey_(participantOrKey);
    return key ? photos[key] || null : null;
  }

  function getPhotoIndex() {
    return getStudentPhotos();
  }

  function getPhotosForParticipantIds(ids, size) {
    const photos = getStudentPhotos();
    const requested = new Set((ids || []).map(value => String(value || "").trim()).filter(Boolean));
    const output = {};
    const width = Number(size) || 160;

    Object.keys(photos || {}).forEach(key => {
      const photo = photos[key] || {};
      const fileId = photo.fileId || "";
      if (!requested.size || requested.has(key) || requested.has(fileId)) {
        output[key] = Object.assign({}, photo, {
          url: buildThumbnailUrl_(fileId, width)
        });
      }
    });

    return output;
  }

  function getTeacherPhoto(teacherOrKey) {
    const photos = getStudentPhotos();
    const key = toPhotoKey_(teacherOrKey);
    return key ? photos[key] || null : null;
  }

  function prefetchPhotos() {
    return getStudentPhotos();
  }

  function clearCache() {
    clearStudentPhotosCache();
  }

  function clearStudentPhotosCache() {
    const cache = CacheService.getScriptCache();
    const metaRaw = cache.get(`${CACHE_KEY}:meta`);
    let chunkCount = 20;

    try {
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      chunkCount = Math.max(Number(meta.chunks) || 0, chunkCount);
    } catch (err) {}

    const keys = [`${CACHE_KEY}:meta`];
    for (let index = 0; index < chunkCount; index++) {
      keys.push(`${CACHE_KEY}:${index}`);
    }

    cache.removeAll(keys);
  }

  function loadStudentPhotos_() {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFiles();
    const photos = {};

    while (files.hasNext()) {
      const file = files.next();
      const key = file.getName()
        .replace(/\.[^.]+$/, "")
        .replace(/\s*-\s*Headshot$/i, "")
        .replace(/[\-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      photos[key] = {
        fileId: file.getId(),
        url: buildThumbnailUrl_(file.getId(), 300),
        thumbnailUrl: buildThumbnailUrl_(file.getId(), 120),
        profileUrl: buildThumbnailUrl_(file.getId(), 480)
      };
    }

    return photos;
  }

  function getPhotoDiagnostics() {
    const cached = getCachedStudentPhotos();
    const photos = cached || getStudentPhotos();
    return {
      folderConfigured: !!FOLDER_ID,
      folderIdTail: FOLDER_ID ? FOLDER_ID.slice(-6) : "",
      cacheHit: !!cached,
      photoCount: Object.keys(photos || {}).length,
      generatedAt: new Date().toISOString(),
      urlStrategy: "drive-thumbnail"
    };
  }

  function toPhotoKey_(source) {
    if (!source) return "";

    if (typeof source === "string") {
      return normalisePhotoKey_(source);
    }

    const name = source.name ||
      source.fullName ||
      source.studentName ||
      source["Student Name"] ||
      [source.firstName || source.studentFirstName || source["Student First Name"], source.lastName || source.studentLastName || source["Student Last Name"]].filter(Boolean).join(" ") ||
      source.teacherName ||
      source.displayName ||
      "";

    return normalisePhotoKey_(name);
  }

  function normalisePhotoKey_(value) {
    return String(value || "")
      .replace(/\.[^.]+$/, "")
      .replace(/\s*-\s*Headshot$/i, "")
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function buildThumbnailUrl_(fileId, size) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size || 300}`;
  }

  function cachePhotos_(photos) {
    const cache = CacheService.getScriptCache();
    const payload = JSON.stringify(photos || {});
    const chunks = [];

    for (let index = 0; index < payload.length; index += CACHE_CHUNK_SIZE) {
      chunks.push(payload.slice(index, index + CACHE_CHUNK_SIZE));
    }

    chunks.forEach((chunk, index) => {
      cache.put(`${CACHE_KEY}:${index}`, chunk, CACHE_SECONDS);
    });

    cache.put(`${CACHE_KEY}:meta`, JSON.stringify({
      chunks: chunks.length,
      cachedAt: new Date().toISOString()
    }), CACHE_SECONDS);
  }

  return {
    getStudentPhotos,
    getCachedStudentPhotos,
    refreshStudentPhotos,
    clearStudentPhotosCache,
    getPhotoIndex,
    getPhotosForParticipantIds,
    getPhotoDiagnostics,
    getParticipantPhoto,
    getTeacherPhoto,
    prefetchPhotos,
    clearCache
  };
})();
