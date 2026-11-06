import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {reportProviderFailure} from '../src/lib/providers/errors';
import {ProviderError} from '../src/lib/providers/smmtake';
test('el diagnóstico del proveedor no imprime respuestas, claves ni consultas',()=>{
 const original=console.error;const logs:unknown[][]=[];console.error=(...args:unknown[])=>{logs.push(args);};
 try{
  const message=reportProviderFailure(new Prisma.PrismaClientKnownRequestError('secret-password',{code:'P2021',clientVersion:'6.19.3',meta:{query:'secret-query'}}),'DATABASE');
  assert.match(message,/migraciones/);assert.match(message,/P2021/);
  const providerMessage=reportProviderFailure(new ProviderError(false,'SERVICES_FORMAT',undefined,['rate','secret-key']),'SERVICES');
  assert.match(providerMessage,/rate/);assert.ok(!providerMessage.includes('secret-key'));
  const output=JSON.stringify(logs);for(const secret of ['secret-password','secret-query','secret-key'])assert.ok(!output.includes(secret));
 }finally{console.error=original;}
});
