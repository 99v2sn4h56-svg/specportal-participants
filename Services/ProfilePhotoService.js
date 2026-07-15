/**
 * Compatibility facade for older callers. Folder discovery, matching and
 * Drive access now belong exclusively to HeadshotAssetService.
 */
const ProfilePhotoService = (() => {
  function getStudentPhotos() { return HeadshotAssetService.getMetadataMany("participant"); }
  function getCachedStudentPhotos() { return getStudentPhotos(); }
  function refreshStudentPhotos() { HeadshotAssetService.invalidate("participant"); return getStudentPhotos(); }
  function getParticipantPhoto(participantOrKey) {
    const key = typeof participantOrKey === "string" ? participantOrKey : String(participantOrKey && (participantOrKey.studentKey || participantOrKey.id) || "");
    return getStudentPhotos()[key] || null;
  }
  function getPhotoIndex() { return getStudentPhotos(); }
  function getPhotosForParticipantIds(ids) {
    const requested = new Set((ids || []).map(String));
    const metadata = getStudentPhotos();
    return Object.keys(metadata).reduce((output, key) => { if (!requested.size || requested.has(key)) output[key] = metadata[key]; return output; }, {});
  }
  function getTeacherPhoto() { return null; }
  function prefetchPhotos() { return getStudentPhotos(); }
  function clearCache() { HeadshotAssetService.invalidate("participant"); }
  function clearStudentPhotosCache() { clearCache(); }
  function getPhotoDiagnostics() { return HeadshotAssetService.diagnostics().find(item => item.entityType === "participant") || {}; }
  return { getStudentPhotos, getCachedStudentPhotos, refreshStudentPhotos, clearStudentPhotosCache, getPhotoIndex, getPhotosForParticipantIds, getPhotoDiagnostics, getParticipantPhoto, getTeacherPhoto, prefetchPhotos, clearCache };
})();
