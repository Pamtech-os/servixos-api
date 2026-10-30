import { registerDecorator, ValidationOptions } from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SUPPORTED_COUNTRY_SET } from '../constants/countries.constants';

/** Returns true when `value` is a valid E.164-style number from a supported launch country. */
export function isSupportedCountryPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parsed = parsePhoneNumberFromString(value);
  return (
    !!parsed?.isValid() &&
    !!parsed.country &&
    SUPPORTED_COUNTRY_SET.has(parsed.country)
  );
}

export function IsSupportedCountryPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSupportedCountryPhone',
      target: object.constructor,
      propertyName,
      options,
      validator: { validate: isSupportedCountryPhone },
    });
  };
}
