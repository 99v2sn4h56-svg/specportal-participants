/**
 * Canonical headshot ownership and resolution boundary.
 *
 * Drive IDs remain server-side. Browser projections receive only hasPhoto,
 * assetKey and assetVersion. Folder-name matching happens while this cached
 * index is built, never during an individual browser image request.
 */
const HeadshotAssetService = (() => {
  const CONTRACT = "headshot-asset-v3";
  const CACHE_SECONDS = 6 * 60 * 60;
  const LEGACY_PARTICIPANT_FOLDER_ID = "1y9A0Nwh7icSssRzTDVaR3vamCn3oWWlB";
  const CONFIG = Object.freeze({
    participantFolderProperty: "HEADSHOT_PARTICIPANT_FOLDER_ID",
    staffFolderProperty: "HEADSHOT_STAFF_FOLDER_ID"
  });
  const SIZES = Object.freeze(["small", "medium", "large"]);

  function resolveMany(requests) {
    const normalised = normaliseMany_(requests);
    return decorate_(SecureImageService.resolveMany(normalised), normalised);
  }

  function resolveTrustedMany(requests) {
    const normalised = normaliseMany_(requests).filter(item => item.entityType === "participant");
    return decorate_(SecureImageService.resolveMany(normalised, {
      trustedParticipantIds: normalised.map(item => item.entityId)
    }), normalised);
  }

  function getMetadataMany(entityType, records) {
    const index = getIndex_(entityType, records);
    const requested = Array.isArray(records) ? new Set(records.map(record => stableId_(normaliseEntityType_(entityType), record)).filter(Boolean)) : null;
    return Object.keys(index.assets || {}).reduce((output, stableId) => {
      if (requested && !requested.has(stableId)) return output;
      const asset = index.assets[stableId];
      output[stableId] = publicMetadata_(asset);
      return output;
    }, {});
  }

  function getAsset(entityType, stableEntityId, records) {
    const stableId = String(stableEntityId || "").trim();
    if (!stableId) return unresolved_(entityType, stableId, "missing-stable-id");
    const index = getIndex_(entityType, records);
    return index.assets[stableId] || unresolved_(entityType, stableId, "unmatched");
  }

  function getIndex_(entityType) {
    const type = normaliseEntityType_(entityType);
    const key = `headshots:index:${CONTRACT}:${type}`;
    // Never let a permission-filtered request create a partial shared index.
    // The canonical index is always built from the complete server-side source.
    return PerformanceCacheService.getOrLoad(key, CACHE_SECONDS, () => buildIndex_(type));
  }

  function buildIndex_(entityType, records) {
    const sourceRecords = Array.isArray(records) ? records : entityType === "participant" ? ParticipantService.getAll() : StaffService.getAll();
    const folderId = getFolderId_(entityType);
    const fileIndex = folderId ? scanFolder_(folderId) : emptyFileIndex_();
    const assets = {};
    const counts = { explicit: 0, filename: 0, ambiguous: 0, unmatched: 0, invalidReference: 0 };

    sourceRecords.forEach(record => {
      const stableId = stableId_(entityType, record);
      if (!stableId) return;
      const resolved = resolveRecordAsset_(entityType, record, stableId, fileIndex);
      assets[stableId] = resolved;
      if (resolved.matchMethod === "explicit-reference" && resolved.matchStatus === "matched") counts.explicit++;
      else if (resolved.matchMethod === "unique-filename" && resolved.matchStatus === "matched") counts.filename++;
      else if (resolved.matchStatus === "ambiguous") counts.ambiguous++;
      else { counts.unmatched++; if (resolved.matchStatus === "invalid-reference") counts.invalidReference++; }
    });

    // A filename is not a stable identity. If one folder file would be assigned
    // to multiple people with the same name, reject every inferred association.
    rejectSharedFilenameOwners_(entityType, assets, counts);

    return {
      contract: CONTRACT,
      entityType,
      folderConfigured: !!folderId,
      generatedAt: new Date().toISOString(),
      fileCount: fileIndex.files.length,
      duplicateKeys: fileIndex.duplicateKeys,
      counts,
      assets
    };
  }

  function resolveRecordAsset_(entityType, record, stableId, fileIndex) {
    const explicit = explicitReference_(entityType, record);
    if (explicit) {
      const parsed = parseReference(explicit);
      if (parsed.valid && parsed.type === "drive") {
        return asset_(entityType, stableId, parsed.fileId, "explicit-reference", "matched", record.lastUpdated);
      }
      if (parsed.valid && parsed.type === "https") {
        return asset_(entityType, stableId, "", "explicit-reference", "matched", record.lastUpdated, parsed.url);
      }
      // An invalid explicit value must not block a valid unique folder match,
      // but its terminal status remains visible when no match exists.
    }

    const match = matchRecord_(record, fileIndex);
    if (match.status === "matched") {
      return asset_(entityType, stableId, match.fileId, "unique-filename", "matched", match.updatedAt || record.lastUpdated);
    }
    return unresolved_(entityType, stableId, explicit && match.status === "unmatched" ? "invalid-reference" : match.status);
  }

  function scanFolder_(folderId) {
    const files = [], byKey = {};
    const iterator = DriveApp.getFolderById(folderId).getFiles();
    while (iterator.hasNext()) {
      const file = iterator.next();
      const entry = { fileId: file.getId(), name: file.getName(), updatedAt: safeDate_(file) };
      files.push(entry);
      filenameKeys_(entry.name).forEach(key => {
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(entry);
      });
    }
    return { files, byKey, duplicateKeys: Object.keys(byKey).filter(key => byKey[key].length > 1).length };
  }

  function matchRecord_(record, fileIndex) {
    const candidates = {};
    entityNameKeys_(record).forEach(key => (fileIndex.byKey[key] || []).forEach(file => { candidates[file.fileId] = file; }));
    const values = Object.keys(candidates).map(id => candidates[id]);
    if (values.length === 1) return { status: "matched", fileId: values[0].fileId, updatedAt: values[0].updatedAt };
    if (values.length > 1) return { status: "ambiguous", candidateCount: values.length };
    return { status: "unmatched", candidateCount: 0 };
  }

  function rejectSharedFilenameOwners_(entityType, assets, counts) {
    const inferredOwners = {};
    Object.keys(assets).forEach(stableId => {
      const value = assets[stableId];
      if (value.matchMethod !== "unique-filename" || !value.fileId) return;
      if (!inferredOwners[value.fileId]) inferredOwners[value.fileId] = [];
      inferredOwners[value.fileId].push(stableId);
    });
    Object.keys(inferredOwners).forEach(fileId => {
      const owners = inferredOwners[fileId];
      if (owners.length < 2) return;
      owners.forEach(stableId => { assets[stableId] = unresolved_(entityType, stableId, "ambiguous"); });
      counts.filename -= owners.length;
      counts.ambiguous += owners.length;
    });
    return assets;
  }

  function entityNameKeys_(record) {
    const first = String(record.firstName || record.preferredName || "").trim();
    const last = String(record.lastName || "").trim();
    const display = String(record.name || record.displayName || record.fullName || "").trim();
    const names = [display, [first, last].filter(Boolean).join(" "), [last, first].filter(Boolean).join(" ")];
    return unique_(names.flatMap(filenameKeys_));
  }

  function filenameKeys_(value) {
    const noExtension = String(value || "").replace(/\.[^.]+$/, "");
    const withoutDescriptors = noExtension.replace(/\b(headshot|photo|profile|portrait|image|student)\b/gi, " ");
    const keys = [withoutDescriptors, withoutDescriptors.replace(/\s*\([^)]*\)\s*/g, " "), withoutDescriptors.replace(/\s+(?:-\s*)?copy\b/gi, " ")];
    const comma = withoutDescriptors.match(/^([^,]+),\s*(.+)$/);
    if (comma) keys.push(`${comma[2]} ${comma[1]}`);
    return unique_(keys.map(normaliseName_).filter(Boolean));
  }

  function normaliseName_(value) {
    return String(value || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "").replace(/[^a-zA-Z0-9]+/g, " ")
      .replace(/\s+/g, " ").trim().toLowerCase();
  }

  function parseReference(value) {
    const first = String(value || "").split(/[\n,]+/).map(item => item.trim()).filter(Boolean)[0] || "";
    if (!first) return { valid: false, errorCategory: "NO_IMAGE_REFERENCE" };
    const patterns = [/\/file\/d\/([a-zA-Z0-9_-]{20,})/, /[?&]id=([a-zA-Z0-9_-]{20,})/, /\/d\/([a-zA-Z0-9_-]{20,})/, /^([a-zA-Z0-9_-]{20,})$/];
    for (let index = 0; index < patterns.length; index++) {
      const match = first.match(patterns[index]);
      if (match) return { type: "drive", fileId: match[1], valid: true };
    }
    if (/^https:\/\//i.test(first)) return { type: "https", url: first, valid: true };
    return { valid: false, errorCategory: /drive|docs\.google/i.test(first) ? "FILE_ID_PARSE_FAILED" : "UNSUPPORTED_REFERENCE" };
  }

  function getFolderId_(entityType) {
    const properties = PropertiesService.getScriptProperties();
    const property = entityType === "participant" ? CONFIG.participantFolderProperty : CONFIG.staffFolderProperty;
    const configured = String(properties.getProperty(property) || "").trim();
    return configured || (entityType === "participant" ? LEGACY_PARTICIPANT_FOLDER_ID : "");
  }

  function invalidate(entityType) {
    const types = entityType ? [normaliseEntityType_(entityType)] : ["participant", "staff"];
    types.forEach(type => PerformanceCacheService.remove(`headshots:index:${CONTRACT}:${type}`));
    CacheService.getScriptCache().put("SC_HEADSHOT_EPOCH", String(Date.now()), 21600);
  }

  function refresh(entityType) {
    const types = entityType ? [normaliseEntityType_(entityType)] : ["participant", "staff"];
    invalidate(entityType);
    return types.map(type => diagnostics_(getIndex_(type)));
  }

  function diagnostics() {
    return ["participant", "staff"].map(type => diagnostics_(getIndex_(type)));
  }

  function testResolution(entityType, stableEntityId) {
    const asset = getAsset(entityType, stableEntityId);
    return { metadata: publicMetadata_(asset), internal: { matchMethod: asset.matchMethod, matchStatus: asset.matchStatus, updatedAt: asset.updatedAt }, delivery: asset.matchStatus === "matched" ? resolveMany([{ entityType, stableId: stableEntityId, size: "small" }])[0] : null };
  }

  function diagnostics_(index) {
    return { entityType: index.entityType, contract: index.contract, folderConfigured: index.folderConfigured, generatedAt: index.generatedAt, fileCount: index.fileCount, duplicateKeys: index.duplicateKeys, counts: index.counts };
  }

  function publicMetadata_(asset) {
    const matched = !!asset && asset.matchStatus === "matched";
    return { hasPhoto: matched, assetKey: matched ? `${asset.entityType}:${digest_(asset.stableEntityId, 24)}:headshot` : "", assetVersion: matched ? asset.assetVersion : "", matchStatus: asset ? asset.matchStatus : "unmatched" };
  }

  function asset_(entityType, stableId, fileId, matchMethod, matchStatus, updatedAt, url) {
    const versionSource = [fileId || url || "", updatedAt || ""].join("|");
    return { entityType, stableEntityId: stableId, fileId: fileId || "", url: url || "", assetVersion: digest_(versionSource, 16), matchMethod, matchStatus, updatedAt: String(updatedAt || new Date().toISOString()) };
  }
  function unresolved_(entityType, stableId, status) { return { entityType: normaliseEntityType_(entityType), stableEntityId: String(stableId || ""), fileId: "", url: "", assetVersion: "", matchMethod: "none", matchStatus: status || "unmatched", updatedAt: "" }; }
  function explicitReference_(entityType, record) { return entityType === "participant" ? record.photoId || record.photoUrl || "" : record.photoId || record.photoUrl || record.photo || ""; }
  function stableId_(entityType, record) { return String(entityType === "participant" ? record.studentKey || record.id : record.staffId || record.email || record.primaryEmail || record.id || "").trim(); }
  function normaliseEntityType_(value) { const type = String(value || "").toLowerCase(); if (!["participant", "staff"].includes(type)) throw new Error("Unsupported headshot owner type."); return type; }
  function emptyFileIndex_() { return { files: [], byKey: {}, duplicateKeys: 0 }; }
  function safeDate_(file) { try { return file.getLastUpdated().toISOString(); } catch (_) { return ""; } }
  function unique_(values) { return Array.from(new Set((values || []).filter(Boolean))); }
  function digest_(value, length) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""))).replace(/=+$/, "").slice(0, length || 24); }

  function decorate_(results, requests) {
    return (results || []).map((result, index) => Object.assign({}, result, { stableId: requests[index].entityId, requestedSize: requests[index].size, storage: "drive-private-proxy", provider: "DriveAssetAdapter", assetContract: CONTRACT }));
  }
  function normaliseMany_(requests) { return (Array.isArray(requests) ? requests : []).slice(0, 12).map(normalise_); }
  function normalise_(request) {
    const entityType = normaliseEntityType_(request && request.entityType || "participant");
    const stableId = String(request && (request.stableId || request.entityId) || "").trim().slice(0, 220);
    const size = String(request && request.size || "medium").toLowerCase();
    if (!stableId) throw new Error("A stable asset owner ID is required.");
    return { entityType, entityId: stableId, assetVersion: String(request && request.assetVersion || ""), size: SIZES.includes(size) ? size : size === "profile" ? "large" : size === "card" ? "small" : "medium" };
  }
  function getContract() { return { version: CONTRACT, ownerKey: "stableId", entityTypes: ["participant", "staff"], sizes: SIZES.slice(), currentStorage: "private Drive adapter behind authenticated proxy", futureStorage: "private Cloud Storage adapter", delivery: "permission-scoped ephemeral response", rawStorageReferencesExposed: false, configurationProperties: Object.assign({}, CONFIG) }; }

  return { resolveMany, resolveTrustedMany, getMetadataMany, getAsset, parseReference, invalidate, refresh, diagnostics, testResolution, getContract, _test: { normaliseName: normaliseName_, filenameKeys: filenameKeys_, matchRecord: matchRecord_, resolveRecordAsset: resolveRecordAsset_, rejectSharedFilenameOwners: rejectSharedFilenameOwners_, buildIndex: buildIndex_, publicMetadata: publicMetadata_ } };
})();
