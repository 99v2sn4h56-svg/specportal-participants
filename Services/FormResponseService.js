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

  function listDefinitions() {
    return readJson_(DEFINITIONS_KEY, []);
  }

  function saveDefinition(input) {
    const form = sanitiseDefinition_(input || {});
    if (!form.id) form.id = makeId_("form");
    const items = listDefinitions();
    const existingIndex = items.findIndex(item => item.id === form.id);
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

  function getPublicDefinition(formId, workflowContext) {
    const form = listDefinitions().find(item => item.id === String(formId || ""));
    if (!form || form.status !== "Published") return null;
    const user = currentIdentity_();
    return {
      id: form.id,
      name: form.name,
      description: form.description,
      programId: form.programId,
      questions: form.questions || [],
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
    const answers = request.answers || {};
    validateRequired_(form, answers);
    const storage = provisionStorage_(form);
    form.storage = storage;
    const mapped = mapAnswers_(form, answers);
    const signedInEmail = Session.getActiveUser().getEmail() || "";
    const responseEmail = normaliseEmail_(mapped.responderEmail || signedInEmail);
    const profile = matchProfile_(responseEmail);
    const responseId = makeId_("response");
    const submittedAt = new Date().toISOString();
    enforceResponseLimits_(form, storage.spreadsheetId, answers);
    const uploads = saveUploads_(form, request.files || [], answers, mapped, responseId);
    appendResponse_(form, storage.spreadsheetId, {
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
    sendWorkflowMessages_(form, responseEntry, answers, mapped);
    saveDefinition(form);
    return { ok: true, responseId, submittedAt, profile, message: profile.type ? "Response saved and linked to " + profile.name + "." : "Response saved. No matching student or staff profile was found for " + (responseEmail || "the supplied email") + "." };
  }

  function handleGoogleFormSubmit(event) {
    if (!event || !event.source || !event.response) return;
    const googleFormId = event.source.getId();
    const form = listDefinitions().find(item => item.googleFormId === googleFormId && item.status === "Published");
    if (!form) return;
    const byLabel = {};
    event.response.getItemResponses().forEach(itemResponse => { byLabel[itemResponse.getItem().getTitle()] = itemResponse.getResponse(); });
    const answers = {};
    (form.questions || []).forEach(question => { if (Object.prototype.hasOwnProperty.call(byLabel, question.label)) answers[question.id] = byLabel[question.label]; });
    const mapped = mapAnswers_(form, answers);
    const responseEmail = normaliseEmail_(mapped.responderEmail || event.response.getRespondentEmail && event.response.getRespondentEmail() || "");
    const profile = matchProfile_(responseEmail), responseId = "google-response-" + event.response.getId(), submittedAt = event.response.getTimestamp().toISOString();
    enforceResponseLimits_(form, form.storage.spreadsheetId, answers);
    const uploads = organiseGoogleFormUploads_(form, answers, mapped, responseId);
    appendResponse_(form, form.storage.spreadsheetId, { responseId, submittedAt, signedInEmail: responseEmail, responseEmail, profile, answers, uploads });
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
    const values = (form.questions || []).map(question => {
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
    return ["Response ID", "Submitted at", "Signed-in email", "Responder email", "Profile type", "Profile ID", "Profile name", "Form ID", "Form name"].concat((form.questions || []).map(question => question.label || question.id));
  }

  function saveUploads_(form, files, answers, mapped, responseId) {
    const questions = {};
    (form.questions || []).forEach(question => { questions[question.id] = question; });
    return (files || []).map(file => {
      const question = questions[file.questionId];
      if (!question || !UPLOAD_TYPES.includes(question.type) || !file.data) return null;
      const folderId = form.storage.questionFolders[question.id];
      const folder = DriveApp.getFolderById(folderId);
      const originalName = cleanFileName_(file.name || "upload");
      const extensionIndex = originalName.lastIndexOf(".");
      const extension = extensionIndex >= 0 ? originalName.slice(extensionIndex) : "";
      const prefix = renderMerge_(question.filePrefix || "{{responderFirstName}}_{{schoolName}}", form, answers, mapped);
      const base = extensionIndex >= 0 ? originalName.slice(0, extensionIndex) : originalName;
      const filename = cleanFileName_([prefix, base, responseId].filter(Boolean).join("_")) + extension;
      const blob = Utilities.newBlob(Utilities.base64Decode(String(file.data).replace(/^data:[^;]+;base64,/, "")), file.mimeType || MimeType.PLAIN_TEXT, filename);
      const saved = folder.createFile(blob);
      return { questionId: question.id, fileId: saved.getId(), name: saved.getName(), url: saved.getUrl() };
    }).filter(Boolean);
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

  function matchProfile_(email) {
    if (!email) return { type: "", id: "", name: "", email: "" };
    let participant = null;
    let staff = null;
    try { participant = ParticipantService.getAll().find(item => normaliseEmail_(item.studentEmail) === email); } catch (_) {}
    try {
      staff = StaffService.getAll().find(item => [item.email, item.primaryEmail, item.secondaryEmail, item.personalEmail].concat(item.aliasEmails || [], item.legacyEmails || []).some(value => normaliseEmail_(value) === email));
    } catch (_) {}
    if (participant) return { type: "student", id: participant.studentKey || participant.studentId || participant.applicationId, name: participant.name || [participant.firstName, participant.lastName].filter(Boolean).join(" "), email };
    if (staff) return { type: "staff", id: staff.id || staff.staffId || staff.email, name: staff.displayName || staff.name || staff.email, email };
    return { type: "", id: "", name: "", email };
  }

  function validateRequired_(form, answers) {
    (form.questions || []).forEach(question => {
      if (!question.required || question.type === "text_section") return;
      const value = answers[question.id];
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) throw new Error("Complete the required question: " + question.label);
    });
  }

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
      const recipient = normaliseEmail_(workflow.confirmation.recipientEmail || mapped[workflow.confirmation.recipientField || "responderEmail"] || responseEntry.profileEmail);
      if (recipient) try { MailApp.sendEmail({ to: recipient, subject: render(workflow.confirmation.subject || "We received your {{formName}} response"), htmlBody: render(workflow.confirmation.body || "<p>Thank you. Your response has been received.</p><p>Reference: {{responseId}}</p>") }); } catch (_) {}
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
    return form;
  }

  function validateWorkflow_(form) {
    const workflow = form.workflow || {}, definitions = listDefinitions();
    if (workflow.confirmation && workflow.confirmation.enabled && !workflow.confirmation.recipientEmail && !workflow.confirmation.recipientField) throw new Error("Choose who receives the confirmation email.");
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

  return { listDefinitions, saveDefinition, publishDefinition, getPublicDefinition, submitResponse, responsesForProfile, getWorkspaceData, setStatus, handleGoogleFormSubmit };
})();

function handleManagedGoogleFormSubmit(event) {
  return FormResponseService.handleGoogleFormSubmit(event);
}
