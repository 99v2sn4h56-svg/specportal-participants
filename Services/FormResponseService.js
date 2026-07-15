/**
 * Shared form definitions, publishing, Drive storage and profile associations.
 * Definitions live in Script Properties; response records live in the spreadsheet
 * selected by the form owner. Uploaded files are saved below the selected folder.
 */
const FormResponseService = (() => {
  const DEFINITIONS_KEY = "SC_SHARED_FORM_DEFINITIONS_V2";
  const RESPONSE_INDEX_KEY = "SC_FORM_RESPONSE_PROFILE_INDEX_V1";
  const RESPONSE_SHEET = "Responses";
  const UPLOAD_TYPES = ["file_upload", "photo_upload", "video_upload", "signature"];
  const FILE_UPLOAD_TYPES = ["file_upload", "photo_upload", "video_upload"];
  const MAX_UPLOAD_MB = 500;
  const INLINE_UPLOAD_MB = 5;
  // Drive resumable chunks must be a multiple of 256 KB. Keeping chunks small
  // also avoids sending a very large value through google.script.run.
  const RESUMABLE_CHUNK_BYTES = 3 * 1024 * 1024;
  const UPLOAD_SESSION_SECONDS = 6 * 60 * 60;
  const UPLOAD_CACHE_PREFIX = "SC_FORM_UPLOAD_V1_";

  function listDefinitions() {
    return readJson_(DEFINITIONS_KEY, []);
  }

  function saveDefinition(input) {
    const form = sanitiseDefinition_(input || {});
    if (!form.id) form.id = makeId_("form");
    const items = listDefinitions();
    const existingIndex = items.findIndex(item => item.id === form.id);
    const existing = existingIndex >= 0 ? items[existingIndex] : null;
    if (form.status === "Published" && !Array.isArray(form.publishedQuestions)) form.publishedQuestions = JSON.parse(JSON.stringify(existing && existing.publishedQuestions || existing && existing.questions || form.questions || []));
    const now = new Date().toISOString();
    form.createdAt = form.createdAt || now;
    form.updatedAt = now;
    if (existingIndex >= 0) items[existingIndex] = form;
    else items.push(form);
    writeJson_(DEFINITIONS_KEY, items);
    return publicOwnerDefinition_(form);
  }

  function publishDefinition(input) {
    let form = sanitiseDefinition_(input || {});
    if (!form.name) throw new Error("Give the form a name before publishing.");
    validateWorkflow_(form);
    form.publishedQuestions = JSON.parse(JSON.stringify(form.questions || []));
    if (form.source === "google") {
      if (!/^https:\/\/docs\.google\.com\/forms\//i.test(form.googleFormUrl || "")) throw new Error("Add a valid Google Form URL before publishing.");
      const googleForm = FormApp.openByUrl(form.googleFormUrl);
      form.googleFormId = googleForm.getId();
      form.storage = provisionStorage_(form);
      googleForm.setDestination(FormApp.DestinationType.SPREADSHEET, form.storage.spreadsheetId);
      installGoogleFormTrigger_(googleForm);
      form.status = "Published";
      form.publishedAt = new Date().toISOString();
      form.publicUrl = googleForm.getPublishedUrl ? googleForm.getPublishedUrl() : form.googleFormUrl;
      return saveDefinition(form);
    }
    form.storage = provisionStorage_(form);
    form.status = "Published";
    form.publishedAt = new Date().toISOString();
    form.publicUrl = ScriptApp.getService().getUrl() + "?form=" + encodeURIComponent(form.id);
    return saveDefinition(form);
  }

  function importGoogleFormQuestions(url) {
    if (!/^https:\/\/docs\.google\.com\/forms\//i.test(String(url || ""))) throw new Error("Add a valid Google Form URL.");
    const googleForm = FormApp.openByUrl(url), questions = [];
    googleForm.getItems().forEach(item => {
      const kind=String(item.getType()),base={id:makeId_("question"),type:"large_text",label:item.getTitle()||"Untitled question",help:item.getHelpText?item.getHelpText():"",required:false,options:[],optionRules:[],allowOther:false,mapping:""};
      try { if(kind==="PAGE_BREAK")base.type="page_section";else if(kind==="SECTION_HEADER")base.type="text_section";else if(kind==="PARAGRAPH_TEXT"||kind==="TEXT")base.type="large_text";else if(kind==="LIST"){base.type="dropdown_single";base.options=item.asListItem().getChoices().map(choice=>choice.getValue());}else if(kind==="MULTIPLE_CHOICE"){base.type="single_selection";base.options=item.asMultipleChoiceItem().getChoices().map(choice=>choice.getValue());base.allowOther=!!(item.asMultipleChoiceItem().hasOtherOption&&item.asMultipleChoiceItem().hasOtherOption());}else if(kind==="CHECKBOX"){base.type="dropdown_multi";base.options=item.asCheckboxItem().getChoices().map(choice=>choice.getValue());base.allowOther=!!(item.asCheckboxItem().hasOtherOption&&item.asCheckboxItem().hasOtherOption());}else if(kind==="SCALE")base.type="number";else if(kind==="GRID"||kind==="CHECKBOX_GRID")base.type="table";else if(kind==="FILE_UPLOAD")base.type="file_upload";base.required=!!(item.isRequired&&item.isRequired());}catch(_){base.type="large_text";}base.optionRules=(base.options||[]).map(()=>({action:"",target:""}));questions.push(base);
    });
    return questions;
  }

  function getPublicDefinition(formId, workflowContext) {
    const form = listDefinitions().find(item => item.id === String(formId || ""));
    if (!form || form.status !== "Published") return null;
    const user = currentIdentity_();
    return {
      id: form.id,
      name: form.name,
      description: form.description,
      programId: form.programId,
      questions: publishedQuestions_(form),
      eventPayload: publicEventPayload_(form.eventPayload),
      prefill: form.prefill || {},
      status: form.status,
      user: user,
      workflowContext: workflowContext || {}
    };
  }

  function submitResponse(request) {
    request = request || {};
    const form = listDefinitions().find(item => item.id === String(request.formId || ""));
    if (!form || form.status !== "Published" || form.source === "google") throw new Error("This form is not available for responses.");
    const responseForm = Object.assign({}, form, { questions: publishedQuestions_(form) });
    const answers = request.answers || {};
    validateRequired_(responseForm, answers, request.activeQuestionIds);
    const storage = provisionStorage_(responseForm);
    form.storage = storage;
    responseForm.storage = storage;
    const mapped = mapAnswers_(responseForm, answers);
    const signedInEmail = Session.getActiveUser().getEmail() || "";
    const responseEmail = normaliseEmail_(mapped.responderEmail || signedInEmail);
    const profile = matchProfile_(responseEmail, mapped);
    const responseId = makeId_("response");
    const submittedAt = new Date().toISOString();
    enforceResponseLimits_(responseForm, storage.spreadsheetId, answers);
    const uploads = saveUploads_(responseForm, request.files || [], answers, mapped, responseId);
    appendResponse_(responseForm, storage.spreadsheetId, {
      responseId,
      submittedAt,
      signedInEmail,
      responseEmail,
      profile,
      answers,
      uploads
    });
    const responseEntry = {
      responseId,
      formId: form.id,
      formName: form.name,
      submittedAt,
      profileType: profile.type,
      profileId: profile.id,
      profileName: profile.name,
      profileEmail: responseEmail,
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/" + storage.spreadsheetId + "/edit",
      parentResponseId: String(request.parentResponseId || ""),
      workflowStepId: String(request.workflowStepId || "")
    };
    if (responseEntry.parentResponseId && responseEntry.workflowStepId) completeWorkflowStep_(responseEntry.parentResponseId, responseEntry.workflowStepId, responseEntry, profile);
    else responseEntry.workflow = buildWorkflow_(form, answers, mapped, responseId);
    indexResponse_(responseEntry);
    // Event permission forms remain ordinary Forms definitions. This hook only
    // advances the linked Event Manager request only when the unique request
    // reference and stable Participant ID agree; display names are never keys.
    try { EventWorkflowService.recordPermissionResponse(form.id, profile, responseId, mapped); } catch (_) {}
    sendWorkflowMessages_(form, responseEntry, answers, mapped);
    saveDefinition(form);
    return { ok: true, responseId, submittedAt, profile, message: profile.type ? "Response saved and linked to " + profile.name + "." : "Response saved. No matching student or staff profile was found for " + (responseEmail || "the supplied email") + "." };
  }

  /**
   * Opens a server-owned Drive resumable upload. The OAuth-bearing Drive URL is
   * retained in Script Cache and is never exposed to the public form client.
   */
  function startResumableUpload(request) {
    request = request || {};
    cleanupUploadSessions_();
    const context = uploadContext_(request.formId, request.questionId);
    const size = Math.floor(Number(request.size || 0));
    const limitBytes = uploadLimitMb_(context.question) * 1024 * 1024;
    if (!size || size > limitBytes || size > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new Error(context.question.label + " exceeds the " + uploadLimitMb_(context.question) + " MB limit.");
    }

    const answers = request.answers || {};
    const mapped = mapAnswers_(context.form, answers);
    const token = Utilities.getUuid().replace(/-/g, "");
    const temporaryName = makeUploadFileName_(context.question, request.name, context.form, answers, mapped, "upload-" + token.slice(0, 10));
    const response = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id%2Cname%2CwebViewLink", {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": String(request.mimeType || "application/octet-stream"),
        "X-Upload-Content-Length": String(size)
      },
      payload: JSON.stringify({ name: temporaryName, parents: [context.folderId] }),
      muteHttpExceptions: true,
      followRedirects: false
    });
    const code = response.getResponseCode();
    const headers = response.getHeaders();
    const sessionUrl = headers.Location || headers.location;
    if (code < 200 || code >= 300 || !sessionUrl) throw new Error("Google Drive could not start the upload (" + code + ").");

    putUploadSession_(token, {
      state: "uploading",
      sessionUrl,
      formId: context.form.id,
      questionId: context.question.id,
      folderId: context.folderId,
      size,
      offset: 0,
      mimeType: String(request.mimeType || "application/octet-stream"),
      originalName: cleanFileName_(request.name || "upload")
    });
    return { token, offset: 0, chunkSize: RESUMABLE_CHUNK_BYTES, maxSizeMb: uploadLimitMb_(context.question) };
  }

  /** Proxies one bounded chunk to Drive and returns the next byte offset. */
  function uploadResumableChunk(request) {
    request = request || {};
    const token = String(request.token || "").replace(/[^a-zA-Z0-9]/g, "");
    const session = getUploadSession_(token);
    if (!session || session.state !== "uploading") throw new Error("This upload session has expired. Please choose the file and try again.");
    const offset = Math.floor(Number(request.offset || 0));
    if (offset !== Number(session.offset || 0)) throw new Error("The upload chunk is out of sequence. Please try the upload again.");
    const bytes = Utilities.base64Decode(String(request.data || ""));
    if (!bytes.length || bytes.length > RESUMABLE_CHUNK_BYTES) throw new Error("The upload chunk is invalid.");
    const end = offset + bytes.length - 1;
    if (end >= session.size) throw new Error("The upload chunk exceeds the declared file size.");

    const response = UrlFetchApp.fetch(session.sessionUrl, {
      method: "put",
      contentType: session.mimeType,
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        "Content-Range": "bytes " + offset + "-" + end + "/" + session.size
      },
      payload: bytes,
      muteHttpExceptions: true,
      followRedirects: false
    });
    const code = response.getResponseCode();
    if (code === 308) {
      const headers = response.getHeaders();
      const acknowledged = String(headers.Range || headers.range || "").match(/bytes=\d+-(\d+)$/);
      session.offset = acknowledged ? Number(acknowledged[1]) + 1 : end + 1;
      putUploadSession_(token, session);
      return { complete: false, offset: session.offset, size: session.size };
    }
    if (code !== 200 && code !== 201) throw new Error("Google Drive rejected an upload chunk (" + code + ").");
    const result = JSON.parse(response.getContentText() || "{}");
    if (!result.id) throw new Error("Google Drive completed the upload without returning a file ID.");
    session.state = "complete";
    session.fileId = result.id;
    session.offset = session.size;
    delete session.sessionUrl;
    putUploadSession_(token, session);
    return { complete: true, offset: session.size, size: session.size };
  }

  function handleGoogleFormSubmit(event) {
    if (!event || !event.source || !event.response) return;
    const googleFormId = event.source.getId();
    const form = listDefinitions().find(item => item.googleFormId === googleFormId && item.status === "Published");
    if (!form) return;
    const responseForm = Object.assign({}, form, { questions: publishedQuestions_(form) });
    const byLabel = {};
    event.response.getItemResponses().forEach(itemResponse => { byLabel[itemResponse.getItem().getTitle()] = itemResponse.getResponse(); });
    const answers = {};
    (responseForm.questions || []).forEach(question => { if (Object.prototype.hasOwnProperty.call(byLabel, question.label)) answers[question.id] = byLabel[question.label]; });
    const mapped = mapAnswers_(responseForm, answers);
    const responseEmail = normaliseEmail_(mapped.responderEmail || event.response.getRespondentEmail && event.response.getRespondentEmail() || "");
    const profile = matchProfile_(responseEmail, mapped), responseId = "google-response-" + event.response.getId(), submittedAt = event.response.getTimestamp().toISOString();
    enforceResponseLimits_(responseForm, form.storage.spreadsheetId, answers);
    const uploads = organiseGoogleFormUploads_(responseForm, answers, mapped, responseId);
    appendResponse_(responseForm, form.storage.spreadsheetId, { responseId, submittedAt, signedInEmail: responseEmail, responseEmail, profile, answers, uploads });
    const responseEntry = { responseId, formId: form.id, formName: form.name, submittedAt, profileType: profile.type, profileId: profile.id, profileName: profile.name, profileEmail: responseEmail, spreadsheetUrl: form.storage.spreadsheetUrl, parentResponseId: "", workflowStepId: "" };
    responseEntry.workflow = buildWorkflow_(form, answers, mapped, responseId);
    indexResponse_(responseEntry);
    sendWorkflowMessages_(form, responseEntry, answers, mapped);
  }

  function responsesForProfile(type, id, email) {
    const wantedType = String(type || "").toLowerCase();
    const wantedId = String(id || "").toLowerCase();
    const wantedEmail = normaliseEmail_(email);
    return readJson_(RESPONSE_INDEX_KEY, []).filter(item => {
      return (wantedType && String(item.profileType || "").toLowerCase() === wantedType && wantedId && String(item.profileId || "").toLowerCase() === wantedId) ||
        (wantedEmail && normaliseEmail_(item.profileEmail) === wantedEmail);
    }).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  }

  function getWorkspaceData(formId) {
    const responses = readJson_(RESPONSE_INDEX_KEY, []);
    const forms = listDefinitions().map(form => {
      const formResponses = responses.filter(item => item.formId === form.id);
      return Object.assign(publicOwnerDefinition_(form), {
        responseCount: formResponses.length,
        lastResponseAt: formResponses.length ? formResponses.map(item => item.submittedAt).sort().pop() : "",
        matchedStudents: formResponses.filter(item => item.profileType === "student").length,
        matchedStaff: formResponses.filter(item => item.profileType === "staff").length,
        unmatchedResponses: formResponses.filter(item => !item.profileType).length
      });
    });
    const selectedResponses = formId ? responses.filter(item => item.formId === formId).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))) : [];
    return { forms, responses: selectedResponses, generatedAt: new Date().toISOString() };
  }

  function setStatus(formId, status) {
    const allowed = ["Draft", "Published", "Archived"];
    if (!allowed.includes(status)) throw new Error("Unsupported form status.");
    const form = listDefinitions().find(item => item.id === String(formId || ""));
    if (!form) throw new Error("Form not found.");
    form.status = status;
    if (status === "Archived") form.archivedAt = new Date().toISOString();
    else delete form.archivedAt;
    return saveDefinition(form);
  }

  function provisionStorage_(form) {
    const storage = Object.assign({ mode: "new", spreadsheetId: "", spreadsheetUrl: "", folderId: "", folderUrl: "", spreadsheetName: "", folderName: "" }, form.storage || {});
    let folder = null;
    const requestedFolderId = extractDriveId_(storage.folderId || storage.folderUrl);
    if (requestedFolderId) folder = DriveApp.getFolderById(requestedFolderId);
    if (!folder) folder = DriveApp.createFolder(cleanFileName_(storage.folderName || form.name + " — responses"));

    let spreadsheet;
    const requestedSpreadsheetId = extractDriveId_(storage.spreadsheetId || storage.spreadsheetUrl);
    if ((storage.mode === "existing" || requestedSpreadsheetId) && requestedSpreadsheetId) {
      spreadsheet = SpreadsheetApp.openById(requestedSpreadsheetId);
      try { folder.addFile(DriveApp.getFileById(spreadsheet.getId())); } catch (_) {}
    }
    else {
      spreadsheet = SpreadsheetApp.create(storage.spreadsheetName || form.name + " — responses");
      const file = DriveApp.getFileById(spreadsheet.getId());
      folder.addFile(file);
      try { DriveApp.getRootFolder().removeFile(file); } catch (_) {}
    }
    ensureResponseSheet_(spreadsheet, form);

    const questionFolders = Object.assign({}, storage.questionFolders || {});
    (form.questions || []).filter(question => UPLOAD_TYPES.includes(question.type)).forEach(question => {
      if (!questionFolders[question.id]) questionFolders[question.id] = folder.createFolder(cleanFileName_(question.uploadFolderName || question.label || "Uploads")).getId();
    });
    return {
      mode: requestedSpreadsheetId ? "existing" : "new",
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      spreadsheetName: spreadsheet.getName(),
      folderId: folder.getId(),
      folderUrl: folder.getUrl(),
      folderName: folder.getName(),
      questionFolders
    };
  }

  function appendResponse_(form, spreadsheetId, response) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ensureResponseSheet_(spreadsheet, form);
    const headers = responseHeaders_(form);
    const uploadByQuestion = {};
    (response.uploads || []).forEach(upload => { uploadByQuestion[upload.questionId] = (uploadByQuestion[upload.questionId] || []).concat(upload.url); });
    const fixed = [response.responseId, response.submittedAt, response.signedInEmail, response.responseEmail, response.profile.type, response.profile.id, response.profile.name, form.id, form.name];
    const values = responseQuestions_(form).map(question => {
      if (uploadByQuestion[question.id]) return uploadByQuestion[question.id].join("\n");
      const answer = response.answers[question.id];
      return typeof answer === "object" ? JSON.stringify(answer) : String(answer == null ? "" : answer);
    });
    sheet.appendRow(fixed.concat(values));
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  function ensureResponseSheet_(spreadsheet, form) {
    let sheet = spreadsheet.getSheetByName(RESPONSE_SHEET);
    if (!sheet) sheet = spreadsheet.insertSheet(RESPONSE_SHEET);
    const headers = responseHeaders_(form);
    if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold"); sheet.setFrozenRows(1); }
    else if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    return sheet;
  }

  function responseHeaders_(form) {
    return ["Response ID", "Submitted at", "Signed-in email", "Responder email", "Profile type", "Profile ID", "Profile name", "Form ID", "Form name"].concat(responseQuestions_(form).map(question => question.label || question.id));
  }
  function responseQuestions_(form) { return (form.questions || []).filter(question => question.type !== "page_section" && question.type !== "text_section"); }

  function saveUploads_(form, files, answers, mapped, responseId) {
    const questions = {};
    (form.questions || []).forEach(question => { questions[question.id] = question; });
    return (files || []).map(file => {
      const question = questions[file.questionId];
      if (!question || !UPLOAD_TYPES.includes(question.type)) return null;
      const folderId = form.storage.questionFolders[question.id];
      const folder = DriveApp.getFolderById(folderId);

      if (file.preuploaded && file.uploadToken) {
        const token = String(file.uploadToken).replace(/[^a-zA-Z0-9]/g, "");
        const session = getUploadSession_(token);
        if (!session || session.state !== "complete" || session.formId !== form.id || session.questionId !== question.id || session.folderId !== folderId) {
          throw new Error("A completed upload could not be verified. Please choose the file and try again.");
        }
        const saved = DriveApp.getFileById(session.fileId);
        saved.setName(makeUploadFileName_(question, session.originalName, form, answers, mapped, responseId));
        removeUploadSession_(token);
        return { questionId: question.id, fileId: saved.getId(), name: saved.getName(), url: saved.getUrl() };
      }

      if (!file.data) return null;
      const raw = String(file.data).replace(/^data:[^;]+;base64,/, "");
      const approximateBytes = Math.floor(raw.length * 3 / 4) - (raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0);
      const maxBytes = (question.type === "signature" ? INLINE_UPLOAD_MB : uploadLimitMb_(question)) * 1024 * 1024;
      if (approximateBytes > maxBytes || approximateBytes > INLINE_UPLOAD_MB * 1024 * 1024) {
        throw new Error(question.label + " is too large for the direct upload path. Please choose the file and try again.");
      }
      const filename = makeUploadFileName_(question, file.name, form, answers, mapped, responseId);
      const blob = Utilities.newBlob(Utilities.base64Decode(raw), file.mimeType || MimeType.PLAIN_TEXT, filename);
      const saved = folder.createFile(blob);
      return { questionId: question.id, fileId: saved.getId(), name: saved.getName(), url: saved.getUrl() };
    }).filter(Boolean);
  }

  function uploadContext_(formId, questionId) {
    const ownerForm = listDefinitions().find(item => item.id === String(formId || ""));
    if (!ownerForm || ownerForm.status !== "Published" || ownerForm.source === "google") throw new Error("This form is not available for uploads.");
    const form = Object.assign({}, ownerForm, { questions: publishedQuestions_(ownerForm) });
    const question = (form.questions || []).find(item => item.id === String(questionId || ""));
    if (!question || !FILE_UPLOAD_TYPES.includes(question.type)) throw new Error("This question does not accept file uploads.");
    const hadProvisionedStorage = !!(ownerForm.storage && ownerForm.storage.folderId && ownerForm.storage.spreadsheetId);
    const storage = provisionStorage_(form);
    ownerForm.storage = storage;
    form.storage = storage;
    if (!hadProvisionedStorage) saveDefinition(ownerForm);
    return { form, question, folderId: storage.questionFolders[question.id] };
  }

  function uploadLimitMb_(question) {
    const value = Math.floor(Number(question && question.maxSize || MAX_UPLOAD_MB));
    return Math.max(1, Math.min(MAX_UPLOAD_MB, value || MAX_UPLOAD_MB));
  }

  function makeUploadFileName_(question, fileName, form, answers, mapped, suffix) {
    const originalName = cleanFileName_(fileName || "upload");
    const extensionIndex = originalName.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? originalName.slice(extensionIndex) : "";
    const base = extensionIndex >= 0 ? originalName.slice(0, extensionIndex) : originalName;
    const prefix = renderMerge_(question.filePrefix || "{{responderFirstName}}_{{schoolName}}", form, answers || {}, mapped || {});
    return cleanFileName_([prefix, base, suffix].filter(Boolean).join("_")) + extension;
  }

  function uploadCacheKey_(token) { return UPLOAD_CACHE_PREFIX + token; }
  function getUploadSession_(token) {
    if (!token) return null;
    const key = uploadCacheKey_(token);
    try {
      const raw = CacheService.getScriptCache().get(key) || PropertiesService.getScriptProperties().getProperty(key);
      const session = JSON.parse(raw || "null");
      if (session && Date.now() - Number(session.updatedAt || 0) <= UPLOAD_SESSION_SECONDS * 1000) return session;
      removeUploadSession_(token);
      return null;
    } catch (_) { return null; }
  }
  function putUploadSession_(token, session) {
    const key = uploadCacheKey_(token);
    session.updatedAt = Date.now();
    const raw = JSON.stringify(session);
    CacheService.getScriptCache().put(key, raw, UPLOAD_SESSION_SECONDS);
    // Script Properties is the durable fallback because CacheService may evict a
    // valid session before its nominal expiry during a long 500 MB upload.
    PropertiesService.getScriptProperties().setProperty(key, raw);
  }
  function removeUploadSession_(token) {
    const key = uploadCacheKey_(token);
    CacheService.getScriptCache().remove(key);
    PropertiesService.getScriptProperties().deleteProperty(key);
  }
  function cleanupUploadSessions_() {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    Object.keys(properties.getProperties()).filter(key => key.indexOf(UPLOAD_CACHE_PREFIX) === 0).forEach(key => {
      try {
        const session = JSON.parse(properties.getProperty(key) || "null");
        if (!session || now - Number(session.updatedAt || 0) > UPLOAD_SESSION_SECONDS * 1000) properties.deleteProperty(key);
      } catch (_) { properties.deleteProperty(key); }
    });
  }

  function organiseGoogleFormUploads_(form, answers, mapped, responseId) {
    const output = [];
    (form.questions || []).filter(question => UPLOAD_TYPES.includes(question.type) && question.type !== "signature").forEach(question => {
      const raw = answers[question.id], ids = (Array.isArray(raw) ? raw : String(raw || "").split(/[,\n]+/)).map(value => extractDriveId_(value) || String(value || "").trim()).filter(Boolean);
      ids.forEach(fileId => {
        try {
          const file = DriveApp.getFileById(fileId), original = file.getName(), dot = original.lastIndexOf("."), extension = dot >= 0 ? original.slice(dot) : "", base = dot >= 0 ? original.slice(0, dot) : original;
          const prefix = renderMerge_(question.filePrefix || "{{responderFirstName}}_{{schoolName}}", form, answers, mapped);
          file.setName(cleanFileName_([prefix, base, responseId].filter(Boolean).join("_")) + extension);
          DriveApp.getFolderById(form.storage.questionFolders[question.id]).addFile(file);
          output.push({ questionId: question.id, fileId: file.getId(), name: file.getName(), url: file.getUrl() });
        } catch (_) {}
      });
    });
    return output;
  }

  function installGoogleFormTrigger_(googleForm) {
    ScriptApp.getProjectTriggers().forEach(trigger => {
      try { if (trigger.getHandlerFunction() === "handleManagedGoogleFormSubmit" && trigger.getTriggerSourceId() === googleForm.getId()) ScriptApp.deleteTrigger(trigger); } catch (_) {}
    });
    ScriptApp.newTrigger("handleManagedGoogleFormSubmit").forForm(googleForm).onFormSubmit().create();
  }

  function renderMerge_(template, form, answers, mapped) {
    const values = Object.assign({}, mapped);
    (form.questions || []).forEach(question => {
      const answer = answers[question.id];
      values[question.id] = answer;
      values[question.label] = answer;
    });
    values.formName = form.name;
    return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
      const value = values[key];
      return Array.isArray(value) ? value.join("-") : String(value == null ? "" : value);
    });
  }

  function mapAnswers_(form, answers) {
    return (form.questions || []).reduce((output, question) => {
      if (question.mapping) output[question.mapping] = answers[question.id];
      return output;
    }, {});
  }

  function matchProfile_(email, mapped) {
    mapped=mapped||{};
    let participant = null;
    let staff = null;
    try { participant = ParticipantService.getAll().find(item => email&&normaliseEmail_(item.studentEmail) === email || manualProfileMatch_(item,mapped)); } catch (_) {}
    try {
      staff = StaffService.getAll().find(item => [item.email, item.primaryEmail, item.secondaryEmail, item.personalEmail].concat(item.aliasEmails || [], item.legacyEmails || []).some(value => email&&normaliseEmail_(value) === email) || manualProfileMatch_(item,mapped));
    } catch (_) {}
    if (participant) return { type: "student", id: participant.studentKey || participant.studentId || participant.applicationId, name: participant.name || [participant.firstName, participant.lastName].filter(Boolean).join(" "), email };
    if (staff) return { type: "staff", id: staff.id || staff.staffId || staff.email, name: staff.displayName || staff.name || staff.email, email };
    return { type: "", id: "", name: "", email };
  }
  function manualProfileMatch_(item,mapped){const same=(value,expected)=>expected&&String(value||"").trim().toLowerCase()===String(expected).trim().toLowerCase(),digits=value=>String(value||"").replace(/\D/g,"");if(mapped.studentId&&[item.studentId,item.studentKey,item.applicationId].some(value=>same(value,mapped.studentId)))return true;if(mapped.externalReference&&[item.externalReference,item.membershipId,item.employeeId,item.staffId,item.id].some(value=>same(value,mapped.externalReference)))return true;if(mapped.dateOfBirth&&[item.dateOfBirth,item.dob,item.birthDate].some(value=>same(value,mapped.dateOfBirth)))return true;if(mapped.mobilePhone&&[item.mobilePhone,item.mobile,item.phone,item.phoneNumber].some(value=>digits(value)&&digits(value)===digits(mapped.mobilePhone)))return true;return false;}

  function validateRequired_(form, answers, activeQuestionIds) {
    const active = Array.isArray(activeQuestionIds) ? activeQuestionIds : null;
    (form.questions || []).forEach(question => {
      if (!question.required || question.type === "text_section" || question.type === "page_section" || active && !active.includes(question.id) || !questionIsActive_(form, answers, question.id)) return;
      const value = answers[question.id];
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) throw new Error("Complete the required question: " + question.label);
    });
  }
  function questionIsActive_(form, answers, questionId) { const rules=[];(form.questions||[]).forEach(question=>{if(question.branchMode==="reveal_question"&&question.branchTarget===questionId)rules.push({id:question.id,answer:question.branchAnswer});(question.optionRules||[]).forEach((rule,index)=>{if(rule.action==="reveal_question"&&rule.target===questionId)rules.push({id:question.id,answer:(question.options||[])[index]});});});if(!rules.length)return true;return rules.some(rule=>{const value=answers[rule.id];return Array.isArray(value)?value.includes(rule.answer):value===rule.answer;}); }

  function enforceResponseLimits_(form, spreadsheetId, answers) {
    const limited = (form.questions || []).filter(question => question.type === "limited_response" && Number(question.limit) > 0);
    if (!limited.length) return;
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(RESPONSE_SHEET);
    const existingRows = Math.max(0, sheet.getLastRow() - 1);
    limited.forEach(question => { if (answers[question.id] != null && answers[question.id] !== "" && existingRows >= Number(question.limit)) throw new Error(question.label + " has reached its response limit."); });
  }

  function indexResponse_(entry) {
    const items = readJson_(RESPONSE_INDEX_KEY, []);
    items.unshift(entry);
    writeJson_(RESPONSE_INDEX_KEY, items.slice(0, 1500));
  }

  function buildWorkflow_(form, answers, mapped, responseId) {
    const workflow = form.workflow || {}, baseUrl = ScriptApp.getService().getUrl();
    return {
      status: (workflow.steps || []).length ? "In progress" : "Complete",
      steps: (workflow.steps || []).map(step => ({
        id: step.id,
        type: step.type === "approval" ? "approval" : "follow_up",
        title: step.title || (step.type === "approval" ? "Approval" : "Additional form"),
        formId: step.formId || "",
        assigneeEmail: normaliseEmail_(step.assigneeEmail || mapped[step.assigneeField] || ""),
        assigneeField: step.assigneeField || "",
        instructions: step.instructions || "",
        status: "Pending",
        completedAt: "",
        completedBy: "",
        completedByType: "",
        responseId: "",
        url: step.formId ? baseUrl + "?form=" + encodeURIComponent(step.formId) + "&parentResponse=" + encodeURIComponent(responseId) + "&workflowStep=" + encodeURIComponent(step.id) : ""
      }))
    };
  }

  function completeWorkflowStep_(parentResponseId, stepId, childEntry, profile) {
    const items = readJson_(RESPONSE_INDEX_KEY, []), parent = items.find(item => item.responseId === parentResponseId);
    if (!parent || !parent.workflow) return;
    const step = (parent.workflow.steps || []).find(item => item.id === stepId);
    if (!step) return;
    step.status = "Complete"; step.completedAt = childEntry.submittedAt; step.completedBy = profile.name || childEntry.profileEmail || "Respondent"; step.completedByType = profile.type || "unmatched"; step.responseId = childEntry.responseId;
    parent.workflow.status = parent.workflow.steps.every(item => item.status === "Complete") ? "Complete" : "In progress";
    writeJson_(RESPONSE_INDEX_KEY, items);
  }

  function sendWorkflowMessages_(form, responseEntry, answers, mapped) {
    if (responseEntry.parentResponseId) return;
    const workflow = form.workflow || {}, mergeValues = Object.assign({ responseId: responseEntry.responseId, formName: form.name }, mapped);
    const render = text => String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => String(mergeValues[key] == null ? "" : mergeValues[key]));
    if (workflow.confirmation && workflow.confirmation.enabled) {
      const fields = workflow.confirmation.recipientFields || [workflow.confirmation.recipientField || "responderEmail"];
      const fixed = String(workflow.confirmation.recipientEmails || workflow.confirmation.recipientEmail || "").split(/[\s,;]+/);
      const recipients = fields.map(field => mapped[field]).concat(fixed).map(normaliseEmail_).filter((email, index, all) => email && all.indexOf(email) === index);
      if (!recipients.length && responseEntry.profileEmail) recipients.push(normaliseEmail_(responseEntry.profileEmail));
      if (recipients.length) try { MailApp.sendEmail({ to: recipients.join(","), subject: render(workflow.confirmation.subject || "We received your {{formName}} response"), htmlBody: render(workflow.confirmation.body || "<p>Thank you. Your response has been received.</p><p>Reference: {{responseId}}</p>") }); } catch (_) {}
    }
    ((responseEntry.workflow && responseEntry.workflow.steps) || []).forEach(step => {
      if (!step.assigneeEmail || !step.url) return;
      const verb = step.type === "approval" ? "review and approve" : "complete the next form";
      try { MailApp.sendEmail({ to: step.assigneeEmail, subject: render(step.title || form.name + " — next step"), htmlBody: "<p>You have been asked to " + verb + " for <strong>" + form.name + "</strong>.</p>" + (step.instructions ? "<p>" + step.instructions + "</p>" : "") + "<p><a href=\"" + step.url + "\">Open " + (step.type === "approval" ? "approval" : "form") + "</a></p><p>Reference: " + responseEntry.responseId + "</p>" }); } catch (_) {}
    });
  }

  function sanitiseDefinition_(input) {
    const form = JSON.parse(JSON.stringify(input || {}));
    form.name = String(form.name || "Untitled form").slice(0, 180);
    form.description = String(form.description || "").slice(0, 5000);
    form.source = form.source === "google" ? "google" : "custom";
    form.questions = Array.isArray(form.questions) ? form.questions.slice(0, 200) : [];
    form.questions.forEach(question => {
      if (FILE_UPLOAD_TYPES.includes(question.type)) question.maxSize = String(uploadLimitMb_(question));
    });
    if (Array.isArray(form.publishedQuestions)) form.publishedQuestions.forEach(question => {
      if (FILE_UPLOAD_TYPES.includes(question.type)) question.maxSize = String(uploadLimitMb_(question));
    });
    return form;
  }
  function publicEventPayload_(value) {
    if (!value || typeof value !== "object") return null;
    return {
      eventId: String(value.eventId || ""), eventVersion: Number(value.eventVersion || 0), title: String(value.title || ""),
      shortName: String(value.shortName || ""), purpose: String(value.purpose || ""), publicDescription: String(value.publicDescription || ""),
      schedule: (value.schedule || []).slice(0, 50).map(item => ({ id: String(item.id || ""), type: String(item.type || ""), label: String(item.label || ""), date: String(item.date || ""), start: String(item.start || ""), end: String(item.end || ""), venueName: String(item.venueName || ""), meetingLocation: String(item.meetingLocation || ""), pickupLocation: String(item.pickupLocation || "") })),
      venue: { name: String(value.venue && value.venue.name || ""), address: String(value.venue && value.venue.address || ""), room: String(value.venue && value.venue.room || ""), arrivalEntrance: String(value.venue && value.venue.arrivalEntrance || ""), pickupPoint: String(value.venue && value.venue.pickupPoint || ""), accessibility: String(value.venue && value.venue.accessibility || "") },
      logistics: { participationFee: Number(value.logistics && value.logistics.participationFee || 0), transportCost: Number(value.logistics && value.logistics.transportCost || 0), accommodationCost: Number(value.logistics && value.logistics.accommodationCost || 0), mealCost: Number(value.logistics && value.logistics.mealCost || 0), totalCost: Number(value.logistics && value.logistics.totalCost || 0), fundingModel: String(value.logistics && value.logistics.fundingModel || ""), paymentDueDate: String(value.logistics && value.logistics.paymentDueDate || ""), dress: String(value.logistics && value.logistics.dress || ""), footwear: String(value.logistics && value.logistics.footwear || ""), equipment: String(value.logistics && value.logistics.equipment || ""), travelLegs: (value.logistics && value.logistics.travelLegs || []).slice(0, 30).map(item => ({ origin: String(item.origin || ""), destination: String(item.destination || ""), date: String(item.date || ""), departAt: String(item.departAt || ""), arriveAt: String(item.arriveAt || ""), mode: String(item.mode || "") })), meals: (value.logistics && value.logistics.meals || []).slice(0, 20).map(item => ({ label: String(item.label || ""), date: String(item.date || ""), time: String(item.time || ""), provided: !!item.provided, studentsBring: !!item.studentsBring, leaveVenueOffered: !!item.leaveVenueOffered })) },
      emergencyContact: { name: String(value.emergencyContact && value.emergencyContact.name || ""), role: String(value.emergencyContact && value.emergencyContact.role || ""), phone: String(value.emergencyContact && value.emergencyContact.phone || "") }, permissionDeadline: String(value.permissionDeadline || "")
    };
  }
  function publishedQuestions_(form) { return Array.isArray(form.publishedQuestions) ? form.publishedQuestions : form.questions || []; }

  function validateWorkflow_(form) {
    const workflow = form.workflow || {}, definitions = listDefinitions();
    if (workflow.confirmation && workflow.confirmation.enabled && !(workflow.confirmation.recipientFields || []).length && !workflow.confirmation.recipientEmails && !workflow.confirmation.recipientEmail && !workflow.confirmation.recipientField) throw new Error("Choose at least one confirmation email recipient.");
    (workflow.steps || []).forEach(step => {
      if (!step.formId) throw new Error("Choose a form for the workflow step: " + (step.title || "Untitled step"));
      const target = definitions.find(item => item.id === step.formId);
      if (!target || target.status !== "Published" || target.source === "google") throw new Error("Publish the linked TAU/SpecCentral form before using it in workflow: " + (step.title || "Untitled step"));
      if (!step.assigneeEmail && !step.assigneeField) throw new Error("Choose an assignee for the workflow step: " + (step.title || "Untitled step"));
    });
  }

  function publicOwnerDefinition_(form) { return JSON.parse(JSON.stringify(form)); }
  function currentIdentity_() { const email = Session.getActiveUser().getEmail() || ""; const profile = matchProfile_(normaliseEmail_(email)); return { email, profile }; }
  function normaliseEmail_(value) { return String(value || "").trim().toLowerCase(); }
  function extractDriveId_(value) { const text = String(value || "").trim(); const match = text.match(/[-\w]{25,}/); return match ? match[0] : ""; }
  function cleanFileName_(value) { return String(value || "file").replace(/[\\/:*?"<>|#%{}~]/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || "file"; }
  function makeId_(prefix) { return prefix + "-" + Utilities.getUuid(); }
  function readJson_(key, fallback) {
    try {
      const properties = PropertiesService.getScriptProperties();
      const count = Number(properties.getProperty(key + "__chunks") || 0);
      let raw = count ? Array.from({length: count}, (_, index) => properties.getProperty(key + "__" + index) || "").join("") : properties.getProperty(key);
      return JSON.parse(raw || JSON.stringify(fallback));
    } catch (_) { return fallback; }
  }
  function writeJson_(key, value) {
    const properties = PropertiesService.getScriptProperties();
    const raw = JSON.stringify(value), size = 7500, chunks = [];
    for (let offset = 0; offset < raw.length; offset += size) chunks.push(raw.slice(offset, offset + size));
    const previous = Number(properties.getProperty(key + "__chunks") || 0);
    for (let index = chunks.length; index < previous; index++) properties.deleteProperty(key + "__" + index);
    const updates = {}; chunks.forEach((chunk, index) => { updates[key + "__" + index] = chunk; }); updates[key + "__chunks"] = String(chunks.length);
    properties.setProperties(updates, false); properties.deleteProperty(key);
  }

  return { listDefinitions, saveDefinition, publishDefinition, importGoogleFormQuestions, getPublicDefinition, submitResponse, startResumableUpload, uploadResumableChunk, responsesForProfile, getWorkspaceData, setStatus, handleGoogleFormSubmit };
})();

function handleManagedGoogleFormSubmit(event) {
  return FormResponseService.handleGoogleFormSubmit(event);
}
