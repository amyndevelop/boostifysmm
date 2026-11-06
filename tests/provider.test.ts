import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SmmtakeAdapter, ProviderError } from '../src/lib/providers/smmtake';
const transport = (body: unknown, check?: (params: URLSearchParams) => void): typeof fetch => async (url, init) => {
 assert.equal(url, 'https://smmtake.com/api/v2'); assert.equal(init?.method,'POST'); assert.equal(init?.redirect,'error'); check?.(init!.body as URLSearchParams); return Response.json(body);
};
test('balance solo lectura usa parámetros documentados',async () => {
 const api = new SmmtakeAdapter('test-not-a-real-key',transport({ balance:'100.84292',currency:'USD' },p => { assert.equal(p.get('action'),'balance'); assert.equal(p.get('key'),'test-not-a-real-key'); }));
 assert.equal((await api.getBalance()).currency,'USD');
});
test('importa servicios con capacidades sin inventar moneda',async () => {
 const api = new SmmtakeAdapter('test',transport([{service:1,name:'Followers',type:'Default',category:'First',rate:'0.90',min:'50',max:'10000',refill:true,cancel:true}]));
 const services = await api.getServices(); assert.equal(services[0].service,'1'); assert.equal('currency' in services[0],false);
});
test('pedidos reales desactivados por defecto',async () => {
 let called = false;
 const api = new SmmtakeAdapter('test',async () => { called = true; return Response.json({order:23501}); });
 await assert.rejects(api.createOrder({service:'1',quantity:350,link:'https://instagram.com/test'})); assert.equal(called,false);
});
test('envía cantidad manual y acepta identificador documentado con transporte falso',async () => {
 const api = new SmmtakeAdapter('test',transport({order:23501},p => { assert.equal(p.get('quantity'),'350'); assert.equal(p.get('action'),'add'); }),true);
 assert.equal((await api.createOrder({ service:'1',quantity:350,link:'https://instagram.com/test' })).externalId,'23501');
});
test('timeout o respuesta inválida es incierta; no reintenta',async () => {
 let calls = 0;
 const api = new SmmtakeAdapter('test',async () => { calls++; throw new Error('timeout'); },true);
 await assert.rejects(api.createOrder({service:'1',quantity:125,link:'https://instagram.com/test'}), e => e instanceof ProviderError && e.uncertain); assert.equal(calls,1);
});
test('rechaza más de 100 estados',async () => { await assert.rejects(new SmmtakeAdapter('test',transport({})).getMultipleOrderStatuses(Array(101).fill('1'))); });
test('errores remotos no filtran mensajes que podrían contener secretos',async () => {
 await assert.rejects(new SmmtakeAdapter('test',transport({error:'secret-value'})).getBalance(),e => e instanceof Error && !e.message.includes('secret-value'));
});
test('permite endpoints independientes sin mezclar claves',async () => {
 const received: {url: string; key: string | null}[] = [];
 const mock: typeof fetch = async (url,init) => { received.push({url:String(url),key:(init!.body as URLSearchParams).get('key')}); return Response.json({balance:'10.00',currency:'USD'}); };
 await new SmmtakeAdapter('key-a',mock,false,'https://provider-a.com/api/v2').getBalance();
 await new SmmtakeAdapter('key-b',mock,false,'https://provider-b.com/custom/api').getBalance();
 assert.deepEqual(received,[{url:'https://provider-a.com/api/v2',key:'key-a'},{url:'https://provider-b.com/custom/api',key:'key-b'}]);
});
