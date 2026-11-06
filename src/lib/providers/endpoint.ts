import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
export function validateProviderEndpoint(value: string) {
 let url: URL;
 try { url = new URL(value); } catch { throw new Error('Ingresá la URL completa de la API.'); }
 const host = url.hostname.toLowerCase();
 if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443') || isIP(host.replace(/^\[|\]$/g,'')) || !host.includes('.') || host.endsWith('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Usá una URL HTTPS de un dominio público, sin credenciales, parámetros ni puertos alternativos.');
 return url.toString();
}
export async function validateProviderDestination(endpoint: string) {
 const url = new URL(validateProviderEndpoint(endpoint));
 const addresses = await lookup(url.hostname,{all:true});
 if (!addresses.length || addresses.some(a => ipaddr.process(a.address).range() !== 'unicast')) throw new Error('El dominio del proveedor debe resolver exclusivamente a direcciones públicas.');
}
