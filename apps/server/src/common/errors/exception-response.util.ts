import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorResponseBody {
  success: false;
  status: number;
  message: string;
  errorCode?: string;
  stack?: string;
}

function extractHttpExceptionMessage(exception: HttpException): {
  message: string;
  errorCode?: string;
} {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return { message: response };
  }

  if (typeof response === 'object' && response !== null) {
    const body = response as Record<string, unknown>;
    const rawMessage = body.message;

    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;

    const errorCode =
      typeof body.errorCode === 'string' ? body.errorCode : undefined;

    return { message, errorCode };
  }

  return { message: exception.message };
}

export function buildErrorResponse(
  exception: unknown,
  options?: { includeStack?: boolean },
): ErrorResponseBody {
  const includeStack = options?.includeStack ?? false;
  const isProduction = process.env.NODE_ENV === 'production';

  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

  let message = 'Internal server error';
  let errorCode: string | undefined;

  if (exception instanceof HttpException) {
    const extracted = extractHttpExceptionMessage(exception);
    message = extracted.message;
    errorCode = extracted.errorCode;
  } else if (exception instanceof Error && !isProduction) {
    message = exception.message || message;
  }

  if (isProduction && status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    if (!(exception instanceof HttpException)) {
      message = 'Internal server error';
    }
  }

  return {
    success: false,
    status,
    message,
    ...(errorCode ? { errorCode } : {}),
    ...(includeStack && exception instanceof Error && exception.stack
      ? { stack: exception.stack }
      : {}),
  };
}
