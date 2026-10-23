const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes user-supplied text for safe interpolation into HTML. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/** Escapes plain text and preserves its line breaks as `<br />`. */
export const textToHtml = (value: string): string =>
  escapeHtml(value).replace(/\r?\n/g, '<br />');
