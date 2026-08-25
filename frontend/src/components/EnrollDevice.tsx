import { useEffect, useState } from "react";
import { api, type EnrollmentCreated } from "../lib/api";
import { formatDate } from "../lib/format";

export function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-night px-3 py-2.5 text-xs text-paper/90 dark:bg-black/40">
        {text}
      </code>
      <button
        className="btn-ghost shrink-0 border border-black/10 dark:border-white/10"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The one-time secret block shown right after a token is generated. */
export function EnrollResult({ created }: { created: EnrollmentCreated }) {
  return (
    <div className="space-y-3 rounded-xl2 border border-clay-300/40 bg-clay-50/70 p-4 dark:border-clay-300/10 dark:bg-night-muted/60">
      <div>
        <div className="label">Install command (run on the new machine)</div>
        <CopyBox text={created.install_command} />
      </div>
      <div>
        <div className="label">Enrollment token</div>
        <CopyBox text={created.token} />
      </div>
      <p className="text-xs text-ink-muted dark:text-paper/40">
        Save this now — it won't be shown again.
        {created.expires_at ? ` Expires ${formatDate(created.expires_at)}.` : " Does not expire."}
      </p>
    </div>
  );
}

/**
 * Inline form to mint a new enrollment token. `onCreated` fires after a token
 * is generated so the parent can refresh any device/token lists.
 */
export function EnrollForm({ onCreated }: { onCreated?: (c: EnrollmentCreated) => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<EnrollmentCreated | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const c = await api.createEnrollment(label.trim() || undefined);
      setCreated(c);
      setLabel("");
      onCreated?.(c);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">Label (optional)</label>
          <input
            className="input"
            placeholder="e.g. thinkpad, desktop"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && generate()}
          />
        </div>
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : created ? "Generate another" : "Generate token"}
        </button>
      </div>
      {created && <EnrollResult created={created} />}
    </div>
  );
}

/** A dual-tone modal wrapper around the enroll flow, for the Devices page. */
export function AddDeviceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (c: EnrollmentCreated) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl2 bg-paper-card shadow-soft dark:bg-night-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dual tone: warm coral header band over a paper body. */}
        <div className="flex items-start justify-between gap-4 bg-clay-500 px-6 py-5 text-white">
          <div>
            <h2 className="text-lg font-semibold">Add a device</h2>
            <p className="mt-0.5 text-sm text-white/80">
              Generate a token, then run the one-liner on the new machine.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <EnrollForm onCreated={onCreated} />
          <p className="mt-4 text-xs text-ink-muted dark:text-paper/40">
            The token is single-use and exchanged for a permanent device key on first check-in.
            Manage existing tokens under <span className="font-medium">Settings</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
