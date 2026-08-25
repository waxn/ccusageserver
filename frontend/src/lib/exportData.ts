// Client-side data export. Because usage is end-to-end encrypted, this fetches
// the encrypted blobs, decrypts them locally with the unlocked key, flattens
// them to per-(device, tool, model, date) rows, and downloads a file.

import { api } from "./api";
import { parseCcusageDaily } from "./ccusageParse";
import { aesDecrypt } from "./crypto";

export interface ExportRow {
  device: string;
  source_tool: string;
  model: string;
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost_notional_usd: number;
}

export async function collectRows(key: CryptoKey): Promise<ExportRow[]> {
  const [blobs, devices] = await Promise.all([api.encryptedBlobs(), api.devices()]);
  const names = new Map(devices.map((d) => [d.id, d.display_name]));
  const rows: ExportRow[] = [];
  for (const b of blobs) {
    let payload: unknown;
    try {
      payload = JSON.parse(await aesDecrypt(key, b.nonce, b.ciphertext));
    } catch {
      continue; // skip a blob we can't decrypt
    }
    for (const r of parseCcusageDaily(payload)) {
      rows.push({
        device: names.get(b.device_id) ?? `device ${b.device_id}`,
        source_tool: r.source_tool ?? "claude",
        model: r.model_name,
        date: r.date,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        cache_creation_tokens: r.cache_creation_tokens,
        cache_read_tokens: r.cache_read_tokens,
        total_tokens:
          r.input_tokens + r.output_tokens + r.cache_creation_tokens + r.cache_read_tokens,
        cost_notional_usd: r.cost_notional_usd,
      });
    }
  }
  // Stable, readable ordering.
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.device.localeCompare(b.device) ||
      a.source_tool.localeCompare(b.source_tool) ||
      a.model.localeCompare(b.model),
  );
  return rows;
}

const CSV_COLUMNS: (keyof ExportRow)[] = [
  "date",
  "device",
  "source_tool",
  "model",
  "input_tokens",
  "output_tokens",
  "cache_creation_tokens",
  "cache_read_tokens",
  "total_tokens",
  "cost_notional_usd",
];

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: ExportRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return [header, ...lines].join("\n");
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
