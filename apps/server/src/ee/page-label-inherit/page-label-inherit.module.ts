import { Module } from '@nestjs/common';
import { PageLabelInheritListener } from './page-label-inherit.listener';
import { PageLabelInheritRepo } from './page-label-inherit.repo';

@Module({ providers: [PageLabelInheritListener, PageLabelInheritRepo] })
export class PageLabelInheritModule {}
