import { Module } from '@nestjs/common';
import { PageLabelInheritListener } from './page-label-inherit.listener';

@Module({ providers: [PageLabelInheritListener] })
export class PageLabelInheritModule {}
