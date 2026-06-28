import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse } from '../../../common/errors/exception-response.util';
import { isHttpException } from '../../../common/errors/is-http-exception.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const includeStack =
      process.env.NODE_ENV !== 'production' &&
      process.env.DEBUG_MODE === 'true';

    const body = buildErrorResponse(exception, { includeStack });
    const status = body.status;

    const shouldLogAsError =
      !isHttpException(exception) ||
      status >= HttpStatus.INTERNAL_SERVER_ERROR;

    const logPayload = {
      err: exception,
      method: request.method,
      path: request.url,
      status,
      workspaceId: (request.raw as { workspaceId?: string })?.workspaceId,
      userId: (request.raw as { user?: { id?: string } })?.user?.id,
    };

    if (shouldLogAsError) {
      this.logger.error(logPayload, body.message);
    } else if (exception instanceof HttpException) {
      this.logger.warn(logPayload, body.message);
    }

    response.status(status).send(body);
  }
}
