'use client';
import { useEffect, useRef } from 'react';
export function Modal({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: React.ReactNode }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); },[]);
 return <dialog ref={ref} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} className="card dialog">{children}</dialog>;
}
