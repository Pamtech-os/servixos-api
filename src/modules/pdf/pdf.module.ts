import { Global, Module } from '@nestjs/common';
import { PDF_RENDERER } from './interfaces/pdf-renderer.interface';
import { PuppeteerPdfRenderer } from './providers/puppeteer.pdf-renderer';
import { PdfService } from './pdf.service';

@Global()
@Module({
  providers: [
    { provide: PDF_RENDERER, useClass: PuppeteerPdfRenderer },
    PdfService,
  ],
  exports: [PdfService],
})
export class PdfModule {}
