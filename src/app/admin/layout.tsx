import './admin.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminHostAllowed, isSignedIn } from '@/lib/auth';
import { signOut } from './actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The admin is never served from a project's public domain.
  if (!(await adminHostAllowed())) notFound();
  const signedIn = await isSignedIn();

  return (
    <div className="admin">
      <nav className="admin-bar">
        <a href="/admin">Smartlink admin</a>
        {signedIn && (
          <>
            <span className="spacer" />
            <form action={signOut}>
              <button className="ghost" type="submit">Sign out</button>
            </form>
          </>
        )}
      </nav>
      <div className="admin-wrap">{children}</div>
    </div>
  );
}
