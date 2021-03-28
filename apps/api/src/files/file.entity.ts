import { Column, Entity, ManyToOne, OneToMany } from "typeorm";

import { BaseEntity } from "../common/entities/base.entity";

import { FileInvitationEntity } from "./entities/file-invitation.entity";
import { FolderEntity } from "../folders/folder.entity";
import { ItemEntity } from "../items/item.entity";
import { UserEntity } from "../user/user.entity";

@Entity("file")
export class FileEntity extends BaseEntity {
  @OneToMany(() => FileInvitationEntity, (invitation) => invitation.file)
  invitations!: FileInvitationEntity[];

  @ManyToOne(() => ItemEntity, {
    eager: true,
    nullable: false,
    onDelete: "CASCADE"
  })
  item!: ItemEntity;

  @Column()
  name!: string;

  @ManyToOne(() => FolderEntity, {
    eager: true,
    nullable: false,
    onDelete: "CASCADE"
  })
  parent!: FolderEntity;

  @Column({
    default: false
  })
  public!: boolean;

  @ManyToOne(() => UserEntity, {
    eager: true,
    nullable: false
  })
  user!: UserEntity;
}
