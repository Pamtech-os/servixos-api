import { Logger } from '@nestjs/common';

const LOG_METHODS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
type LogMethod = (typeof LOG_METHODS)[number];

// Save descriptors (may be undefined if the method is inherited, not own)
const savedDescriptors = new Map<LogMethod, PropertyDescriptor | undefined>();

// Replace with no-ops once per file so jest.restoreAllMocks() in individual
// tests cannot un-silence them (direct assignment, not jest.spyOn).
beforeAll(() => {
  for (const method of LOG_METHODS) {
    savedDescriptors.set(
      method,
      Object.getOwnPropertyDescriptor(Logger.prototype, method),
    );
    Object.defineProperty(Logger.prototype, method, {
      value: () => {},
      configurable: true,
      writable: true,
    });
  }
});

afterAll(() => {
  for (const method of LOG_METHODS) {
    const descriptor = savedDescriptors.get(method);
    if (descriptor) {
      Object.defineProperty(Logger.prototype, method, descriptor);
    } else {
      // Method was inherited — remove the own property we added
      delete (Logger.prototype as unknown as Record<string, unknown>)[method];
    }
  }
});
