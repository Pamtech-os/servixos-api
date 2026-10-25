import { Inject, Injectable } from '@nestjs/common';
import type { IPdfRenderer } from './interfaces/pdf-renderer.interface';
import { PDF_RENDERER } from './interfaces/pdf-renderer.interface';

@Injectable()
export class PdfService {
  constructor(@Inject(PDF_RENDERER) private readonly renderer: IPdfRenderer) {}

  /** Renders an HTML string to a PDF buffer. */
  renderHtmlToPdf(html: string): Promise<Buffer> {
    return this.renderer.renderHtmlToPdf(html);
  }
}
