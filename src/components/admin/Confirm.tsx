'use client';

/** Destructive submits ask first. Cancelling leaves the form unsubmitted. */
export function ConfirmButton({ message, label }: { message: string; label: string }) {
  return (
    <button
      type="submit"
      className="link"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
