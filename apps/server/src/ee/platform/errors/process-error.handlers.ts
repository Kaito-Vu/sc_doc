import { Logger } from '@nestjs/common';

let registered = false;

export function registerProcessErrorHandlers(logger: Logger): void {
  if (registered) {
    return;
  }

  registered = true;
  const isProduction = process.env.NODE_ENV === 'production';

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');

    if (isProduction) {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}
