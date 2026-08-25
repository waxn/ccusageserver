import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type TrendPoint } from "../lib/api";
import { formatCompact, formatNumber } from "../lib/format";

const SERIES = [
  { key: "input_tokens", label: "Input", color: "#a96f42" },
  { key: "output_tokens", label: "Output", color: "#bd8455" },
  { key: "cache_creation_tokens", label: "Cache write", color: "#c99f74" },
  { key: "cache_read_tokens", label: "Cache read", color: "#dcc3a6" },
] as const;

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-muted dark:text-paper/40">
        No usage in this range yet.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.7} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.15} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
            width={48}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              fontSize: 12,
            }}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(value: number, name: string) => {
              const s = SERIES.find((x) => x.key === name);
              return [formatNumber(value), s?.label ?? name];
            }}
          />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId="tokens"
              stroke={s.color}
              fill={`url(#g-${s.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-paper/50">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
