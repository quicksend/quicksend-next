import { ConfigType } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Inject, Injectable } from "@nestjs/common";

import { File } from "@quicksend/transmit";
import { FindConditions } from "typeorm";
import { URL } from "url";

import { MailerService } from "@quicksend/nestjs-mailer";
import { TransmitService } from "@quicksend/nestjs-transmit";

import { FoldersService } from "../folders/folders.service";
import { ItemsService } from "../items/items.service";
import { TransactionService } from "../transaction/transaction.service";
import { UserService } from "../user/user.service";

import { FileEntity } from "./file.entity";
import { FileInvitationEntity } from "./entities/file-invitation.entity";
import { FolderEntity } from "../folders/folder.entity";
import { UserEntity } from "../user/user.entity";

import { FileInvitationPrivilegeEnum } from "./enums/file-invitation-privilege.enum";

import {
  CantFindFileException,
  CantFindFileDestinationException,
  CantFindFileInvitationException,
  CantFindFileInvitee,
  FileConflictException,
  FileInviteeCannotBeOwner,
  InsufficientPrivilegesException
} from "./files.exceptions";

import { httpNamespace } from "../config/config.namespaces";
import { renderEmail } from "../common/utils/render-email.util";

@Injectable()
export class FilesService {
  constructor(
    private readonly folderService: FoldersService,
    private readonly itemsService: ItemsService,
    private readonly mailerService: MailerService,
    private readonly transactionService: TransactionService,
    private readonly transmitService: TransmitService,
    private readonly userService: UserService,

    @Inject(httpNamespace.KEY)
    private readonly httpConfig: ConfigType<typeof httpNamespace>
  ) {}

  private get fileRepository() {
    return this.transactionService.getRepository(FileEntity);
  }

  private get fileInvitationRepository() {
    return this.transactionService.getRepository(FileInvitationEntity);
  }

  /**
   * Create a copy of the file to a new destination
   */
  async copy(
    from: FindConditions<FileEntity>,
    to: FindConditions<FolderEntity>
  ): Promise<FileEntity> {
    const source = await this.fileRepository.findOne(from);

    if (!source) {
      throw new CantFindFileException();
    }

    const destination = await this.folderService.findOne(to);

    if (!destination) {
      throw new CantFindFileDestinationException();
    }

    const duplicate = await this.fileRepository.findOne({
      name: source.name,
      parent: destination,
      user: source.user
    });

    if (duplicate) {
      throw new FileConflictException();
    }

    const copy = this.fileRepository.create({
      ...source,
      parent: destination
    });

    // don't use .save() here because it will always try to upsert
    await this.fileRepository.insert([copy]);

    return copy;
  }

  /**
   * Find a file and returns a readable stream from item service
   */
  async createReadableStream(
    conditions: FindConditions<FileEntity>,
    user: UserEntity | null
  ): Promise<NodeJS.ReadableStream> {
    const file = await this.fileRepository.findOne(conditions);

    if (!file) {
      throw new CantFindFileException();
    }

    const hasPrivilege = await this.hasPrivilege(
      file,
      user,
      FileInvitationPrivilegeEnum.READ_ONLY
    );

    if (!hasPrivilege) {
      throw new InsufficientPrivilegesException();
    }

    return this.itemsService.createReadableStream({
      id: file.item.id
    });
  }

  /**
   * Delete a file from the database and place the physical file onto the deletion queue
   * if it has no other references
   */
  async deleteOne(conditions: FindConditions<FileEntity>): Promise<FileEntity> {
    const file = await this.fileRepository.findOne(conditions);

    if (!file) {
      throw new CantFindFileException();
    }

    await this.fileRepository.remove(file);

    const count = await this.fileRepository.count({
      item: file.item
    });

    // If there are no other files that reference the related item, then it should be deleted
    if (count === 0) {
      await this.itemsService.deleteOne({
        id: file.item.id
      });
    }

    return file;
  }

  /**
   * Find a file or returns undefined if it does not exist
   */
  async findOne(
    conditions: FindConditions<FileEntity>
  ): Promise<FileEntity | undefined> {
    return this.fileRepository.findOne(conditions);
  }

  /**
   * Find a file or throw an error if it does not exist or if
   * the user does not have access
   */
  async findOneOrFail(
    conditions: FindConditions<FileEntity>,
    user: UserEntity | null
  ): Promise<FileEntity> {
    const file = await this.fileRepository.findOne(conditions);

    if (!file) {
      throw new CantFindFileException();
    }

    const hasPrivilege = await this.hasPrivilege(
      file,
      user,
      FileInvitationPrivilegeEnum.READ_ONLY
    );

    if (!hasPrivilege) {
      throw new InsufficientPrivilegesException();
    }

    return file;
  }

  /**
   * Checks whether a user has privilege to a file
   */
  async hasPrivilege(
    file: FileEntity,
    user: UserEntity | null,
    privilege: FileInvitationPrivilegeEnum
  ): Promise<boolean> {
    if (user && file.user.id === user.id) {
      return true;
    }

    const invitation = await this.fileInvitationRepository.findOne({
      file,
      invitee: user
    });

    if (!invitation || invitation.expired) {
      return false;
    }

    return invitation.privilege >= privilege;
  }

