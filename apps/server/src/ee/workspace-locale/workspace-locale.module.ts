import { Module } from '@nestjs/common';
import { WorkspaceLocaleController } from './workspace-locale.controller';

@Module({ controllers: [WorkspaceLocaleController] })
export class WorkspaceLocaleModule {}
