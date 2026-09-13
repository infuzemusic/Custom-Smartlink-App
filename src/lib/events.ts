import { sql } from './db';
import { isBot } from './bots';
import { sendCapiEvent } from './meta';
import type { Project } from './types';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/** Postgres `inet` rejects junk, and a malformed header shouldn't cost us the event. */
function toInet(ip: string | null): string | null {
  if (!ip) return null;
  const value = ip.trim();
  if (IPV4.test(value) || (value.includes(':') && IPV6.test(value))) return value;
  return null;
}

export type RecordEventInput = {
  project: Project;
  releaseId?: string | null;
  eventName: 'PageView' | 'DspClick';
  eventId: string;
  eventSourceUrl: string;
  dsp?: string | null;
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  userAgent: string | null;
  referrer?: string | null;
  customData?: Record<string, unknown>;
};

/**
 * Write the event to our own log, then mirror it to Meta with the same event_id the
 * browser pixel used.
 *
 * Bot traffic is logged but never forwarded: it inflates counts, drags Event Match
 * Quality down, and teaches the algorithm to chase visitors that will never convert.
 * Keeping the rows means the filtered and unfiltered numbers can still be compared.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  const bot = isBot(input.userAgent);

  let capiStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  if (!bot) {
    capiStatus = await sendCapiEvent(input.project, {
      eventName: input.eventName,
      eventId: input.eventId,
      eventSourceUrl: input.eventSourceUrl,
      userData: {
        fbp: input.fbp,
        fbc: input.fbc,
        ip: input.ip,
        userAgent: input.userAgent,
        // Stable per-browser id we already have; cheap Event Match Quality uplift.
        externalId: input.fbp,
      },
      customData: input.customData,
    });
  }

  try {
    await sql`
      insert into event
        (project_id, release_id, event_name, event_id, dsp, fbp, fbc, ip, user_agent, referrer, is_bot, capi_status)
      values
        (${input.project.id}, ${input.releaseId ?? null}, ${input.eventName}, ${input.eventId},
         ${input.dsp ?? null}, ${input.fbp}, ${input.fbc}, ${toInet(input.ip)},
         ${input.userAgent}, ${input.referrer ?? null}, ${bot}, ${capiStatus})
    `;
  } catch (err) {
    // Never let logging break the visitor's journey to the music.
    console.error('[event] insert failed', err);
  }
}
