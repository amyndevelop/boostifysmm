import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {AdminNavigation} from '@/components/admin-navigation';

export default async function AdminLayout({children}:{children:React.ReactNode}){
 const actor=await requireUser();
 if(!['ADMIN','SUPER_ADMIN'].includes(actor.role))notFound();
 return <div className="admin-workspace"><AdminNavigation/><div className="admin-content">{children}</div></div>;
}
