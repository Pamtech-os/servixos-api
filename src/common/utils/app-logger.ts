import { ConsoleLogger, LogLevel } from '@nestjs/common';

// ANSI colour codes — no extra dependency needed
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  brightRed: '\x1b[91m',
} as const;

const LEVEL_STYLE: Record<LogLevel, { color: string; label: string }> = {
  log: { color: C.green, label: 'INFO ' },
  warn: { color: C.yellow, label: 'WARN ' },
  error: { color: C.red, label: 'ERROR' },
  debug: { color: C.magenta, label: 'DEBUG' },
  verbose: { color: C.cyan, label: 'TRACE' },
  fatal: { color: C.brightRed, label: 'FATAL' },
};

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

export class AppLogger extends ConsoleLogger {
  protected formatLine(
    level: LogLevel,
    message: string,
    context?: string,
  ): string {
    const { color, label } = LEVEL_STYLE[level] ?? LEVEL_STYLE.log;
    const ts = `${C.dim}[${timestamp()}]${C.reset}`;
    const lvl = `${color}${C.bold}[${label}]${C.reset}`;
    const ctx = context ? ` ${C.dim}[${context}]${C.reset}` : '';
    return `${ts} ${lvl}${ctx} ${message}`;
  }

  log(message: unknown, context?: string): void {
    process.stdout.write(
      this.formatLine('log', String(message), context) + '\n',
    );
  }

  warn(message: unknown, context?: string): void {
    process.stdout.write(
      this.formatLine('warn', String(message), context) + '\n',
    );
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    // NestJS calls error(msg, stack, context) or error(msg, context)
    const isStack =
      stackOrContext?.includes('\n') || stackOrContext?.startsWith('Error');
    const ctx = isStack ? context : stackOrContext;
    process.stderr.write(this.formatLine('error', String(message), ctx) + '\n');
    if (isStack && stackOrContext) {
      process.stderr.write(`${C.dim}${stackOrContext}${C.reset}\n`);
    }
  }

  debug(message: unknown, context?: string): void {
    process.stdout.write(
      this.formatLine('debug', String(message), context) + '\n',
    );
  }

  verbose(message: unknown, context?: string): void {
    process.stdout.write(
      this.formatLine('verbose', String(message), context) + '\n',
    );
  }

  fatal(message: unknown, context?: string): void {
    process.stderr.write(
      this.formatLine('fatal', String(message), context) + '\n',
    );
  }
}
