export class FilesException extends Error {}

export class CantAccessFileException extends FilesException {
  constructor() {
    super("This file cannot be accessed.");
  }
}

export class CantFindFileException extends FilesException {
  constructor() {
    super("This file cannot be found.");
  }
}

export class CantFindFileInvitationException extends FilesException {
  constructor() {
    super("This file invitation cannot be found.");
  }
}

export class FileConflictException extends FilesException {
  constructor() {
    super("A file already exist at this location.");
  }
}

export class FileInviteeCannotBeOwner extends FilesException {
  constructor() {
    super("The file invitee cannot be the owner of the file.");
  }
}
