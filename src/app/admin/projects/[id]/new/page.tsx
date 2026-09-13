import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ReleaseWizard } from '@/components/admin/ReleaseWizard';

export const dynamic = 'force-dynamic';

export default async function NewReleasePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isSignedIn())) redirect('/admin/login');
  const { id } = await params;
  const [project] = await sql<{ id: string; name: string }[]>`
    select id, name from project where id = ${id}
  `;
  if (!project) notFound();

  return (
    <>
      <h1>New release</h1>
      <p className="lede">
        <a href={`/admin/projects/${project.id}`}>{project.name}</a>
      </p>
      <ReleaseWizard projectId={project.id} />
    </>
  );
}
