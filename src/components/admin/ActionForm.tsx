'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/app/admin/actions';

/**
 * Wraps a server action so validation errors render next to the form rather than
 * throwing.
 *
 * React 19 resets an uncontrolled form once its action completes. That is right after a
 * successful save, but after a validation error it would throw away everything the user
 * typed — and, worse, resubmitting would then send empty fields and fail with a second,
 * unrelated error. So we keep the submitted FormData and write it back when the action
 * comes back with an error.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      submitted.current = form;
      return action(prev, form);
    },
    {},
  );

  useEffect(() => {
    const form = formRef.current;
    const data = submitted.current;
    if (!state?.error || !form || !data) return;

    for (const [name, value] of data.entries()) {
      if (typeof value !== 'string') continue;
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) {
        if (field.type === 'checkbox') field.checked = value === 'on';
        else if (field.type !== 'hidden') field.value = value;
      } else if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.value = value;
      }
    }
    // Checkboxes that were unchecked do not appear in FormData at all.
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox' && !data.has(el.name)) {
        el.checked = false;
      }
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state?.error && <p className="err">{state.error}</p>}
      <p style={{ margin: '14px 0 0' }}>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </p>
    </form>
  );
}