  /**
   * Move a file to another folder
   */
  async move(
    from: FindConditions<FileEntity>,
    to: FindConditions<FolderEntity>
  ): Promise<FileEntity> {
    const file = await this.fileRepository.findOne(from);

    if (!file) {
      throw new CantFindFileException();
    }

    const destination = await this.folderService.findOne(to);

    if (!destination) {
      throw new CantFindFileDestinationException();
    }

    const duplicate = await this.fileRepository.findOne({
      name: file.name,
      parent: destination,
      user: file.user
    });

    if (duplicate) {
      throw new FileConflictException();
    }

    file.parent = destination;

    return this.fileRepository.save(file);
  }

  /**
   * Rename a file with a new name
   */
  async rename(
    conditions: FindConditions<FileEntity>,
    newName: string
  ): Promise<FileEntity> {
    const file = await this.fileRepository.findOne(conditions);

    if (!file) {
      throw new CantFindFileException();
    }

    const duplicate = await this.fileRepository.findOne({
      name: newName,
      parent: file.parent,
      user: file.user
    });

    if (duplicate) {
      throw new FileConflictException();
    }

    file.name = newName;

    return this.fileRepository.save(file);
  }

  /**
   * Saves the metadata of an uploaded file and create its associated item if it does not exist
   */
  async save(
    metadata: File,
    isPublic: boolean,
    folderConditions: FindConditions<FolderEntity>
  ): Promise<FileEntity> {
    const parent = await this.folderService.findOne(folderConditions);

    if (!parent) {
      throw new CantFindFileDestinationException();
    }

    const duplicate = await this.fileRepository.findOne({
      name: metadata.name,
      parent,
      user: parent.user
    });

    if (duplicate) {
      throw new FileConflictException();
    }

    const item = await this.itemsService.grabOne(
      metadata.discriminator,
      metadata.hash,
      metadata.size
    );

    // If the grabbed item discriminator doesn't match with the discriminator of the uploaded file,
    // it means that the item already exist, therefore we need to deduplicate by deleting the uploaded file.
    if (item.discriminator !== metadata.discriminator) {
      await this.transmitService.deleteFile(metadata);
    }

    const file = this.fileRepository.create({
      name: metadata.name,
      item,
      parent,
      user: parent.user
    });

    await this.fileRepository.save(file);

    if (isPublic) {
      const invitation = this.fileInvitationRepository.create({
        file,
        invitee: null,
        privilege: FileInvitationPrivilegeEnum.READ_ONLY
      });

      await this.fileInvitationRepository.save(invitation);
    }

    return file;
  }

  /**
   * Invites a user to a file or updates the privilege of the
   * invitation if the user has already been invited
   */
  async share(
    fileConditions: FindConditions<FileEntity>,
    inviteeConditions: FindConditions<UserEntity> | null,
    privilege: FileInvitationPrivilegeEnum,
    expiresAt: Date | null,
    notifyInvitee: boolean
  ): Promise<FileInvitationEntity> {
    const file = await this.fileRepository.findOne(fileConditions);

    if (!file) {
      throw new CantFindFileException();
    }

    const duplicate = await this.fileInvitationRepository.findOne({
      file,
      invitee: null
    });

    // Update the invitation if the user is already invited to this file
    if (duplicate) {
      duplicate.expiresAt = expiresAt;
      duplicate.privilege = privilege;

      return this.fileInvitationRepository.save(duplicate);
    }

    // If it is shared to a specific person
    if (inviteeConditions) {
      const invitee = await this.userService.findOne(inviteeConditions);

      if (!invitee) {
        throw new CantFindFileInvitee();
      }

      if (file.user.id === invitee.id) {
        throw new FileInviteeCannotBeOwner();
      }

      const invitation = this.fileInvitationRepository.create({
        expiresAt,
        file,
        invitee,
        privilege
      });

      await this.fileInvitationRepository.save(invitation);

      if (notifyInvitee) {
        await this.notifyFileInvitee(invitation);
      }

      return invitation;
    }

    // Otherwise, create an invitation for everyone
    const invitation = this.fileInvitationRepository.create({
      expiresAt,
      file,
      invitee: null,
      privilege
    });

    return this.fileInvitationRepository.save(invitation);
  }

  /**
   * Delete a invitee if specified, otherwise removes all invitees for this file
   */
  async unshare(
    fileConditions: FindConditions<FileEntity>,
    inviteeConditions: FindConditions<UserEntity>
  ): Promise<FileInvitationEntity> {
    const file = await this.fileRepository.findOne(fileConditions);

    if (!file) {
      throw new CantFindFileException();
    }

    const invitee = await this.userService.findOne(inviteeConditions);

    if (!invitee) {
      throw new CantFindFileInvitee();
    }

    const invitation = await this.fileInvitationRepository.findOne({
      invitee,
      file
    });

    if (!invitation) {
      throw new CantFindFileInvitationException();
    }

    return this.fileInvitationRepository.remove(invitation);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  private async deleteExpiredInvitations(): Promise<void> {
    await this.fileInvitationRepository
      .createQueryBuilder()
      .delete()
      .where("now() >= expiresAt")
      .execute();
  }

  private async notifyFileInvitee(
    invitation: FileInvitationEntity
  ): Promise<void> {
    if (!invitation.invitee) {
      return;
    }

    const email = await renderEmail("file-invitation", {
      filename: invitation.file.name,
      inviter: invitation.file.user.username,
      message: `Here's the file that ${invitation.file.user.username} shared with you.`,
      url: new URL(
        `/files/${invitation.file.id}`,
        this.httpConfig.frontendUrl.toString()
      ),
      username: invitation.invitee.username
    });

    await this.mailerService.send({
      html: email,
      subject: `${invitation.file.user.username} shared "${invitation.file.name}" with you.`,
      to: invitation.invitee.email
    });
  }
}
