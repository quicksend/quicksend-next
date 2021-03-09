import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { BullModule, InjectQueue } from "@nestjs/bull";

import {
  ClassSerializerInterceptor,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";

import { ThrottlerGuard, ThrottlerModule } from "nestjs-throttler";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BullAdapter, router, setQueues } from "bull-board";
import { Queue } from "bull";

import { AppController } from "./app.controller";

import { HttpExceptionFilter } from "../common/filters/http-exception.filter";
import { ThrottlerExceptionFilter } from "../common/filters/throttler-exception.filter";
import { ValidationExceptionFilter } from "../common/filters/validation-exception.filter";

import { SessionCheckMiddleware } from "../common/middlewares/session-check.middleware";

import { ValidationPipe } from "../common/pipes/validation.pipe";

import { ApplicationsModule } from "../applications/applications.module";
import { AuthModule } from "../auth/auth.module";
import { ConfigModule } from "../config/config.module";
import { FilesModule } from "../files/files.module";
import { FoldersModule } from "../folders/folders.module";
import { ItemsModule } from "../items/items.module";
import { UnitOfWorkModule } from "../unit-of-work/unit-of-work.module";
import { UserModule } from "../user/user.module";

import { SharedBullModuleConfig } from "../config/modules/shared-bull-module.config";
import { ThrottlerModuleConfig } from "../config/modules/throttler-module.config";
import { TypeOrmModuleConfig } from "../config/modules/typeorm-module.config";

import { ItemsProcessor } from "../items/items.processor";

@Module({
  imports: [
    ApplicationsModule,

    AuthModule,

    BullModule.forRootAsync({
      useClass: SharedBullModuleConfig
    }),

    ConfigModule,

    FilesModule,

    FoldersModule,

    ItemsModule,

    ThrottlerModule.forRootAsync({
      useClass: ThrottlerModuleConfig
    }),

    TypeOrmModule.forRootAsync({
      useClass: TypeOrmModuleConfig
    }),

    UnitOfWorkModule,

    UserModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    },
    {
      provide: APP_FILTER,
      useClass: ThrottlerExceptionFilter
    },
    {
      provide: APP_FILTER,
      useClass: ValidationExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor
    },
    {
      provide: APP_PIPE,
      useFactory: ValidationPipe
    }
  ]
})
export class AppModule implements NestModule {
  constructor(@InjectQueue(ItemsProcessor.QUEUE_NAME) itemProcessor: Queue) {
    setQueues([new BullAdapter(itemProcessor)]);
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(SessionCheckMiddleware)
      .forRoutes({ method: RequestMethod.ALL, path: "*" });

    consumer
      .apply(router)
      .forRoutes({ method: RequestMethod.ALL, path: "bull" });
  }
}
