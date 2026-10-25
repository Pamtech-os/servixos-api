import { Injectable } from '@nestjs/common';
import type { IPdfRenderer } from '../interfaces/pdf-renderer.interface';

@Injectable()
export class PuppeteerPdfRenderer implements IPdfRenderer {
  async renderHtmlToPdf(html: string): Promise<Buffer> {
    // puppeteer-core and @sparticuz/chromium ship as ESM-only; this project
    // compiles to CommonJS, so a dynamic import is required for interop.
    const { default: puppeteer } = await import('puppeteer-core');
    const { default: chromium } = await import('@sparticuz/chromium');

    const browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({
        args: chromium.args,
        headless: 'shell',
      }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
