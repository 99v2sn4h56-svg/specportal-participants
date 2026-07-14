/** Read-only adapter for the authoritative Schools Spectacular show-run workbook. */
const ShowRunService = (() => {
  const CACHE_KEY = "show-run:data:v1";
  const CACHE_SECONDS = 10 * 60;

  function getData() {
    return PerformanceCacheService.getOrLoad(CACHE_KEY, CACHE_SECONDS, load_);
  }

  function getItems() { return getData().items || []; }

  function refresh() {
    PerformanceCacheService.remove(CACHE_KEY);
    return getData();
  }

  function load_() {
    const source = SourceRegistryService.getSourceConfig("show-run");
    if (!source.spreadsheetId || source.sheetId == null) throw new Error("Show Run source configuration is incomplete.");
    const spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
    const sheet = spreadsheet.getSheets().find(item => Number(item.getSheetId()) === Number(source.sheetId));
    if (!sheet) throw new Error(`Show Run sheet ${source.sheetId} was not found.`);
    return parseValues(sheet.getDataRange().getDisplayValues(), Object.assign({}, source, { sheetName: sheet.getName() }));
  }

  function parseValues(values, source) {
    const rows = Array.isArray(values) ? values : [];
    if (!rows.length) return empty_(source);
    const headers = rows[0].map(value => String(value || "").trim());
    const indexes = indexHeaders_(headers);
    const itemNumberIndex = find_(indexes, ["item number", "item no", "item #"]);
    const titleIndex = find_(indexes, ["title", "item title"]);
    if (itemNumberIndex < 0 || titleIndex < 0) throw new Error("Show Run requires Item Number and TITLE columns.");
    const items = [], segmentsByName = {};
    rows.slice(1).forEach((row, offset) => {
      const itemNumber = cell_(row, itemNumberIndex);
      const title = cell_(row, titleIndex);
      const rowType = value_(row, indexes, ["row type"]);
      const segmentName = value_(row, indexes, ["segment"]);
      if (rowType.toLowerCase().includes("segment")) {
        const name = title || cell_(row, 0) || segmentName;
        if (name) segmentsByName[normalise_(name)] = segment_(name, row, indexes, offset + 2);
        return;
      }
      if (!itemNumber || !title) return;
      const segment = segmentName || "Unassigned segment";
      if (!segmentsByName[normalise_(segment)]) segmentsByName[normalise_(segment)] = segment_(segment, row, indexes, offset + 2);
      items.push({
        entityType: "Item",
        id: EntityModelService.stableId("ITM", itemNumber),
        participantItemId: EntityModelService.stableId("ITM", title),
        itemNumber,
        positionNumber: value_(row, indexes, ["#", "position", "order"]),
        title,
        name: title,
        rowLabel: cell_(row, 0),
        rowType: rowType || "Item",
        segment,
        segmentId: EntityModelService.stableId("SEG", segment),
        duration: value_(row, indexes, ["dur", "duration"]),
        artist: value_(row, indexes, ["artist"]),
        description: value_(row, indexes, ["description"]),
        editLink: value_(row, indexes, ["edit link"]),
        cast: value_(row, indexes, ["cast"]),
        schools: value_(row, indexes, ["schools"]),
        notes: value_(row, indexes, ["notes"]),
        updatedNotes: value_(row, indexes, ["updated notes"]),
        consultNeeded: value_(row, indexes, ["consult needed"]),
        timecode: value_(row, indexes, ["timecode"]),
        cueing: value_(row, indexes, ["cueing"]),
        bandOrchestra: value_(row, indexes, ["stage band orchestra", "stage band/orchestra"]),
        backingVocals: value_(row, indexes, ["bvs"]),
        choir: value_(row, indexes, ["choir"]),
        featuredArtists: value_(row, indexes, ["fas", "fa's"]),
        arranger: value_(row, indexes, ["arranger"]),
        key: value_(row, indexes, ["key start", "key (start)"]),
        tempo: value_(row, indexes, ["tempo"]),
        featuredVocalists: value_(row, indexes, ["featured vocalists"]),
        choreographer: value_(row, indexes, ["choreographer"]),
        synopsis: value_(row, indexes, ["synopsis"]),
        sourceRow: offset + 2,
        source: "Show Run"
      });
    });
    const segments = Object.keys(segmentsByName).map(key => segmentsByName[key]).sort((a, b) => a.sourceRow - b.sourceRow);
    return {
      source: sourceMetadata_(source),
      schema: { headers, required: ["Item Number", "TITLE"], detectedItemNumberColumn: headers[itemNumberIndex], detectedTitleColumn: headers[titleIndex] },
      items,
      segments,
      summary: { itemCount: items.length, segmentCount: segments.length, numberedItemCount: items.filter(item => !!item.itemNumber).length },
      generatedAt: new Date().toISOString()
    };
  }

  function segment_(name, row, indexes, sourceRow) {
    return { entityType: "Segment", id: EntityModelService.stableId("SEG", name), name, segmentNumber: value_(row, indexes, ["#", "position", "order"]), sourceRow, source: "Show Run" };
  }
  function sourceMetadata_(source) { return { spreadsheetId: source && source.spreadsheetId || "", sheetId: source && source.sheetId || "", sheetName: source && source.sheetName || "", scriptId: source && source.scriptId || "", url: source && source.url || "", direction: "read-only" }; }
  function empty_(source) { return { source: sourceMetadata_(source), schema: { headers: [], required: ["Item Number", "TITLE"] }, items: [], segments: [], summary: { itemCount: 0, segmentCount: 0, numberedItemCount: 0 }, generatedAt: new Date().toISOString() }; }
  function indexHeaders_(headers) { const result = {}; headers.forEach((header, index) => { const key = normalise_(header); if (key && result[key] == null) result[key] = index; }); return result; }
  function find_(indexes, aliases) { for (let index = 0; index < aliases.length; index += 1) { const key = normalise_(aliases[index]); if (indexes[key] != null) return indexes[key]; } return -1; }
  function value_(row, indexes, aliases) { const index = find_(indexes, aliases); return index < 0 ? "" : cell_(row, index); }
  function cell_(row, index) { return String(row && row[index] != null ? row[index] : "").trim(); }
  function normalise_(value) { return EntityModelService.normaliseKey(value); }

  return { getData, getItems, refresh, parseValues };
})();
