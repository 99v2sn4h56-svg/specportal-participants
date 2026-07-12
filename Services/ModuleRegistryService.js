/** Compatibility facade for the authoritative SourceRegistryService. */
const ModuleRegistryService = (() => {
  function getAllForUser(user) {
    return SourceRegistryService.getForUser(user);
  }

  return { getAllForUser };
})();
