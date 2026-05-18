import { Injectable } from '@nestjs/common';
import type { IPdfRenderer } from '../interfaces/pdf-renderer.interface';

type PuppeteerPage = {
  setContent(
    html: string,
    options: { waitUntil: 'networkidle0' },
  ): Promise<void>;
  pdf(options: { format: 'A4'; printBackground: boolean }): Promise<Buffer>;
};

type PuppeteerBrowser = {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
};

type PuppeteerStatic = {
  launch(options: {
    headless: boolean | 'new';
    args?: string[];
  }): Promise<PuppeteerBrowser>;
};

@Injectable()
export class PuppeteerPdfRenderer implements IPdfRenderer {
  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const modulePath = 'puppeteer';
    const imported = (await import(modulePath)) as { default?: unknown };
    const puppeteer = imported.default as PuppeteerStatic | undefined;

    if (!puppeteer || typeof puppeteer.launch !== 'function') {
      throw new Error('Puppeteer module is not available');
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      return await page.pdf({ format: 'A4', printBackground: true });
    } finally {
      await browser.close();
    }
  }
}
