// Build the dashboard Summary from decrypted usage rows, entirely client-side.
// Mirrors what the old server-side /api/usage/summary produced, so the existing
// dashboard components render unchanged.

import { type Bucket, type Summary, type TrendPoint } from "./api";
import { type UsageRow } from "./ccusageParse";

export interface DeviceRow {
  device_id: number;
  row: UsageRow;
}

const EMPTY = () => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_tokens: 0,
  cache_read_tokens: 0,
  total_tokens: 0,
  cost_notional_usd: 0,
});

function add(acc: ReturnType<typeof EMPTY>, r: UsageRow) {
  acc.input_tokens += r.input_tokens;
  acc.output_tokens += r.output_tokens;
  acc.cache_creation_tokens += r.cache_creation_tokens;
  acc.cache_read_tokens += r.cache_read_tokens;
  acc.total_tokens +=
    r.input_tokens + r.output_tokens + r.cache_creation_tokens + r.cache_read_tokens;
  acc.cost_notional_usd += r.cost_notional_usd;
}

function bucketize(map: Map<string, ReturnType<typeof EMPTY>>): Bucket[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.total_tokens - a.total_tokens);
}

export function buildSummary(
  items: DeviceRow[],
  deviceNames: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Summary {
  const totals = EMPTY();
  const byDate = new Map<string, ReturnType<typeof EMPTY>>();
  const byModel = new Map<string, ReturnType<typeof EMPTY>>();
  const byDevice = new Map<string, ReturnType<typeof EMPTY>>();
  const byTool = new Map<string, ReturnType<typeof EMPTY>>();

  const bump = (m: Map<string, ReturnType<typeof EMPTY>>, key: string, r: UsageRow) => {
    let v = m.get(key);
    if (!v) m.set(key, (v = EMPTY()));
    add(v, r);
  };

  for (const { device_id, row } of items) {
    if (startDate && row.date < startDate) continue;
    if (endDate && row.date > endDate) continue;
    add(totals, row);
    bump(byDate, row.date, row);
    bump(byModel, row.model_name, row);
    bump(byDevice, deviceNames.get(device_id) ?? `device ${device_id}`, row);
    bump(byTool, row.source_tool ?? "claude", row);
  }

  const trend: TrendPoint[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, ...v }));

  return {
    start_date: startDate ?? null,
    end_date: endDate ?? null,
    totals,
    trend,
    by_model: bucketize(byModel),
    by_device: bucketize(byDevice),
    by_source_tool: bucketize(byTool),
  };
}
