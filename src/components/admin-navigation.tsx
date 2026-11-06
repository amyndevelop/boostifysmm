'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useSyncExternalStore} from 'react';
import {LayoutDashboard, Users, ShoppingBag, Layers, FolderTree, Plug, Wallet, MessagesSquare, Landmark, ClipboardList, ArrowLeft, Zap} from 'lucide-react';

const sections = [
 {href:'/admin',label:'Resumen',icon:LayoutDashboard},
 {href:'/admin/usuarios',label:'Usuarios y saldos',icon:Users},
 {href:'/admin/pedidos',label:'Pedidos',icon:ShoppingBag},
 {href:'/admin/servicios',label:'Servicios y precios',icon:Layers},
 {href:'/admin/categorias',label:'Categorías',icon:FolderTree},
 {href:'/admin/proveedores',label:'Proveedores y APIs',icon:Plug},
 {href:'/admin/recargas',label:'Recargas y pagos',icon:Wallet},
 {href:'/admin#solicitudes',label:'Solicitudes de saldo',icon:Wallet},
 {href:'/admin#soporte',label:'Soporte',icon:MessagesSquare},
 {href:'/admin#banco',label:'Datos bancarios',icon:Landmark},
 {href:'/admin#auditoria',label:'Auditoría',icon:ClipboardList},
];
function subscribe(listener:()=>void){window.addEventListener('hashchange',listener);window.addEventListener('popstate',listener);return()=>{window.removeEventListener('hashchange',listener);window.removeEventListener('popstate',listener);};}
export function AdminNavigation(){
 const pathname=usePathname();
 const hash=useSyncExternalStore(subscribe,()=>window.location.hash,()=> '');
 return <aside className="admin-navigation"><Link href="/admin" className="brand"><span><Zap size={22} fill="currentColor" aria-hidden="true"/></span>BOOSTIFY</Link><span className="eyebrow">ADMINISTRACIÓN</span><nav aria-label="Menú de administración">{sections.map(({href,label,icon:Icon})=>{
 const [path,anchor]=href.split('#');
 const active=anchor?pathname===path&&hash===`#${anchor}`:path==='/admin'?pathname===path&&!hash:pathname===path||pathname.startsWith(`${path}/`);
 const content=<><Icon size={18} aria-hidden="true"/><span>{label}</span></>;
 return anchor?<a key={href} href={href} aria-current={active?'page':undefined} className={active?'admin-nav-active':undefined}>{content}</a>:<Link key={href} href={href} prefetch={false} aria-current={active?'page':undefined} className={active?'admin-nav-active':undefined}>{content}</Link>;
 })}</nav><Link className="admin-back" href="/"><ArrowLeft size={18} aria-hidden="true"/>Volver al panel</Link></aside>;
}
