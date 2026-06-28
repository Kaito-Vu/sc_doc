import { HttpException } from '@nestjs/common';

export function isHttpException(error: unknown): error is HttpException {
  return error instanceof HttpException;
}
