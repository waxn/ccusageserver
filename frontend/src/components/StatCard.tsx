import { type ReactNode } from "react";

export default function StatCard({
  label,
  value,
  sub,
  accent = false,
  children,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={["card p-5", accent ? "ring-1 ring-clay-300/50" : ""].join(" ")}>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted dark:text-paper/40">
        {label}
      </div>
      <div
        className={[
          "mt-2 font-semibold tabular-nums",
          accent ? "text-3xl text-clay-600 dark:text-clay-300 md:text-4xl" : "text-2xl",
        ].join(" ")}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-muted dark:text-paper/40">{sub}</div>}
      {children}
    </div>
  );
}
