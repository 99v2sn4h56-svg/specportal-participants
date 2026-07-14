/** Manual/CI-safe schema and mapping checks for the Show Run adapter. */
function runShowRunServiceTests() {
  const values = [
    ["", "Row Type", "Updated Notes", "Segment", "", "#", "Item Number", "TITLE", "Dur.", "ARTIST", "Description", "Cast", "Schools", "Timecode"],
    [". #1 OPENING", "Segment Total", "", "#1 OPENING", "", "1", "", "#1 OPENING", "", "", "", "", "", ""],
    ["01a. Yugal Yulu-gi", "Item", "Updated", "#1 OPENING", "", "1", "01a", "Yugal Yulu-gi", "3:40", "Mitch Tambo", "Opening item", "Creative Voice", "Example School", "00:30:00:00"],
    ["01b. Finale", "Item", "", "#1 OPENING", "", "2", "01b", "Finale", "2:10", "", "", "Choir", "", ""]
  ];
  const data = ShowRunService.parseValues(values, { spreadsheetId: "sheet", sheetId: 1480106475, scriptId: "script" });
  const assertions = [
    ["maps numbered items", data.items.length === 2 && data.items[0].itemNumber === "01a"],
    ["maps item production fields", data.items[0].title === "Yugal Yulu-gi" && data.items[0].duration === "3:40" && data.items[0].artist === "Mitch Tambo"],
    ["maps source row", data.items[0].sourceRow === 3],
    ["maps segment relationship", data.items[0].segment === "#1 OPENING" && data.items[0].segmentId === data.segments[0].id],
    ["retains source ownership", data.source.scriptId === "script" && data.source.sheetId === 1480106475],
    ["reports summary", data.summary.itemCount === 2 && data.summary.segmentCount === 1]
  ].map(item => ({ name: item[0], passed: item[1] }));
  return { passed: assertions.every(item => item.passed), count: assertions.length, assertions };
}
