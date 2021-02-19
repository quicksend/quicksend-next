import { HttpModule, Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

import { UnitOfWorkModule } from "../unit-of-work/unit-of-work.module";

@Module({
  imports: [HttpModule, UnitOfWorkModule],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}