import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Lightweight password strength read-out for the sign-up second pass. */
function scorePassword(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"][score] ?? "Weak";
  return { score, label };
}

export default function Login() {
  const { login, register } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    params.get("new") !== null ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);
  const confirmTouched = confirm.length > 0;
  const passwordsMatch = password === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!passwordsMatch) {
        setError("Passwords don't match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: "login" | "register") {
    setMode(m);
    setError(null);
    setConfirm("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 dark:bg-night">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-500 text-white shadow-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
              <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Ledger</h1>
          <p className="mt-1 text-sm text-ink-muted dark:text-paper/50">
            {mode === "register"
              ? "Open an account to start your usage ledger"
              : "Sign in to your usage ledger"}
          </p>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex rounded-lg bg-paper-muted p-1 dark:bg-night-muted">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={[
                  "flex-1 rounded-md py-1.5 text-sm font-medium transition",
                  mode === m
                    ? "bg-paper-card text-ink shadow-soft dark:bg-night-card dark:text-paper"
                    : "text-ink-muted dark:text-paper/50",
                ].join(" ")}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" && password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-1.5 flex-1 gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={[
                          "h-full flex-1 rounded-full transition-colors",
                          i < strength.score
                            ? strength.score <= 2
                              ? "bg-red-400"
                              : strength.score === 3
                                ? "bg-amber-400"
                                : "bg-green-500"
                            : "bg-black/10 dark:bg-white/10",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                  <span className="w-16 text-right font-mono text-[10px] uppercase tracking-wider text-ink-muted dark:text-paper/40">
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Second pass — confirm password on sign-up. */}
            {mode === "register" && (
              <div>
                <label className="label">Confirm password</label>
                <input
                  type="password"
                  className={[
                    "input",
                    confirmTouched && !passwordsMatch
                      ? "border-red-400 focus:border-red-400 focus:ring-red-400/30"
                      : "",
                  ].join(" ")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                {confirmTouched && (
                  <p
                    className={[
                      "mt-1 text-xs",
                      passwordsMatch
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400",
                    ].join(" ")}
                  >
                    {passwordsMatch ? "✓ Passwords match" : "Passwords don't match yet"}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || (mode === "register" && (!passwordsMatch || password.length < 8))}
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-ink-muted underline decoration-clay-400/50 decoration-2 underline-offset-4 transition hover:text-ink dark:text-paper/50 dark:hover:text-paper"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
