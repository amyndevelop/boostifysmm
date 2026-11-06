import type { Metadata } from 'next';
import '@fontsource-variable/geist';
import './globals.css';
export const metadata: Metadata = { title: 'BOOSTIFY · Hacé crecer tus redes', description: 'Tu espacio para gestionar servicios, pedidos y saldo.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es-AR"><body>{children}</body></html>; }
