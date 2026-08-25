import { useEffect, useMemo, useState } from "react";
import BreakdownTable from "../components/BreakdownTable";
import StatCard from "../components/StatCard";
import TrendChart from "../components/TrendChart";
import { api, type Summary } from "../lib/api";
import { buildSummary, type DeviceRow } from "../lib/aggregate";
import { parseCcusageDaily } from "../lib/ccusageParse";
import { aesDecrypt } from "../lib/crypto";
import { useCrypto } from "../lib/cryptoContext";
import { firstOfMonthISO, formatNumber, formatUSD, isoDaysAgo } from "../lib/format";

type RangeKey = "month" | "30d" | "90d" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function rangeToStart(range: RangeKey): string | undefined {
  switch (range) {
    case "month":
      return firstOfMonthISO();
    case "30d":
      return isoDaysAgo(29);
    case "90d":
      return isoDaysAgo(89);
    case "all":
      return undefined;
  }
}

export default function Dashboard() {
  const { key } = useCrypto();
  const [range, setRange] = useState<RangeKey>("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Fetch encrypted blobs + device names, decrypt locally, parse, aggregate.
        const [blobs, devices] = await Promise.all([api.encryptedBlobs(), api.devices()]);
        const names = new Map(devices.map((d) => [d.id, d.display_name]));
        const items: DeviceRow[] = [];
        for (const b of blobs) {
          try {
            const payload = JSON.parse(await aesDecrypt(key, b.nonce, b.ciphertext));
            for (const row of parseCcusageDaily(payload))
              items.push({ device_id: b.device_id, row });
          } catch {
            /* skip a blob we can't decrypt/parse */
          }
        }
        if (!cancelled) setSummary(buildSummary(items, names, rangeToStart(range)));
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, key]);

  const totals = summary?.totals;
  const rangeLabel = useMemo(
    () => RANGES.find((r) => r.key === range)?.label ?? "",
    [range],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usage overview</h1>
          <p className="text-sm text-ink-muted dark:text-paper/50">
            Aggregated across all your devices and tools.
          </p>
        </div>
        <div className="flex rounded-lg bg-paper-muted p-1 dark:bg-night-muted">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                range === r.key
                  ? "bg-paper-card text-ink shadow-soft dark:bg-night-card dark:text-paper"
                  : "text-ink-muted hover:text-ink dark:text-paper/50",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Notional cost · ${rangeLabel}`}
              value={formatUSD(totals?.cost_notional_usd ?? 0)}
              accent
              sub="Estimate — not billed. Reflects Pro/Max plan usage, not real spend."
            />
            <StatCard
              label="Total tokens"
              value={formatNumber(totals?.total_tokens ?? 0)}
              sub={`${formatNumber(totals?.input_tokens ?? 0)} in · ${formatNumber(totals?.output_tokens ?? 0)} out`}
            />
            <StatCard
              label="Cache read"
              value={formatNumber(totals?.cache_read_tokens ?? 0)}
              sub="Tokens served from prompt cache"
            />
            <StatCard
              label="Cache write"
              value={formatNumber(totals?.cache_creation_tokens ?? 0)}
              sub="Tokens written to prompt cache"
            />
          </div>

          <div className="card p-5">
            <div className="mb-1 text-sm font-semibold">Daily token volume</div>
            <div className="mb-2 text-xs text-ink-muted dark:text-paper/40">
              Stacked by token type · {rangeLabel}
            </div>
            <TrendChart data={summary?.trend ?? []} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BreakdownTable
              title="By model"
              keyLabel="Model"
              rows={summary?.by_model ?? []}
            />
            <BreakdownTable
              title="By device"
              keyLabel="Device"
              rows={summary?.by_device ?? []}
            />
            <BreakdownTable
              title="By tool"
              keyLabel="Source tool"
              rows={summary?.by_source_tool ?? []}
            />
          </div>

          <p className="text-center text-xs text-ink-muted dark:text-paper/30">
            * Notional cost is an estimate based on public API pricing and does not reflect
            what you were actually billed under a Pro/Max subscription.
          </p>
        </>
      )}
    </div>
  );
}
