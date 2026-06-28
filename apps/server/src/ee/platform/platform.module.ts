import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { registerProcessErrorHandlers } from './errors/process-error.handlers';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class PlatformModule implements OnModuleInit {
  private readonly logger = new Logger(PlatformModule.name);

  onModuleInit(): void {
    registerProcessErrorHandlers(this.logger);
  }
}
