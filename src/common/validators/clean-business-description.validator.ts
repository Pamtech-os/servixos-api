import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { AUTH_MESSAGES } from '../constants/messages/auth.messages';

const FLAGGED_TERMS = [
  // Fraud & scams
  'scam',
  'fraud',
  'fraudulent',
  'fake',
  'phishing',
  'ponzi',
  'pyramid scheme',
  'money laundering',
  'laundering',
  'counterfeit',
  'forgery',
  'embezzlement',
  'bribery',
  'extortion',
  'blackmail',
  'ransomware',
  'identity theft',
  'social engineering',
  'advance fee',
  'get rich quick',

  // Illegal activity
  'illegal',
  'unlawful',
  'criminal',
  'smuggling',
  'trafficking',
  'drug dealing',
  'drug trafficking',
  'arms dealing',
  'weapons dealing',
  'contraband',
  'money mule',
  'hacking',
  'malware',
  'spyware',

  // Hate & violence
  'hate',
  'kill',
  'murder',
  'violence',
  'terrorist',
  'terrorism',
  'extremist',
  'extremism',
  'genocide',
  'assault',
  'abuse',
  'exploit',

  // Adult / inappropriate
  'porn',
  'pornography',
  'adult content',
  'escort',
  'prostitution',
  'gambling',
  'casino',
  'betting',
  'wager',
];

@ValidatorConstraint({ name: 'IsCleanBusinessDescription', async: false })
export class IsCleanBusinessDescriptionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    const lower = value.toLowerCase();
    return !FLAGGED_TERMS.some((term) => lower.includes(term));
  }

  defaultMessage(): string {
    return AUTH_MESSAGES.VALIDATION.BUSINESS_DESCRIPTION_RESTRICTED;
  }
}

export function IsCleanBusinessDescription(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCleanBusinessDescriptionConstraint,
    });
  };
}
