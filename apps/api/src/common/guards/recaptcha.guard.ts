import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  HttpService,
  Inject,
  Injectable,
  InternalServerErrorException
} from "@nestjs/common";

import { ConfigType } from "@nestjs/config";

import { Reflector } from "@nestjs/core";

import { Request } from "express";

import { getClientIp } from "request-ip";
import { stringify } from "querystring";

import { secretsNamespace } from "../../config/config.namespaces";

const RECAPTCHA_FAILED = "reCAPTCHA failed, please try again!";
const RECAPTCHA_MISSING = "Please complete the reCAPTCHA!";
const RECAPTCHA_UNEXPECTED_RESULT = "Action or score metadata not provided for v3 reCAPTCHA!"; // prettier-ignore
const RECAPTCHA_URL = "https://www.google.com/recaptcha/api/siteverify";

export const RECAPTCHA_ACTION_KEY = "RECAPTCHA_ACTION";
export const RECAPTCHA_SCORE_KEY = "RECAPTCHA_SCORE";

@Injectable()
export class RecaptchaGuard implements CanActivate {
  constructor(
    private readonly httpService: HttpService,
    private readonly reflector: Reflector,

    @Inject(secretsNamespace.KEY)
    private readonly secretsConfig: ConfigType<typeof secretsNamespace>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this._getMetadata<string>(RECAPTCHA_ACTION_KEY, context);
    const score = this._getMetadata<number>(RECAPTCHA_SCORE_KEY, context);

    const req = context.switchToHttp().getRequest<Request>();

    if (!req.body.recaptcha) {
      throw new BadRequestException(RECAPTCHA_MISSING);
    }

    const result = await this.httpService
      .post(
        RECAPTCHA_URL,
        stringify({
          remoteip: getClientIp(req),
          response: req.body.recaptcha,
          secret: this.secretsConfig.recaptcha
        })
      )
      .toPromise()
      .then((res) => {
        const body = res.data;
        const errorCodes = body["error-codes"];
        const filterFn = (err: string) => err.endsWith("secret");

        if (!errorCodes || !errorCodes.length || !errorCodes.some(filterFn)) {
          return body;
        }

        return { error: errorCodes.filter(filterFn).join(", ") };
      })
      .catch((error) => ({ error }));

    if (result.error) {
      throw new InternalServerErrorException(result.error);
    }

    if (!result.success) {
      throw new BadRequestException(RECAPTCHA_FAILED);
    }

    if (result.action && result.score) {
      if (!action || !score) {
        throw new InternalServerErrorException(RECAPTCHA_UNEXPECTED_RESULT);
      }

      if (result.action !== action || result.score < score) {
        throw new BadRequestException(RECAPTCHA_FAILED);
      }
    }

    return true;
  }

  private _getMetadata<T>(
    key: string,
    context: ExecutionContext
  ): T | undefined {
    return this.reflector.get<T | undefined>(key, context.getHandler());
  }
}
