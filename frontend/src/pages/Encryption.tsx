import { useState, type FormEvent, type ReactNode } from "react";
import { useCrypto } from "../lib/cryptoContext";

function LockGraphic() {
  return (
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-500 text-white shadow-soft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 018 0v3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-night">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <LockGraphic />
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted dark:text-paper/50">{subtitle}</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}

function SetupForm() {
  const { setup } = useCrypto();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const match = pw === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (!match) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await setup(pw);
    } catch (err: any) {
      setError(err.message || "Could not set up encryption.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Set an encryption password"
      subtitle="Your usage is encrypted on your machines before upload. The server can't read it — only this password can."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Encryption password</label>
          <input
            type="password"
            className="input"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input
            type="password"
            className={`input ${confirm && !match ? "border-red-400" : ""}`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠︎ This is separate from your login password and is never sent to the server. If you lose
          it, your usage data can't be recovered. Use the same password on every machine's agent.
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy || !match || pw.length < 8}>
          {busy ? "Setting up…" : "Enable encryption"}
        </button>
      </form>
    </Shell>
  );
}

function UnlockForm() {
  const { unlock } = useCrypto();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(pw);
    } catch (err: any) {
      setError(err.message || "Incorrect password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Unlock your usage" subtitle="Enter your encryption password to decrypt and view your dashboard.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Encryption password</label>
          <input
            type="password"
            className="input"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </Shell>
  );
}

/** Gates the app: sets up or unlocks encryption before rendering children. */
export function EncryptionGate({ children }: { children: ReactNode }) {
  const { loading, configured, unlocked } = useCrypto();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted dark:text-paper/50">
        Loading…
      </div>
    );
  if (!configured) return <SetupForm />;
  if (!unlocked) return <UnlockForm />;
  return <>{children}</>;
}
