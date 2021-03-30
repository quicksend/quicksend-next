import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from "typeorm";

import { BaseEntity } from "../../common/entities/base.entity";
import { FileEntity } from "../file.entity";
import { UserEntity } from "../../user/user.entity";

import { FileInvitationPrivilegeEnum } from "../enums/file-invitation-privilege.enum";

@Entity("file_invitation")
export class FileInvitationEntity extends BaseEntity {
  @Column({
    nullable: true,
    type: "timestamp"
  })
  expiresAt!: Date | null;

  @ManyToOne(() => FileEntity, (file) => file.invitations, {
    eager: true,
    nullable: false,
    onDelete: "CASCADE"
  })
  file!: FileEntity;

  @JoinColumn()
  @OneToOne(() => UserEntity, {
    eager: true
  })
  invitee!: UserEntity | null;

  @Column({
    default: FileInvitationPrivilegeEnum.READ_ONLY,
    enum: FileInvitationPrivilegeEnum,
    type: "enum"
  })
  privilege!: FileInvitationPrivilegeEnum;

  get expired() {
    return this.expiresAt && Date.now() >= this.expiresAt.getTime();
  }
}
