/** Regression checks for Timeline spreadsheet display-date normalisation. */
function runTimelineDateTests() {
  const results = [];
  const properties = PropertiesService.getScriptProperties();
  const previousYear = properties.getProperty("SPEC_TIMELINE_YEAR");
  const assert = (name, condition, detail) => {
    results.push({ name, passed: !!condition, detail: detail || "" });
    if (!condition) throw new Error("Test failed: " + name + (detail ? " · " + detail : ""));
  };

  try {
    properties.setProperty("SPEC_TIMELINE_YEAR", "2026");
    assert("weekday comma display date", RehearsalService._test.buildDateKey("Fri, 27 Nov") === "2026-11-27");
    assert("full weekday display date", RehearsalService._test.buildDateKey("Friday, 27 November") === "2026-11-27");
    assert("non-breaking spreadsheet whitespace", RehearsalService._test.buildDateKey("Fri,\u00a027\u00a0Nov") === "2026-11-27");
    assert("explicit Australian numeric date", RehearsalService._test.buildDateKey("27/11/2026") === "2026-11-27");
    assert("ISO date", RehearsalService._test.buildDateKey("2026-11-27") === "2026-11-27");
    assert("invalid calendar date rejected", RehearsalService._test.buildDateKey("Fri, 31 Nov") === "");
  } finally {
    if (previousYear) properties.setProperty("SPEC_TIMELINE_YEAR", previousYear);
    else properties.deleteProperty("SPEC_TIMELINE_YEAR");
  }

  return { passed: results.every(item => item.passed), count: results.length, results };
}
