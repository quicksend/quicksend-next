import { Column, Entity, ManyToOne } from "typeorm";

import { Exclude } from "class-transformer";

import { BaseEntity } from "../../common/entities/base.entity";

import { UserEntity } from "../user/user.entity";

import { ApplicationScopesEnum } from "./enums/application-scopes.enum";

@Entity({ name: "application" })
export class ApplicationEntity extends BaseEntity {
  @Column()
  name!: string;

  @Column({
    array: true,
    default: [
      ApplicationScopesEnum.READ_FOLDER_METADATA,
      ApplicationScopesEnum.READ_USER_PROFILE
    ],
    enum: ApplicationScopesEnum,
    type: "enum"
  })
  scopes!: ApplicationScopesEnum[];

  @Column({
    nullable: true,
    type: "varchar",
    unique: true
  })
  @Exclude()
  secret!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.files, {
    eager: true,
    nullable: false
  })
  user!: UserEntity;
}
