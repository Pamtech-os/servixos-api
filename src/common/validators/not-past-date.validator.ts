import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { REQUESTS_MESSAGES } from '../constants/messages/requests.messages';

@ValidatorConstraint({ name: 'IsTodayOrFutureDate', async: false })
export class IsTodayOrFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return true;

    const requestedDayUtc = Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    );

    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    return requestedDayUtc >= todayUtc;
  }

  defaultMessage(): string {
    return REQUESTS_MESSAGES.VALIDATION.REQUESTED_DATE_NOT_PAST;
  }
}

export function IsTodayOrFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsTodayOrFutureDateConstraint,
    });
  };
}
