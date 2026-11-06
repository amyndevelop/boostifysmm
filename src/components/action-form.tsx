'use client';
import { useActionState } from 'react';
import { Button } from './ui/button';
import type { ActionResult } from '@/app/actions';
export function ActionForm({ action, children, label, className }: { action: (state: ActionResult, data: FormData) => Promise<ActionResult>; children: React.ReactNode; label: string; className?: string }) {
 const [state, formAction, pending] = useActionState(action, {});
 return <form action={formAction} className={className ?? 'form-stack'}>{children}{state.error && <p className="error" role="alert">{state.error}</p>}{state.success && <p className="success" role="status">{state.success}</p>}<Button disabled={pending}>{pending ? 'Procesando…' : label}</Button></form>;
}
