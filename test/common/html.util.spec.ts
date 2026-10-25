import { escapeHtml, textToHtml } from 'src/common/utils/html.util';

describe('html.util', () => {
  describe('escapeHtml', () => {
    it('should escape all HTML-significant characters', () => {
      // Arrange
      const input = `<a href="x">Tom & Jerry's</a>`;

      // Act
      const result = escapeHtml(input);

      // Assert
      expect(result).toBe(
        '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
      );
    });
  });

  describe('textToHtml', () => {
    it('should convert line breaks to <br /> after escaping', () => {
      // Arrange
      const input = 'Hi <b>\r\nThanks\nBye';

      // Act
      const result = textToHtml(input);

      // Assert
      expect(result).toBe('Hi &lt;b&gt;<br />Thanks<br />Bye');
    });
  });
});
