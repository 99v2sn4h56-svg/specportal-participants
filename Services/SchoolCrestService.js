/**
 * Resolves a school crest image by school name, from a dedicated Drive
 * folder. Deliberately standalone -- NOT built on HeadshotAssetService /
 * SecureImageService, which are the already-hardened, security-critical
 * pipeline for participant/staff photos (private, PII-sensitive, access
 * controlled). Crests are public school logos with no privacy concern, so
 * this is a much simpler read: scan once, cache the name->fileId index,
 * fetch and base64-encode the specific file on request.
 */
const SchoolCrestService = (() => {
  const CANONICAL_FOLDER_ID = "1xb4ySnWNhMpOn-9s7VhQVPVIklomHaZA";
  const INDEX_CACHE_SECONDS = 12 * 60 * 60;
  const INDEX_CACHE_KEY = "schoolCrests:index:v1";

  function getFileId(schoolName) {
    const index = getIndex_();
    const keys = filenameKeys_(schoolName);
    for (let i = 0; i < keys.length; i++) {
      const matches = index.byKey[keys[i]];
      if (matches && matches.length === 1) return matches[0];
    }
    return "";
  }

  function resolveDataUrl(schoolName) {
    const fileId = getFileId(schoolName);
    if (!fileId) return { ok: false, dataUrl: "" };
    try {
      const blob = DriveApp.getFileById(fileId).getBlob();
      return { ok: true, dataUrl: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()) };
    } catch (err) {
      return { ok: false, dataUrl: "" };
    }
  }

  function getIndex_() {
    return PerformanceCacheService.getOrLoad(INDEX_CACHE_KEY, INDEX_CACHE_SECONDS, buildIndex_);
  }

  function buildIndex_() {
    const byKey = {};
    let folder, fileCount = 0;
    try { folder = DriveApp.getFolderById(CANONICAL_FOLDER_ID); }
    catch (err) { return { byKey: {}, fileCount: 0, folderAccessible: false, generatedAt: new Date().toISOString() }; }

    try {
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const name = file.getName();
        if (!isImageFile_(file, name)) continue;
        fileCount++;
        const fileId = file.getId();
        filenameKeys_(name).forEach(key => {
          if (!byKey[key]) byKey[key] = [];
          if (byKey[key].indexOf(fileId) < 0) byKey[key].push(fileId);
        });
      }
    } catch (err) {
      return { byKey: {}, fileCount: 0, folderAccessible: false, generatedAt: new Date().toISOString() };
    }

    return { byKey, fileCount, folderAccessible: true, generatedAt: new Date().toISOString() };
  }

  function isImageFile_(file, name) {
    try { if (/^image\//i.test(String(file.getMimeType() || ""))) return true; } catch (err) {}
    return /\.(?:jpe?g|png|webp|gif|svg)$/i.test(String(name || ""));
  }

  function filenameKeys_(value) {
    const noExtension = String(value || "").replace(/\.[^.]+$/, "");
    const withoutDescriptors = noExtension.replace(/\b(crest|logo|badge|school|high|public|primary|central|the)\b/gi, " ");
    const keys = [noExtension, withoutDescriptors];
    return unique_(keys.map(normaliseName_).filter(Boolean));
  }

  function normaliseName_(value) {
    return String(value || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "").replace(/[^a-zA-Z0-9]+/g, " ")
      .replace(/\s+/g, " ").trim().toLowerCase();
  }

  function unique_(values) { return Array.from(new Set(values)); }

  function invalidate() { PerformanceCacheService.remove(INDEX_CACHE_KEY); }

  function diagnostics() {
    const index = getIndex_();
    return { fileCount: index.fileCount, folderAccessible: index.folderAccessible, generatedAt: index.generatedAt, matchableKeys: Object.keys(index.byKey).length };
  }

  return { getFileId, resolveDataUrl, invalidate, diagnostics, _test: { filenameKeys: filenameKeys_, normaliseName: normaliseName_, buildIndex: buildIndex_ } };
})();
