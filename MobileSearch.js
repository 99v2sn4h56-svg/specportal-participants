function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("Mobile Search")
    .setTitle("Spec Directory")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function mobileSearch(query) {
  const filters = {
    everything: query || "",
    individual: "",
    school: "",
    category: "",
    teacher: ""
  };

  return searchParticipantsForTiles(filters);
}

function mobileOpenRecord(record) {
  writeSelectedParticipant(record);
  return true;
}