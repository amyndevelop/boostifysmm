import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

const hints: Record<string, string> = {
  P1000: 'database_authentication',
  P1001: 'database_unreachable',
  P1002: 'database_timeout',
  P1010: 'database_permission',
  P1011: 'database_tls',
  P2021: 'database_table_missing',
  P2022: 'database_column_missing',
  P2024: 'database_pool_timeout',
};

// Never log the exception, message, stack, query, parameters or connection URL:
// Prisma errors can contain user input and credentials in those fields.
export function reportDatabaseError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) &&
      !(error instanceof Prisma.PrismaClientInitializationError)) return null;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ese registro ya existe.';
  }
  const rawCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error.errorCode;
  const code = rawCode && /^P\d{4}$/.test(rawCode) ? rawCode : 'UNKNOWN';
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const meta = error instanceof Prisma.PrismaClientKnownRequestError ? record(error.meta) : {};
  const cause = record(record(meta.driverAdapterError).cause);
  const rawSqlState = cause.originalCode ?? meta.code;
  const sqlState = typeof rawSqlState === 'string' && /^[0-9A-Z]{5}$/.test(rawSqlState) ? rawSqlState : undefined;
  const model = typeof meta.modelName === 'string' && ['User', 'Session', 'Wallet', 'RateLimit'].includes(meta.modelName) ? meta.modelName : undefined;
  const reference = randomUUID();
  console.error('BOOSTIFY_DATABASE_ERROR', {
    reference,
    code,
    sqlState,
    model,
    hint: hints[code] ?? 'database_request_failed',
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
  });
  return `No pudimos completar la operación. Código de soporte: ${code} / ${reference}.`;
}
