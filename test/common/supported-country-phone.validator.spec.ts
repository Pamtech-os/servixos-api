import { isSupportedCountryPhone } from 'src/common/validators/supported-country-phone.validator';

describe('isSupportedCountryPhone', () => {
  it.each([
    ['Nigeria', '+2348031234567'],
    ['United Kingdom', '+447400123456'],
    ['United States', '+12025550199'],
    ['Canada', '+14165550123'],
  ])('accepts a valid %s number', (_country, phone) => {
    // Arrange
    const value = phone;

    // Act
    const result = isSupportedCountryPhone(value);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    ['a number from an unsupported country', '+4915123456789'],
    ['a +1 number outside the US and Canada', '+18765551234'],
    ['an invalid number', '+12345'],
    ['a number without a country code', '08031234567'],
    ['a non-string value', 2348031234567],
  ])('rejects %s', (_case, value) => {
    // Arrange
    const input: unknown = value;

    // Act
    const result = isSupportedCountryPhone(input);

    // Assert
    expect(result).toBe(false);
  });
});
