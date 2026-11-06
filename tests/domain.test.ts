import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, quantitySchema, validateOrderLink } from '../src/lib/domain';
for (const [quantity, price] of [[125,'625.00'],[350,'1750.00'],[750,'3750.00'],[1250,'6250.00'],[12500,'62500.00']] as const) test(`${quantity} unidades con precio decimal exacto`, () => assert.equal(calculatePrice(quantity,'5000').toFixed(2),price));
for (const value of ['',-1,1.5,0,undefined]) test(`rechaza cantidad ${String(value)}`, () => assert.equal(quantitySchema.safeParse(value).success,false));
test('redondea HALF_UP a centavos', () => assert.equal(calculatePrice(125,'0.04').toFixed(2),'0.01'));
test('valida dominio y evita credenciales y sufijos falsos', () => {
 assert.equal(validateOrderLink('https://vm.tiktok.com/abc',['tiktok.com']),'https://vm.tiktok.com/abc');
 for (const link of ['https://instagram.com.evil.test/u','https://evil.test/instagram.com','http://instagram.com/u','https://user:secret@instagram.com/u']) assert.throws(() => validateOrderLink(link,['instagram.com']));
});
