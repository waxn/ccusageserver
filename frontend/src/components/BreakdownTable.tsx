import { type Bucket } from "../lib/api";
import { formatNumber, formatUSD } from "../lib/format";

export default function BreakdownTable({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: Bucket[];
  keyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total_tokens));
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-black/5 px-5 py-3.5 text-sm font-semibold dark:border-white/5">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-ink-muted dark:text-paper/40">
          No data yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
              <th className="px-5 py-2 font-medium">{keyLabel}</th>
              <th className="px-5 py-2 text-right font-medium">Tokens</th>
              <th className="hidden px-5 py-2 text-right font-medium sm:table-cell">Cost*</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-black/5 dark:border-white/5">
                <td className="max-w-[220px] px-5 py-2.5">
                  <div className="truncate font-medium" title={r.key}>
                    {r.key}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-muted dark:bg-night-muted">
                    <div
                      className="h-full rounded-full bg-clay-400"
                      style={{ width: `${(r.total_tokens / max) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {formatNumber(r.total_tokens)}
                </td>
                <td className="hidden px-5 py-2.5 text-right tabular-nums text-ink-muted dark:text-paper/40 sm:table-cell">
                  {formatUSD(r.cost_notional_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
