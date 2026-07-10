const MediaTimelineService = (() => {
  const VIEW_PERMISSION = "mediaTimeline.view";

  function getDashboardData() {
    requirePermission_(VIEW_PERMISSION);

    const activities = getPlaceholderActivities_();

    return {
      source: "Placeholder media timeline data",
      generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, d MMM h:mma"),
      activities,
      statuses: ["Idea", "Drafting", "Awaiting assets", "Awaiting approval", "Scheduled", "Published", "Complete"],
      channels: ["Social media", "Website", "Email", "School communications", "Media release", "Collateral"]
    };
  }

  function requirePermission_(permission) {
    const email = Session.getActiveUser().getEmail();
    if (!StaffService.hasPermission(email, permission)) {
      throw new Error(`Permission required: ${permission}`);
    }
  }

  function getPlaceholderActivities_() {
    return [
      {
        id: "MT-001",
        campaign: "Acceptances",
        activity: "Acceptance reminder communications",
        channel: "School communications",
        audience: "Schools",
        owner: "Media team",
        department: "Media",
        startDate: "",
        publishDate: "",
        endDate: "",
        status: "Drafting",
        priority: "High",
        relatedEvent: "",
        relatedItem: "",
        assetLink: "",
        copyLink: "",
        approvalStatus: "Not connected",
        notes: "Placeholder until the media planning source is connected."
      },
      {
        id: "MT-002",
        campaign: "Rehearsals",
        activity: "Rehearsal week social schedule",
        channel: "Social media",
        audience: "Community",
        owner: "Media team",
        department: "Media",
        startDate: "",
        publishDate: "",
        endDate: "",
        status: "Idea",
        priority: "Medium",
        relatedEvent: "Timeline",
        relatedItem: "",
        assetLink: "",
        copyLink: "",
        approvalStatus: "Not connected",
        notes: "Placeholder activity for future campaign planning."
      }
    ];
  }

  return {
    getDashboardData
  };
})();
