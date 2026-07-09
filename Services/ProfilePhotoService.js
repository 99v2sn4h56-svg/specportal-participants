const ProfilePhotoService = (() => {
  const FOLDER_ID = "1y9A0Nwh7icSssRzTDVaR3vamCn3oWWlB";

  function getStudentPhotos() {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFiles();
    const photos = {};

    while (files.hasNext()) {
      const file = files.next();
      const key = file.getName()
        .replace(/\.[^.]+$/, "")
        .replace(/\s*-\s*Headshot$/i, "")
        .replace(/[\-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      photos[key] = {
        fileId: file.getId(),
        url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w300`
      };
    }

    return photos;
  }

  return {
    getStudentPhotos
  };
})();
