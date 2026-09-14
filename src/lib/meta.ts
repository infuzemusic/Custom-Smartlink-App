import { createHash, randomUUID } from 'node:crypto';
import type { Project } from './types';

const API_VERSION = process.env.META_API_VERSION ?? 'v26.0';

/** Meta requires SHA-256 of the trimmed, lowercased value for PII fields. */
export function hash(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash('sha256').update(normalized).digest('hex');
}

export function newEventId(): string {
  return randomUUID();
}

export type UserData = {
  /** fbp and fbc are sent RAW. Hashing them breaks matching entirely. */
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Hashed before sending. */
  email?: string | null;
  phone?: string | null;
  /** Your own stable visitor id — cheap, and it lifts Event Match Quality noticeably. */
  externalId?: string | null;
};

export type CapiEvent = {
  eventName: string;
  eventId: string;
  eventSourceUrl: string;
  eventTime?: number;
  userData: UserData;
  customData?: Record<string, unknown>;
};

function buildUserData(u: UserData) {
  const out: Record<string, unknown> = {};
  if (u.fbp) out.fbp = u.fbp;                 // raw, never hashed
  if (u.fbc) out.fbc = u.fbc;                 // raw, never hashed
  if (u.ip) out.client_ip_address = u.ip;
  if (u.userAgent) out.client_user_agent = u.userAgent;
  const em = hash(u.email);
  if (em) out.em = [em];
  const ph = hash(u.phone?.replace(/[^0-9]/g, ''));
  if (ph) out.ph = [ph];
  const ext = hash(u.externalId);
  if (ext) out.external_id = [ext];
  return out;
}

/**
 * The exact event object sent to Meta, without the access token.
 *
 * Split out from sending so tooling can print what would go over the wire — the
 * payload can then be checked field by field, or pasted into Meta's Payload Helper,
 * before any of it is aimed at a real dataset.
 */
export function buildEventPayload(event: CapiEvent): Record<string, unknown> {
  return {
    event_name: event.eventName,
    event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: event.eventId,
    event_source_url: event.eventSourceUrl,
    action_source: 'website',
    user_data: buildUserData(event.userData),
    ...(event.customData ? { custom_data: event.customData } : {}),
  };
}

export function capiEndpoint(pixelId: string): string {
  return `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`;
}

/**
 * Send one server event to the project's own dataset.
 *
 * The event_id here MUST match the eventID passed to the browser pixel for the same
 * action, or Meta counts the action twice — which is worse than sending no server
 * events at all.
 */
export async function sendCapiEvent(
  project: Project,
  event: CapiEvent,
  timeoutMs = 2500,
): Promise<'ok' | 'failed' | 'skipped'> {
  const token = project.capiTokenRef ? process.env[project.capiTokenRef] : undefined;
  if (!project.metaPixelId || !token) return 'skipped';

  const testEventCode = project.testEventCodeRef
    ? process.env[project.testEventCodeRef]
    : undefined;

  const body: Record<string, unknown> = {
    data: [buildEventPayload(event)],
    access_token: token,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(capiEndpoint(project.metaPixelId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[capi] %s %s', res.status, (await res.text()).slice(0, 400));
      return 'failed';
    }
    return 'ok';
  } catch (err) {
    console.error('[capi] request failed', err);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
