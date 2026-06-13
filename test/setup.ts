import { Logger } from '@nestjs/common';

const origError = Logger.prototype.error;
const origWarn = Logger.prototype.warn;
const origLog = Logger.prototype.log;
const origDebug = Logger.prototype.debug;
const origVerbose = Logger.prototype.verbose;

// Replace with no-ops once per file so jest.restoreAllMocks() in individual
// tests cannot un-silence them (direct assignment, not jest.spyOn).
beforeAll(() => {
  Logger.prototype.error = () => {};
  Logger.prototype.warn = () => {};
  Logger.prototype.log = () => {};
  Logger.prototype.debug = () => {};
  Logger.prototype.verbose = () => {};
});

afterAll(() => {
  Logger.prototype.error = origError;
  Logger.prototype.warn = origWarn;
  Logger.prototype.log = origLog;
  Logger.prototype.debug = origDebug;
  Logger.prototype.verbose = origVerbose;
});
