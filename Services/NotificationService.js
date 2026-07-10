const NotificationService = (() => {
  function getForCurrentUser() {
    return [
      {
        title: "Mock notifications enabled",
        body: "Real notifications will connect after Staff Production Team permissions are available.",
        severity: "info"
      }
    ];
  }

  return {
    getForCurrentUser
  };
})();
