const PortalController = (() => {

  function start() {
    console.log("🚀 Spec Portal starting...");
    App.setPage("dashboard");
  }

  function showDashboard() {
    App.setPage("dashboard");
    console.log("Dashboard");
  }

  function showSearch() {
    App.setPage("search");
    console.log("Search");
  }

  function showParticipant(id) {
    App.getState().selectedParticipant = id;
    App.setPage("participant");
  }

  function showSchool(name) {
    App.getState().selectedSchool = name;
    App.setPage("school");
  }

  function showItem(name) {
    App.getState().selectedItem = name;
    App.setPage("item");
  }

  function showTeacher(id) {
    App.getState().selectedTeacher = id;
    App.setPage("teacher");
  }

  function showGroup(id) {
    App.getState().selectedGroup = id;
    App.setPage("group");
  }

  function showRehearsal(id) {
    App.getState().selectedRehearsal = id;
    App.setPage("rehearsal");
  }

  return {
    start,
    showDashboard,
    showSearch,
    showParticipant,
    showSchool,
    showItem,
    showTeacher,
    showGroup,
    showRehearsal
  };

})();