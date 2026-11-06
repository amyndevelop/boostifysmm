'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="legal"><span className="pill">BOOSTIFY</span><h1>No pudimos cargar esta pantalla.</h1><p>Probá de nuevo en unos instantes. Si el problema continúa, contactá al administrador. Tu saldo y tus pedidos se conservan.</p><Button onClick={reset}>Volver a intentar</Button></main>; }
