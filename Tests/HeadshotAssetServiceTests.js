/** Manual regression tests for the canonical headshot pipeline. */
function runHeadshotAssetServiceTests() {
  const tests = [
    testHeadshotExplicitReferencePrecedence_,
    testHeadshotUniqueFilenameMatch_,
    testHeadshotDuplicateFilenameIsAmbiguous_,
    testHeadshotDuplicatePersonNameIsAmbiguous_,
    testHeadshotMissingFolderMetadata_,
    testHeadshotProjectionMetadata_,
    testHeadshotInvalidReference_,
    testHeadshotCacheInvalidation_
  ];
  const results = tests.map(test => {
    try { test(); return { test: test.name, status: "PASS" }; }
    catch (err) { return { test: test.name, status: "FAIL", error: err && err.message || String(err) }; }
  });
  const failed = results.filter(item => item.status === "FAIL");
  if (failed.length) throw new Error(JSON.stringify(results));
  return results;
}

function testHeadshotExplicitReferencePrecedence_() {
  const explicit = "12345678901234567890abc";
  const files = headshotTestFileIndex_([{ fileId: "folder-file", name: "Alex Smith.jpg" }]);
  const asset = HeadshotAssetService._test.resolveRecordAsset("participant", { name: "Alex Smith", photoId: explicit }, "student-1", files);
  assertHeadshot_(asset.fileId === explicit && asset.matchMethod === "explicit-reference", "Explicit reference did not win.");
}

function testHeadshotUniqueFilenameMatch_() {
  const files = headshotTestFileIndex_([{ fileId: "unique-file", name: "Smith, Alex - Headshot.jpg" }]);
  const asset = HeadshotAssetService._test.resolveRecordAsset("participant", { firstName: "Alex", lastName: "Smith", name: "Alex Smith" }, "student-1", files);
  assertHeadshot_(asset.fileId === "unique-file" && asset.matchStatus === "matched", "Unique filename did not match.");
}

function testHeadshotDuplicateFilenameIsAmbiguous_() {
  const files = headshotTestFileIndex_([{ fileId: "one", name: "Alex Smith.jpg" }, { fileId: "two", name: "Alex Smith copy.jpg" }]);
  const asset = HeadshotAssetService._test.resolveRecordAsset("participant", { name: "Alex Smith" }, "student-1", files);
  assertHeadshot_(asset.matchStatus === "ambiguous" && !asset.fileId, "Duplicate match was not rejected.");
}

function testHeadshotDuplicatePersonNameIsAmbiguous_() {
  const files = headshotTestFileIndex_([{ fileId: "shared", name: "Alex Smith.jpg" }]);
  const assets = {
    one: HeadshotAssetService._test.resolveRecordAsset("participant", { name: "Alex Smith" }, "one", files),
    two: HeadshotAssetService._test.resolveRecordAsset("participant", { name: "Alex Smith" }, "two", files)
  };
  HeadshotAssetService._test.rejectSharedFilenameOwners("participant", assets, { filename: 2, ambiguous: 0 });
  assertHeadshot_(assets.one.matchStatus === "ambiguous" && assets.two.matchStatus === "ambiguous", "One filename was assigned to duplicate people.");
}

function testHeadshotMissingFolderMetadata_() {
  const asset = HeadshotAssetService._test.resolveRecordAsset("staff", { staffId: "staff-1", name: "Morgan Lee" }, "staff-1", headshotTestFileIndex_([]));
  assertHeadshot_(asset.matchStatus === "unmatched" && !HeadshotAssetService._test.publicMetadata(asset).hasPhoto, "Missing staff folder should be unresolved.");
}

function testHeadshotProjectionMetadata_() {
  const asset = HeadshotAssetService._test.resolveRecordAsset("participant", { photoId: "12345678901234567890abc" }, "student-1", headshotTestFileIndex_([]));
  const metadata = HeadshotAssetService._test.publicMetadata(asset);
  assertHeadshot_(metadata.hasPhoto && metadata.assetKey && metadata.assetVersion && metadata.assetKey.indexOf("12345678901234567890abc") < 0, "Projection metadata leaked or omitted asset state.");
}

