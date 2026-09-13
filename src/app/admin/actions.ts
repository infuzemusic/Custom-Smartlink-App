'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireAdmin, createSession, destroySession, adminHostAllowed } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const HOSTNAME = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}
function optional(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value === '' ? null : value;
}

export type ActionState = { error?: string };

/* ---------------------------------------------------------------- auth --- */

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await adminHostAllowed())) return { error: 'Admin is not available on this host.' };
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !process.env.SESSION_SECRET) {
    return { error: 'Admin is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET.' };
  }
  if (!verifyPassword(str(form, 'password'), hash)) {
    return { error: 'Incorrect password.' };
  }
  await createSession();
  redirect('/admin');
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/admin/login');
}

/* ------------------------------------------------------------ projects --- */

export async function createProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const slug = str(form, 'slug').toLowerCase();
  const name = str(form, 'name');
  if (!SLUG.test(slug)) return { error: 'Slug must be lowercase letters, numbers and hyphens.' };
  if (!name) return { error: 'Name is required.' };

  const [account] = await sql<{ id: string }[]>`select id from account order by created_at limit 1`;
  if (!account) return { error: 'No account row exists. Run the seed first.' };

  const existing = await sql`select 1 from project where account_id = ${account.id} and slug = ${slug}`;
  if (existing.length > 0) return { error: `A project with slug "${slug}" already exists.` };

  const [project] = await sql<{ id: string }[]>`
    insert into project (account_id, slug, name) values (${account.id}, ${slug}, ${name})
    returning id
  `;
  await sql`insert into tracking (project_id) values (${project!.id}) on conflict do nothing`;
  redirect(`/admin/projects/${project!.id}`);
}

export async function updateProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(form, 'id');
  const name = str(form, 'name');
  if (!name) return { error: 'Name is required.' };

  let profiles: Record<string, string> = {};
  const rawProfiles = str(form, 'profiles');
  if (rawProfiles) {
    // One "Label = https://url" per line. Friendlier than asking for JSON.
    for (const line of rawProfiles.split('\n')) {
      const [label, ...rest] = line.split('=');
      const url = rest.join('=').trim();
      if (label?.trim() && url) profiles[label.trim()] = url;
    }
  }

  await sql`
    update project set
      name = ${name},
      tagline = ${optional(form, 'tagline')},
      theme = ${sql.json({ accent: optional(form, 'accent') ?? undefined })},
      profiles = ${sql.json(profiles)}
    where id = ${id}
  `;
  revalidatePath(`/admin/projects/${id}`);
  return {};
}

export async function deleteProject(form: FormData): Promise<void> {
  await requireAdmin();
  await sql`delete from project where id = ${str(form, 'id')}`;
  redirect('/admin');
}

/* ------------------------------------------------------------- domains --- */

