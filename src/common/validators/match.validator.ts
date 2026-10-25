import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { COMMON_MESSAGES } from '../constants/messages/common.messages';

export function Match(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string];
          return value === (args.object as Record<string, unknown>)[related];
        },
        defaultMessage(args: ValidationArguments) {
          const [related] = args.constraints as [string];
          return COMMON_MESSAGES.VALIDATION.FIELD_MUST_MATCH(
            args.property,
            related,
          );
        },
      },
    });
  };
}
