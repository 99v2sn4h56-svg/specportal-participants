const AttendanceService = (() => {
  const DEFAULT_WEB_APP_URL = "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbwfl66Nd4oQFZT5JY3zP74hh-3K59YrmS_z-vINubnDdNnLrX347K9huAkQLT86UYy63w/exec";
  const STALE_WEB_APP_URLS = [
    "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbz4lRBirmgoHtz3T7d_Pba-gEVkFHzj_TQVlqg4XKT8A-5WPhxC9lONV9j9N3i3DH7sdA/exec",
    "https://script.google.com/a/macros/education.nsw.gov.au/s/AKfycbzcPYzqJQrJ8qeaxCic3ZGZdQGDd-HvtAHgklkE15LiM01vsudPX-9ok3IolHzHukc_NQ/exec"
  ];

  function getWebAppUrl() {
    const properties = PropertiesService.getScriptProperties();
    const configuredUrl = properties.getProperty("SPEC_CENTRAL_ATTENDANCE_URL") ||
      properties.getProperty("ATTENDANCE_WEB_APP_URL");

    if (configuredUrl && STALE_WEB_APP_URLS.indexOf(configuredUrl) === -1) {
      return configuredUrl;
    }

    return DEFAULT_WEB_APP_URL;
  }

  function getConfig() {
    const url = getWebAppUrl();

    return {
      url,
      status: url ? "Connected" : "Waiting",
      mode: "linked-web-app",
      source: url === DEFAULT_WEB_APP_URL ? "Default Attendance deployment" : "Script property"
    };
  }

  function getSummary() {
    return {
      status: getWebAppUrl() ? "Connected" : "Waiting",
      events: [],
      requiringAction: [],
      source: "Attendance web app link"
    };
  }

  return {
    getWebAppUrl,
    getConfig,
    getSummary
  };
})();
