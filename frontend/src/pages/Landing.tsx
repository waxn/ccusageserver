import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme";

/* ---------------------------------------------------------------------------
 * Ledger — landing page.
 * Aesthetic: editorial / archival accounting ledger. Warm paper with ruled
 * lines and a coral margin rule, a characterful serif (Fraunces) for display,
 * monospace figures (Spline Sans Mono) for the "token accounting" numbers.
 * ------------------------------------------------------------------------- */

function Mark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-clay-500 text-white shadow-soft ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[58%] w-[58%]">
        <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-clay-600 dark:text-clay-300">
      {children}
    </div>
  );
}

/* The memorable centerpiece: a bookkeeping ledger sheet with tabular figures. */
const LEDGER_ROWS = [
  { date: "Aug 22", tool: "claude", model: "sonnet-5", tokens: 62_359_229, cost: 19.0, w: 92 },
  { date: "Aug 22", tool: "opencode", model: "deepseek-v4", tokens: 25_081_002, cost: 5.53, w: 41 },
  { date: "Aug 21", tool: "claude", model: "opus-5", tokens: 14_209_450, cost: 12.42, w: 24 },
  { date: "Aug 20", tool: "codex", model: "gpt-5", tokens: 3_204_118, cost: 2.18, w: 9 },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function LedgerSheet() {
  const total = LEDGER_ROWS.reduce((a, r) => a + r.tokens, 0);
  const totalCost = LEDGER_ROWS.reduce((a, r) => a + r.cost, 0);
  return (
    <div className="animate-fade-up [animation-delay:360ms] relative rounded-xl2 border border-black/10 bg-paper-card shadow-[0_2px_4px_rgba(43,40,34,0.05),0_24px_60px_-20px_rgba(43,40,34,0.28)] dark:border-white/10 dark:bg-night-card">
      <div className="flex items-baseline justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div className="font-display text-lg font-semibold tracking-tight">Ledger — August</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted dark:text-paper/40">
          notional · not billed
        </div>
      </div>
      <table className="w-full font-mono text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-ink-muted dark:text-paper/40">
            <th className="px-6 py-2.5 font-medium">Date</th>
            <th className="py-2.5 font-medium">Tool</th>
            <th className="hidden py-2.5 font-medium sm:table-cell">Model</th>
            <th className="py-2.5 text-right font-medium">Tokens</th>
            <th className="px-6 py-2.5 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {LEDGER_ROWS.map((r, i) => (
            <tr key={i} className="border-t border-black/5 dark:border-white/5">
              <td className="px-6 py-3 text-ink-muted dark:text-paper/50">{r.date}</td>
              <td className="py-3">
                <span
                  className={
                    r.tool === "claude"
                      ? "text-clay-600 dark:text-clay-300"
                      : "text-ink dark:text-paper/80"
                  }
                >
                  {r.tool}
                </span>
              </td>
              <td className="hidden py-3 text-ink-muted dark:text-paper/50 sm:table-cell">{r.model}</td>
              <td className="py-3 text-right tnum">
                <span className="relative inline-block">
                  {fmt(r.tokens)}
                  <span
                    className="absolute -bottom-1 right-0 h-[3px] rounded-full bg-clay-400/70"
                    style={{ width: `${r.w}%`, minWidth: 8 }}
                  />
                </span>
              </td>
              <td className="px-6 py-3 text-right tnum text-ink-muted dark:text-paper/50">
                ${r.cost.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink/70 dark:border-paper/50">
            <td className="px-6 pb-4 pt-3 font-sans text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40" colSpan={3}>
              Total · retained forever
            </td>
            <td className="pb-4 pt-3 text-right">
              <span className="tnum double-rule pb-0.5 font-semibold text-ink dark:text-paper">
                {fmt(total)}
              </span>
            </td>
            <td className="px-6 pb-4 pt-3 text-right">
              <span className="tnum double-rule pb-0.5 font-semibold text-clay-600 dark:text-clay-300">
                ${totalCost.toFixed(2)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InstallPill() {
  return (
    <div className="animate-fade-up [animation-delay:300ms] inline-flex max-w-full items-center gap-3 overflow-hidden rounded-full border border-black/10 bg-paper-card/70 py-1.5 pl-4 pr-1.5 dark:border-white/10 dark:bg-night-card/60">
      <code className="truncate font-mono text-[12.5px] text-ink-muted dark:text-paper/60">
        <span className="text-clay-500">$</span> curl -fsSL ledger.host/install.sh | sh
      </code>
      <span className="hidden shrink-0 rounded-full bg-clay-100 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-clay-700 dark:bg-clay-500/20 dark:text-clay-200 sm:inline">
        one machine
      </span>
    </div>
  );
}

const FEATURES = [
  {
    n: "01",
    title: "A permanent copy, not a cache",
    body: "Every sync tars your raw source directories and archives them server-side, separate from the parsed numbers. If a parser ever drifts, the source of truth is still on disk to reprocess.",
  },
  {
    n: "02",
    title: "Every machine, one account",
    body: "Merge the ThinkPad, the desktop, whatever comes next. A device that stops checking in is flagged in red — silent sync failure is exactly what caused the data loss in the first place.",
  },
  {
    n: "03",
    title: "Split by tool, model, and day",
    body: "Claude, Codex, and OpenCode broken out per model and per day, upserted idempotently. Re-send an overlapping range on every sync and nothing ever double-counts.",
  },
  {
    n: "04",
    title: "A dashboard worth opening",
    body: "Warm, legible, light or dark. A monthly figure, a token trend, a breakdown table. Reads like a well-kept book — not a Grafana panel bolted onto a homelab.",
  },
];

const STEPS = [
  { k: "Deploy", v: "docker compose up -d", note: "One container. SQLite. No Postgres, no Redis." },
  { k: "Enroll", v: "curl …/install.sh | sh", note: "A systemd user timer syncs every ~45 minutes." },
  { k: "Track", v: "open the dashboard", note: "Backfills all local history on first run." },
];

const FIGURES = [
  { v: "∞", k: "retention" },
  { v: "1", k: "container" },
  { v: "0", k: "external services" },
  { v: "3", k: "tools tracked" },
];

export default function Landing() {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="min-h-screen bg-paper font-grotesk text-ink dark:bg-night dark:text-paper">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-paper/80 backdrop-blur-md dark:border-white/5 dark:bg-night/80">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-2.5">
            <Mark className="h-8 w-8" />
            <span className="font-display text-xl font-semibold tracking-tight">Ledger</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-paper-muted dark:text-paper/60 dark:hover:bg-night-muted"
            >
              {theme === "dark" ? "☀︎" : "☾"}
            </button>
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:text-ink dark:text-paper/70 dark:hover:text-paper"
            >
              Sign in
            </Link>
            <Link
              to="/login?new=1"
              className="rounded-lg bg-clay-500 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-clay-600"
            >
              Open an account
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="grain ledger-paper relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="relative">
            <div className="animate-fade-up">
              <Eyebrow>Self-hosted · Permanent retention</Eyebrow>
            </div>
            <h1 className="animate-fade-up [animation-delay:80ms] mt-5 font-display text-[2.7rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl">
              A <span className="italic text-clay-600 dark:text-clay-300">permanent ledger</span> for
              everything your agents spend.
            </h1>
            <p className="animate-fade-up [animation-delay:160ms] mt-6 max-w-xl text-lg leading-relaxed text-ink-muted dark:text-paper/60">
              Claude Code deletes local session logs after 30 days, and Pro plans never expose the
              history. Ledger records token usage across every machine, splits it by tool, and keeps
              it — for good.
            </p>
            <div className="animate-fade-up [animation-delay:240ms] mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                to="/login?new=1"
                className="group inline-flex items-center gap-2 rounded-xl bg-clay-500 px-6 py-3 text-base font-medium text-white shadow-soft transition hover:bg-clay-600"
              >
                Open an account
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                to="/login"
                className="text-base font-medium text-ink underline decoration-clay-400/60 decoration-2 underline-offset-[6px] transition hover:decoration-clay-500 dark:text-paper"
              >
                I already have one
              </Link>
            </div>
            <div className="mt-8">
              <InstallPill />
            </div>
          </div>

          <LedgerSheet />
        </div>
      </section>

      {/* The problem — editorial band */}
      <section className="border-y border-black/5 bg-paper-muted/50 dark:border-white/5 dark:bg-night-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 md:grid md:grid-cols-12 md:gap-10 md:px-8 md:py-24">
          <div className="md:col-span-5">
            <Eyebrow>The problem</Eyebrow>
            <p className="mt-4 font-display text-3xl font-medium leading-[1.15] tracking-tight sm:text-[2.6rem]">
              After{" "}
              <span className="relative whitespace-nowrap">
                <span className="line-through decoration-clay-500/70 decoration-2">30 days</span>
              </span>
              , it's simply gone.
            </p>
          </div>
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-muted dark:text-paper/60 md:col-span-6 md:col-start-7 md:mt-2">
            <p>
              Claude Code keeps rich session logs — right up until it prunes them. Anthropic doesn't
              surface historical token data for Pro or Max subscriptions, so once the local files
              are deleted, there is no way to get the numbers back.
            </p>
            <p className="text-ink dark:text-paper">
              Ledger is the insurance policy: it captures the parsed usage <em>and</em> the raw
              source directories, from every machine, and never throws either away.
            </p>
          </div>
        </div>
      </section>

      {/* Features as ledger line-items */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>What you get</Eyebrow>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Bookkeeping for your tokens, kept honestly.
          </h2>
        </div>
        <div className="mt-12 divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
          {FEATURES.map((f) => (
            <div
              key={f.n}
              className="group grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 py-7 transition-colors sm:grid-cols-[5rem_1fr_1.1fr] sm:gap-x-8"
            >
              <div className="font-mono text-sm tabular-nums text-clay-500">{f.n}</div>
              <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {f.title}
              </h3>
              <p className="col-start-2 max-w-xl text-[15px] leading-relaxed text-ink-muted dark:text-paper/60 sm:col-start-3 sm:mt-0">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-black/5 bg-paper-muted/50 dark:border-white/5 dark:bg-night-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Eyebrow>Three entries</Eyebrow>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Running in about five minutes.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.k}
                className="rounded-xl2 border border-black/10 bg-paper-card p-6 dark:border-white/10 dark:bg-night-card"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs tabular-nums text-ink-muted dark:text-paper/40">
                    0{i + 1}
                  </span>
                  <span className="h-px flex-1 origin-left animate-draw-rule bg-clay-400/50" />
                </div>
                <div className="mt-4 font-display text-2xl font-semibold tracking-tight">{s.k}</div>
                <code className="mt-3 block rounded-lg bg-ink/[0.04] px-3 py-2 font-mono text-[12.5px] text-clay-600 dark:bg-white/[0.04] dark:text-clay-300">
                  {s.v}
                </code>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted dark:text-paper/50">
                  {s.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Figures strip */}
      <section className="mx-auto max-w-6xl px-5 py-14 md:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FIGURES.map((f) => (
            <div key={f.k}>
              <div className="font-display text-4xl font-semibold tracking-tight text-clay-600 dark:text-clay-300 sm:text-5xl">
                {f.v}
              </div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted dark:text-paper/40">
                {f.k}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-6 md:px-8">
        <div className="grain relative overflow-hidden rounded-[1.75rem] bg-ink px-8 py-14 text-paper shadow-soft dark:bg-night-card md:px-16 md:py-20">
          <div className="relative max-w-2xl">
            <Eyebrow>Start the record</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight text-paper sm:text-5xl">
              Open your ledger before the next 30 days are gone.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-paper/70">
              Free, self-hosted, and one container. Your data stays on your box.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                to="/login?new=1"
                className="group inline-flex items-center gap-2 rounded-xl bg-clay-500 px-6 py-3 text-base font-medium text-white transition hover:bg-clay-400"
              >
                Create your account
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                to="/login"
                className="text-base font-medium text-paper/80 underline decoration-clay-400/60 decoration-2 underline-offset-[6px] transition hover:text-paper"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 dark:border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 md:flex-row md:items-center md:px-8">
          <div className="flex items-center gap-2.5">
            <Mark className="h-7 w-7" />
            <div>
              <div className="font-display text-base font-semibold tracking-tight">Ledger</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted dark:text-paper/40">
                self-hosted · single container
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-ink-muted dark:text-paper/40">
            <Link to="/login" className="transition hover:text-clay-600 dark:hover:text-clay-300">
              Sign in
            </Link>
            <span className="text-ink-muted/50">notional cost · not billed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
