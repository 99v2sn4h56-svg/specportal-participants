const TimelineService = (() => {

  const TIMELINE_ID = "1JccmwT9_wOEhuSU5kyFH6HnU9T9ysfQa87XjvL5WLog";

  const CACHE_KEY = "SPEC_TIMELINE_V1";

  const CACHE_HOURS = 6;

  function getAll() {

    const cache = CacheService.getScriptCache();

    const cached = cache.get(CACHE_KEY);

    if (cached) {
      return JSON.parse(cached);
    }

    const rehearsals = loadTimeline_();

    cache.put(
      CACHE_KEY,
      JSON.stringify(rehearsals),
      CACHE_HOURS * 60 * 60
    );

    return rehearsals;

  }

  function refresh() {

    CacheService
      .getScriptCache()
      .remove(CACHE_KEY);

    return getAll();

  }

  function loadTimeline_() {

    const ss = SpreadsheetApp.openById(TIMELINE_ID);

    const sheet = ss.getSheets()[0];

    const values = sheet.getDataRange().getDisplayValues();

    const headers = values.shift();

    return values
      .filter(r => r.some(c => c))
      .map((row,index)=>({

        id: Utilities.getUuid(),

        row: index + 2,

        headers,

        values: row

      }));

  }

  return {

    getAll,

    refresh

  };

})();