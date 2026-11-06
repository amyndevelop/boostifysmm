import type { NextConfig } from 'next';
const config: NextConfig = {
 // Prisma's JS engine loads its compiler WASM dynamically. Include the asset
 // explicitly so Vercel's serverless functions retain it after file tracing.
 outputFileTracingIncludes: {
   '/*': ['./node_modules/.prisma/client/query_compiler_bg.*'],
 },
 experimental: { serverActions: { bodySizeLimit: '3mb' } },
 async headers() { return [{ source: '/:path*', headers: [
 { key: 'X-Content-Type-Options', value:'nosniff' },
 { key: 'X-Frame-Options', value:'DENY' },
 { key: 'Referrer-Policy', value:'strict-origin-when-cross-origin' },
 { key: 'Permissions-Policy', value:'camera=(), microphone=(), geolocation=()' },
 { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` }
 ] }]; }
};
export default config;
