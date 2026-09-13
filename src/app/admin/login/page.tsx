import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { signIn } from '../actions';
import { ActionForm } from '@/components/admin/ActionForm';

// Must be dynamic: whether the admin is configured is read from the environment at
// request time, not baked in at build time.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isSignedIn()) redirect('/admin');
  const configured = Boolean(process.env.ADMIN_PASSWORD_HASH && process.env.SESSION_SECRET);

  return (
    <>
      <h1>Sign in</h1>
      <p className="lede">This admin manages every project from one place.</p>
      <div className="card" style={{ maxWidth: 420 }}>
        {configured ? (
          <ActionForm action={signIn} submitLabel="Sign in">
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        ) : (
          <p className="err" style={{ margin: 0 }}>
            Admin is not configured. Generate a hash with <code>npm run admin:hash -- yourpassword</code>,
            then set <code>ADMIN_PASSWORD_HASH</code> and <code>SESSION_SECRET</code>.
          </p>
        )}
      </div>
    </>
  );
}
