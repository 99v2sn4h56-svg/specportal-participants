const App = (() => {

  const state = {
    currentPage: "dashboard",

    participants: [],
    schools: [],
    groups: [],
    rehearsals: [],

    selectedParticipant: null,
    selectedSchool: null,
    selectedGroup: null,
    selectedItem: null,
    selectedTeacher: null,
    selectedRehearsal: null
  };

  function getState() {
    return state;
  }

  function setPage(page) {
    state.currentPage = page;
  }

  return {
    getState,
    setPage
  };

})();
