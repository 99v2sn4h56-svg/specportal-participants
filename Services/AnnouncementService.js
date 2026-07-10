const AnnouncementService = (() => {
  function getActive() {
    return [
      {
        title: "Spec Central is becoming the operations hub",
        body: "Participants, attendance and rehearsal information are being brought together in one staff landing page.",
        tone: "blue"
      },
      {
        title: "Acceptance uploads",
        body: "Use the Import Centre for individual and group acceptance files. Column mapping and category matching are now guided.",
        tone: "yellow"
      },
      {
        title: "Attendance module",
        body: "Attendance remains in the existing app while summaries are prepared for the Spec Central dashboard.",
        tone: "mint"
      }
    ];
  }

  return {
    getActive
  };
})();