function testHeadshotInvalidReference_() {
  const asset = HeadshotAssetService._test.resolveRecordAsset("participant", { name: "Nobody", photoUrl: "not a valid reference" }, "student-1", headshotTestFileIndex_([]));
  assertHeadshot_(asset.matchStatus === "invalid-reference" && !asset.fileId, "Invalid reference status was not retained.");
}

function testHeadshotCacheInvalidation_() {
  const original = PerformanceCacheService.remove, removed = [];
  try { PerformanceCacheService.remove = key => removed.push(key); HeadshotAssetService.invalidate(); }
  finally { PerformanceCacheService.remove = original; }
  assertHeadshot_(removed.some(key => /participant/.test(key)) && removed.some(key => /staff/.test(key)), "Both asset indexes were not invalidated.");
}

function headshotTestFileIndex_(files) {
  const byKey = {};
  (files || []).forEach(file => HeadshotAssetService._test.filenameKeys(file.name).forEach(key => { if (!byKey[key]) byKey[key] = []; byKey[key].push(file); }));
  return { files: files || [], byKey, duplicateKeys: Object.keys(byKey).filter(key => byKey[key].length > 1).length };
}

function assertHeadshot_(condition, message) { if (!condition) throw new Error(message || "Headshot assertion failed."); }

/** Apps Script integration test: exercises secure proxy success and failure. */
function runSecureHeadshotProxyTests() {
  const original = {
    user: UserContextService.getCurrent,
    auth: AuthorizationService.hasCapability,
    participants: ParticipantService.getAll,
    asset: HeadshotAssetService.getAsset,
    fetch: UrlFetchApp.fetch
  };
  const results = [];
  try {
    UserContextService.getCurrent = () => ({ email: "admin@example.test", isAdmin: true, scope: { type: "production", values: [] } });
    AuthorizationService.hasCapability = () => true;
    ParticipantService.getAll = () => [{ studentKey: "student-1", id: "student-1", name: "Alex Smith" }];
    HeadshotAssetService.getAsset = () => ({ fileId: "12345678901234567890abc", assetVersion: "v1", matchMethod: "explicit-reference", matchStatus: "matched" });
    UrlFetchApp.fetch = url => /fields=id/.test(url)
      ? headshotFakeResponse_(200, JSON.stringify({ mimeType: "image/jpeg", size: 3, thumbnailLink: "https://example.test/photo=s120-c" }), null)
      : headshotFakeResponse_(200, "", { getBytes: () => [1, 2, 3], getContentType: () => "image/jpeg" });
    const success = SecureImageService.resolveMany([{ entityType: "participant", entityId: "student-1", assetVersion: "success-case", size: "small" }])[0];
    results.push({ test: "secure proxy success", passed: !!(success.ok && /^data:image\/jpeg;base64,/.test(success.dataUrl)) });

    UrlFetchApp.fetch = () => headshotFakeResponse_(403, "", null);
    const failure = SecureImageService.resolveMany([{ entityType: "participant", entityId: "student-1", assetVersion: "failure-case", size: "small" }])[0];
    results.push({ test: "secure proxy failure isolation", passed: !failure.ok && failure.errorCategory === "FILE_ACCESS_DENIED" });
  } finally {
    UserContextService.getCurrent = original.user;
    AuthorizationService.hasCapability = original.auth;
    ParticipantService.getAll = original.participants;
    HeadshotAssetService.getAsset = original.asset;
    UrlFetchApp.fetch = original.fetch;
  }
  if (results.some(item => !item.passed)) throw new Error(JSON.stringify(results));
  return results;
}

function headshotFakeResponse_(code, text, blob) {
  return { getResponseCode: () => code, getContentText: () => text || "", getBlob: () => blob, getHeaders: () => ({}) };
}
