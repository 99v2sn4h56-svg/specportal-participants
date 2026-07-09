

function runSearch() {
  const query = searchInput.value.trim();

  if (query.length < 2) {
    statusEl.textContent = portalReady
      ? `Ready · ${allParticipants.length} participant${allParticipants.length === 1 ? "" : "s"} loaded`
      : "Loading participant data...";
    resultsEl.innerHTML = "";
    return;
  }

  if (!portalReady) {
    statusEl.textContent = "Still loading participant data...";
    return;
  }

  showResults(searchParticipantsLocally(query));
}

function searchParticipantsLocally(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];

  const schoolResults = buildSchoolSearchResults(q);
  const groupResults = buildGroupSearchResults(q);

  const participantResults = searchIndex
    .map(entry => ({
      ...entry.participant,
      resultType: "participant",
      searchScore: getParticipantSearchScore(entry, q)
    }))
    .filter(p => String(fullName(p) || "").trim().length > 0)
    .filter(p => p.searchScore > 0)
    .sort((a, b) => b.searchScore - a.searchScore || String(fullName(a)).localeCompare(String(fullName(b))))
    .slice(0, 75);

  return [...schoolResults, ...groupResults, ...participantResults].slice(0, 75);
}

function buildSchoolSearchResults(q) {
  return allSchools
    .map(s => {
      const schoolName = String(s.schoolName || "").trim();
      const key = schoolName.toLowerCase();
      const participantCount = (participantsBySchool.get(key) || []).length;

      return {
        resultType: "school",
        schoolName,
        participantCount,
        searchScore: getTextSearchScore(key, q) + 20
      };
    })
    .filter(s => s.schoolName && s.searchScore > 20)
    .sort((a, b) => b.searchScore - a.searchScore || a.schoolName.localeCompare(b.schoolName))
    .slice(0, 8);
}

function buildGroupSearchResults(q) {
  return allGroups
    .map(g => {
      const title = [g.item, g.groupName].filter(Boolean).join(" · ") || g.category || "Unnamed group";
      const searchText = [g.item, g.groupName, g.category, g.school, g.teacherName].join(" ").toLowerCase();

      return {
        resultType: "group",
        title,
        school: g.school || "",
        teacherName: g.teacherName || "",
        count: g.count || "",
        group: g,
        searchScore: getTextSearchScore(searchText, q) + 15
      };
    })
    .filter(g => g.searchScore > 15)
    .sort((a,b) => b.searchScore - a.searchScore || a.title.localeCompare(b.title))
    .slice(0,8);
}

function getParticipantSearchScore(entry, q) {
  let score = 0;

  score += getTextSearchScore(entry.fullName, q) * 8;
  score += getTextSearchScore(entry.lastName, q) * 6;
  score += getTextSearchScore(entry.firstName, q) * 6;
  score += getTextSearchScore(entry.school, q) * 5;
  score += getTextSearchScore(entry.item, q) * 4;
  score += getTextSearchScore(entry.discipline, q) * 3;
  score += getTextSearchScore(entry.subDiscipline, q) * 3;
  score += getTextSearchScore(entry.teacherName, q) * 2;
  score += getTextSearchScore(entry.teacherEmail, q) * 2;
  score += getTextSearchScore(entry.studentEmail, q);
  score += getTextSearchScore(entry.parentName, q);
  score += getTextSearchScore(entry.parentEmail, q);
  score += getTextSearchScore(entry.additionalParentName, q);
  score += getTextSearchScore(entry.additionalParentEmail, q);

  return score;
}

function getTextSearchScore(value, q) {
  const text = String(value || "").toLowerCase().trim();
  if (!text || !q) return 0;
  if (text === q) return 100;
  if (text.startsWith(q)) return 75;
  if (text.split(/\s+/).some(part => part.startsWith(q))) return 55;
  if (text.includes(q)) return 30;
  return 0;
}

function showResults(data) {
  latestResults = data || [];
  statusEl.textContent = latestResults.length
    ? `${latestResults.length} result${latestResults.length === 1 ? "" : "s"}`
    : "";

  if (!latestResults.length) {
    resultsEl.innerHTML = `<div class="empty">No matches found.</div>`;
    return;
  }

  resultsEl.innerHTML = `
    <div class="sectionTitle">Results</div>
    ${latestResults.map((p, index) => renderResult(p, index)).join("")}
  `;
}

function renderResult(p, index) {
  if (p.resultType === "group") {
    const title = p.title || "Unnamed group";
    const meta = [p.school, p.teacherName].filter(Boolean).join(" · ");
    const countLine = p.count ? `${p.count} student${Number(p.count) === 1 ? "" : "s"}` : "Group record";

    return `
      <div class="result" onclick="openGroupProfile(${index})">
        <div class="resultTop">
          <div class="avatar">GR</div>
          <div>
            <div class="name">${escapeHtml(title)}</div>
            <div class="meta">${escapeHtml(meta)}</div>
            <div class="meta">${escapeHtml(countLine)}</div>
          </div>
        </div>
        <div class="pillRow"><span class="pill">Group</span></div>
      </div>
    `;
  }
  const name = fullName(p) || p.schoolName || "Unknown";
  const initials = getInitials(p);
  const line1 = [p.school, p.year ? "Year " + p.year : ""].filter(Boolean).join(" · ");
  const line2 = [p.discipline, p.subDiscipline, p.item].filter(Boolean).join(" · ");

  return `
    <div class="result" onclick="openProfile(${index})">
      <div class="resultTop">
        <div class="avatar">
          ${p.photoUrl
            ? `<img src="${escapeHtml(p.photoUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : escapeHtml(initials)}
        </div>
        <div>
          <div class="name">${escapeHtml(name || "Unnamed participant")}</div>
          <div class="meta">${escapeHtml(line1)}</div>
          <div class="meta">${escapeHtml(line2)}</div>
        </div>
      </div>

      <div class="pillRow">
        ${p.item ? `<span class="pill">${escapeHtml(p.item)}</span>` : ""}
        ${p.discipline ? `<span class="pill">${escapeHtml(p.discipline)}</span>` : ""}
      </div>
    </div>
  `;
}

function updateSelectedResult() {
  document.querySelectorAll('.result').forEach((el, i) => {
    if (i === selectedResultIndex) {
      el.style.borderColor = 'var(--blue)';
      el.style.boxShadow = '0 0 0 2px rgba(45,103,178,.25)';
      el.scrollIntoView({block:'nearest'});
    } else {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }
  });
}