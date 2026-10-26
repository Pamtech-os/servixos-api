import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinWaitlistDto } from 'src/modules/waitlist/dto/join-waitlist.dto';
import { WaitlistPersona } from 'src/modules/waitlist/schemas/waitlist-entry.schema';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';

const validPayload = {
  firstName: 'Ada',
  email: 'ada@example.com',
  persona: WaitlistPersona.HAS_IDEA,
};

const errorsFor = async (payload: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(JoinWaitlistDto, payload));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
};

describe('JoinWaitlistDto', () => {
  it('should accept a complete, valid payload', async () => {
    // Arrange
    const payload = validPayload;

    // Act
    const messages = await errorsFor(payload);

    // Assert
    expect(messages).toEqual([]);
  });

  it('should require persona', async () => {
    // Arrange
    const payload = { firstName: 'Ada', email: 'ada@example.com' };

    // Act
    const messages = await errorsFor(payload);

    // Assert
    expect(messages).toContain(WAITLIST_MESSAGES.VALIDATION.PERSONA_REQUIRED);
  });

  it('should reject an unknown persona value', async () => {
    // Arrange
    const payload = { ...validPayload, persona: 'something_else' };

    // Act
    const messages = await errorsFor(payload);

    // Assert
    expect(messages).toContain(WAITLIST_MESSAGES.VALIDATION.PERSONA_INVALID);
  });

  it('should reject an invalid email address', async () => {
    // Arrange
    const payload = { ...validPayload, email: 'not-an-email' };

    // Act
    const messages = await errorsFor(payload);

    // Assert
    expect(messages).toContain(WAITLIST_MESSAGES.VALIDATION.EMAIL_INVALID);
  });

  it('should require first name', async () => {
    // Arrange
    const payload = { ...validPayload, firstName: '   ' };

    // Act
    const messages = await errorsFor(payload);

    // Assert
    expect(messages).toContain(
      WAITLIST_MESSAGES.VALIDATION.FIRST_NAME_REQUIRED,
    );
  });
});
