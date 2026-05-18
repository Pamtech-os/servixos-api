export interface IPdfRenderer {
  renderHtmlToPdf(html: string): Promise<Buffer>;
}

export const PDF_RENDERER = Symbol('PDF_RENDERER');
