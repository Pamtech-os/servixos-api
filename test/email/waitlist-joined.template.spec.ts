import { waitlistJoinedTemplate } from 'src/modules/email/templates/waitlist-joined.template';
import { WaitlistPersona } from 'src/modules/waitlist/schemas/waitlist-entry.schema';

const UNSUBSCRIBE_URL = 'https://servixos.com/unsubscribe?token=abc.def';

describe('waitlistJoinedTemplate', () => {
  it('should include the unsubscribe link', () => {
    // Act
    const html = waitlistJoinedTemplate(
      'Ada',
      WaitlistPersona.HAS_IDEA,
      UNSUBSCRIBE_URL,
    );

    // Assert
    expect(html).toContain(`href="${UNSUBSCRIBE_URL}"`);
  });

  it('should greet the recipient by first name', () => {
    // Arrange
    const firstName = 'Ada';

    // Act
    const html = waitlistJoinedTemplate(
      firstName,
      WaitlistPersona.HAS_IDEA,
      UNSUBSCRIBE_URL,
    );

    // Assert
    expect(html).toContain('Hi Ada, welcome!');
  });

  it('should escape HTML in the user-supplied first name', () => {
    // Arrange
    const firstName = '<script>alert(1)</script>';

    // Act
    const html = waitlistJoinedTemplate(
      firstName,
      WaitlistPersona.EXPLORING,
      UNSUBSCRIBE_URL,
    );

    // Assert
    expect(html).not.toContain('<script>');
  });

  it('should include a message tailored to the selected persona', () => {
    // Arrange
    const persona = WaitlistPersona.BUSINESS_OWNER;

    // Act
    const html = waitlistJoinedTemplate('Ada', persona, UNSUBSCRIBE_URL);

    // Assert
    expect(html).toContain('You told us you already run a business.');
  });
});
