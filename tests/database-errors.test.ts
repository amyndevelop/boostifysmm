import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { reportDatabaseError } from '../src/lib/database-errors';

test('database diagnostics record codes and never exception contents', () => {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const error = new Prisma.PrismaClientKnownRequestError('private-password private-email connection-url', {
      code: 'P2021', clientVersion: '6.19.3', meta: { message: 'secret-query-parameters' },
    });
    const message = reportDatabaseError(error);
    assert.match(message!, /Código de soporte: P2021/);
    assert.equal(logs.length, 1);
    const recorded = JSON.stringify(logs);
    assert.ok(recorded.includes('database_table_missing'));
    for (const secret of ['private-password', 'private-email', 'connection-url', 'secret-query-parameters']) {
      assert.ok(!recorded.includes(secret));
      assert.ok(!message!.includes(secret));
    }
    assert.equal(reportDatabaseError(new Error('expected business error')), null);
    assert.equal(reportDatabaseError(new Prisma.PrismaClientKnownRequestError('secret', { code: 'P2002', clientVersion: '6.19.3' })), 'Ese registro ya existe.');
    assert.equal(logs.length, 1);
  } finally { console.error = original; }
});