export async function addDomain(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  const hostname = str(form, 'hostname').toLowerCase().replace(/^https?:\/\//, '').split('/')[0]!;
  if (!HOSTNAME.test(hostname)) return { error: 'That does not look like a hostname.' };

  const [claimed] = await sql<{ slug: string }[]>`
    select p.slug from domain d join project p on p.id = d.project_id where d.hostname = ${hostname}
  `;
  if (claimed) return { error: `${hostname} is already pointed at "${claimed.slug}".` };

  const existing = await sql`select 1 from domain where project_id = ${projectId}`;
  await sql`
    insert into domain (project_id, hostname, is_primary)
    values (${projectId}, ${hostname}, ${existing.length === 0})
  `;
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

export async function deleteDomain(form: FormData): Promise<void> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  await sql`delete from domain where id = ${str(form, 'id')}`;
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function makeDomainPrimary(form: FormData): Promise<void> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  await sql`update domain set is_primary = (id = ${str(form, 'id')}) where project_id = ${projectId}`;
  revalidatePath(`/admin/projects/${projectId}`);
}

/* ------------------------------------------------------------ tracking --- */

export async function updateTracking(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  const tokenRef = optional(form, 'capiTokenRef');
  // Guard against pasting the token itself into a field that stores its NAME.
  if (tokenRef && !/^[A-Z][A-Z0-9_]*$/.test(tokenRef)) {
    return { error: 'This field takes an environment variable NAME (e.g. META_CAPI_TOKEN_ALIAS_ONE), not the token.' };
  }
  await sql`
    insert into tracking (project_id, meta_pixel_id, meta_ad_account_id, capi_token_ref, test_event_code_ref)
    values (${projectId}, ${optional(form, 'metaPixelId')}, ${optional(form, 'metaAdAccountId')},
            ${tokenRef}, ${optional(form, 'testEventCodeRef')})
    on conflict (project_id) do update set
      meta_pixel_id = excluded.meta_pixel_id,
      meta_ad_account_id = excluded.meta_ad_account_id,
      capi_token_ref = excluded.capi_token_ref,
      test_event_code_ref = excluded.test_event_code_ref,
      updated_at = now()
  `;
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

/* ------------------------------------------------------------ releases --- */

export async function createRelease(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  const slug = str(form, 'slug').toLowerCase();
  const title = str(form, 'title');
  if (!SLUG.test(slug)) return { error: 'Slug must be lowercase letters, numbers and hyphens.' };
  if (!title) return { error: 'Title is required.' };

  const existing = await sql`select 1 from release where project_id = ${projectId} and slug = ${slug}`;
  if (existing.length > 0) return { error: `This project already has a release at /${slug}.` };

  const [release] = await sql<{ id: string }[]>`
    insert into release (project_id, slug, title) values (${projectId}, ${slug}, ${title})
    returning id
  `;
  redirect(`/admin/releases/${release!.id}`);
}

export async function updateRelease(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(form, 'id');
  const title = str(form, 'title');
  if (!title) return { error: 'Title is required.' };

  const releaseAtRaw = optional(form, 'releaseAt');
  let releaseAt: Date | null = null;
  if (releaseAtRaw) {
    const parsed = new Date(releaseAtRaw);
    if (Number.isNaN(parsed.getTime())) return { error: 'Release date is not a valid date.' };
    releaseAt = parsed;
  }

  await sql`
    update release set
      title = ${title},
      subtitle = ${optional(form, 'subtitle')},
      artwork_url = ${optional(form, 'artworkUrl')},
      isrc = ${optional(form, 'isrc')},
      upc = ${optional(form, 'upc')},
      release_at = ${releaseAt},
      is_published = ${form.get('isPublished') === 'on'}
    where id = ${id}
  `;
  revalidatePath(`/admin/releases/${id}`);
  return {};
}

export async function deleteRelease(form: FormData): Promise<void> {
  await requireAdmin();
  const projectId = str(form, 'projectId');
  await sql`delete from release where id = ${str(form, 'id')}`;
  redirect(`/admin/projects/${projectId}`);
}

/* -------------------------------------------------------- destinations --- */

export async function saveDestination(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const releaseId = str(form, 'releaseId');
  const dsp = str(form, 'dsp').toLowerCase();
  const url = str(form, 'url');
  const region = (optional(form, 'region') ?? '*').toUpperCase() === '*' ? '*' : str(form, 'region').toUpperCase();

  if (!SLUG.test(dsp)) return { error: 'DSP must be lowercase letters, numbers and hyphens (e.g. apple-music).' };
  if (!/^https?:\/\//i.test(url)) return { error: 'Destination URL must start with http:// or https://' };

  const sortOrder = Number(str(form, 'sortOrder') || '0');
  await sql`
    insert into destination (release_id, dsp, url, region, sort_order)
    values (${releaseId}, ${dsp}, ${url}, ${region}, ${Number.isFinite(sortOrder) ? sortOrder : 0})
    on conflict (release_id, dsp, region) do update
      set url = excluded.url, sort_order = excluded.sort_order
  `;
  revalidatePath(`/admin/releases/${releaseId}`);
  return {};
}

export async function deleteDestination(form: FormData): Promise<void> {
  await requireAdmin();
  const releaseId = str(form, 'releaseId');
  await sql`delete from destination where id = ${str(form, 'id')}`;
  revalidatePath(`/admin/releases/${releaseId}`);
}
