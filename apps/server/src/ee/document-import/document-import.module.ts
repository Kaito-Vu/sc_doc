import { Module } from '@nestjs/common';
import { DocxImportService } from './docx-import.service';
import { PdfImportService } from './pdf-import.service';
import { EaAttachmentService } from '../ea-import/ea-attachment.service';

@Module({
  providers: [DocxImportService, PdfImportService, EaAttachmentService],
  exports: [DocxImportService, PdfImportService],
})
export class DocumentImportModule {}
