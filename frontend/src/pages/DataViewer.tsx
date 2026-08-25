import { useEffect, useState } from "react";
import type { CryptoParams } from "../lib/api";
import { getToken } from "../lib/api";
import { aesDecrypt } from "../lib/crypto";
import { useAuth } from "../lib/auth";
import { useCrypto } from "../lib/cryptoContext";

interface RawData {
  metadata: {
    account: { email: string; created_at: string; crypto_configured: boolean };
    exported_at: string;
  };
  devices: Array<{
    id: number; hostname: string; label: string | null; display_name: string; os: string | null;
    last_seen_at: string | null; revoked_at: string | null; created_at: string;
    enrollment_token_used?: string;
  }>;
  usage_reports: Array<{
    device_id: number; date: string; source_tool: string; model_name: string;
    input_tokens: number; output_tokens: number; cache_creation_tokens: number; cache_read_tokens: number;
    cost_notional_usd: number; created_at: string; updated_at: string;
  }>;
  encrypted_blobs: Array<{ device_id: number; nonce: string; ciphertext: string; updated_at: string }>;
  raw_archives: Array<{
    id: number; device_id: number; source_tool: string; file_path: string; sha256?: string; size_bytes: number; uploaded_at: string;
  }>;
}

export default function DataViewer() {
  const { user, loading: authLoading } = useAuth();
  const { key } = useCrypto();
  const [data, setData] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(user?.email ?? "");

  useEffect(() => {
    if (!user || authLoading) return;
    const token = getToken();
    if (!token) {
      setError("No authentication token found. Please log in.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const endpoint = "/api/export/data";
        const headers = new Headers();
        headers.set("Authorization", `Bearer ${token}`);
        headers.set("Accept", "application/json");

        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const rawData: RawData = await response.json();
        setData(rawData);
      } catch (e: any) {
        setError(e.message || "Failed to load raw data");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const decryptBlob = async (nonce: string, ciphertext: string) => {
    if (!key) return null;
    try {
      return await aesDecrypt(key, nonce, ciphertext);
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-ink-muted dark:text-paper/50">Loading raw data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const decryptedBlobs: Record<number, string> = {};
  const decryptAllBlobs = async () => {
    for (const blob of data.encrypted_blobs) {
      const decrypted = await decryptBlob(blob.nonce, blob.ciphertext);
      if (decrypted !== null) {
        decryptedBlobs[blob.device_id] = decrypted;
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Raw Data Viewer</h1>
          <p className="text-sm text-ink-muted dark:text-paper/50">
            All data belonging to {email}. Nothing from other users is ever returned.
          </p>
        </div>
        <button
          onClick={decryptAllBlobs}
          className="btn-primary"
        >
          Decrypt all blobs
        </button>
      </div>

      <div className="space-y-4">
        {/* Account Info */}
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Account</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted dark:text-paper/50">Email</dt>
              <dd className="font-medium">{data.metadata.account.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted dark:text-paper/50">Created at</dt>
              <dd className="font-mono text-sm">{new Date(data.metadata.account.created_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted dark:text-paper/50">E2EE Configured</dt>
              <dd className="font-medium">{data.metadata.account.crypto_configured ? "Yes" : "No"}</dd>
            </div>
            {data.metadata.account.crypto_configured && (
              <>
                <div>
                  <dt className="text-xs text-ink-muted dark:text-paper/50">Exported at</dt>
                  <dd className="font-mono text-sm">{new Date(data.metadata.exported_at).toLocaleString()}</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {/* Devices */}
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Devices</h2>
          {data.devices.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-paper/50">No devices registered.</p>
          ) : (
            <div className="space-y-3">
              {data.devices.map((device) => (
                <div key={device.id} className="rounded-lg border border-black/5 bg-paper-muted px-4 py-3 dark:border-white/5 dark:bg-night-muted">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:flex-nowrap">
                    <span className="font-semibold">{device.display_name}</span>
                    {device.hostname !== device.display_name && (
                      <span className="text-ink-muted dark:text-paper/50">(hostname: {device.hostname})</span>
                    )}
                    {device.os && <span>{device.os}</span>}
                    {!device.label && !device.enrollment_token_used && (
                      <span className="text-ink-muted dark:text-paper/50">— no label set</span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-ink-muted dark:text-paper/40">
                    <div>
                      <span>Last seen:</span> {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "—"}
                    </div>
                    <div>
                      <span>Created:</span> {new Date(device.created_at).toLocaleDateString()}
                    </div>
                    {device.revoked_at && (
                      <div>
                        <span>Revoked:</span> {new Date(device.revoked_at).toLocaleString()}
                      </div>
                    )}
                    {device.enrollment_token_used && (
                      <div className="font-mono">
                        <span>Enrollment token (SHA-256 of):</span>{" "}
                        <code className="text-[10px]">{device.enrollment_token_used}</code>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Usage Reports */}
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Usage Reports</h2>
          {data.usage_reports.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-paper/50">No usage reports recorded yet.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-black/5 bg-paper-muted dark:border-white/5 dark:bg-night-muted">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-paper-muted dark:bg-night-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Tool</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium text-right">Input</th>
                    <th className="px-3 py-2 font-medium text-right">Output</th>
                    <th className="px-3 py-2 font-medium text-right">Cache Cr</th>
                    <th className="px-3 py-2 font-medium text-right">Cache Rd</th>
                    <th className="px-3 py-2 font-medium text-right">Cost USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage_reports.map((row) => (
                    <tr key={`${row.device_id}-${row.date}-${row.source_tool}`}>
                      <td className="px-3 py-2 font-medium">{data.devices.find(d => d.id === row.device_id)?.display_name || `dev-${row.device_id}`}</td>
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2 font-mono">{row.source_tool}</td>
                      <td className="px-3 py-2">{row.model_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.input_tokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.output_tokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.cache_creation_tokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.cache_read_tokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.cost_notional_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Encrypted Blobs */}
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Encrypted Usage Blobs</h2>
          {data.encrypted_blobs.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-paper/50">No encrypted blobs recorded.</p>
          ) : (
            <div className="space-y-3">
              {data.encrypted_blobs.map((blob) => {
                const deviceName = data.devices.find(d => d.id === blob.device_id)?.display_name || `dev-${blob.device_id}`;
                return (
                  <div key={blob.device_id} className="rounded-lg border border-black/5 bg-paper-muted p-4 dark:border-white/5 dark:bg-night-muted">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold">{deviceName}</span>
                      <span className="text-xs text-ink-muted dark:text-paper/50">updated {new Date(blob.updated_at).toLocaleString()}</span>
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted hover:text-ink dark:text-paper/50 group-hover:text-ink">
                        [Click to inspect ciphertext]
                      </summary>
                      <pre className="mt-2 overflow-auto rounded bg-black/5 p-3 text-[10px] font-mono text-ink/70 dark:bg-white/5 dark:text-paper/60">
                        {blob.nonce} | {blob.ciphertext.slice(0, 100)}…{" "}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Raw Archives */}
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Raw Source Archives</h2>
          {data.raw_archives.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-paper/50">No raw archives uploaded.</p>
          ) : (
            <div className="space-y-3">
              {data.raw_archives.map((archive) => {
                const deviceName = data.devices.find(d => d.id === archive.device_id)?.display_name || `dev-${archive.device_id}`;
                return (
                  <div key={archive.id} className="rounded-lg border border-black/5 bg-paper-muted p-4 dark:border-white/5 dark:bg-night-muted">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold">{deviceName}</span>
                      <span className="text-xs text-ink-muted dark:text-paper/50">{archive.source_tool}</span>
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted hover:text-ink dark:text-paper/50 group-hover:text-ink">
                        [Click to inspect archive metadata]
                      </summary>
                      <pre className="mt-2 overflow-auto rounded bg-black/5 p-3 text-[10px] font-mono text-ink/70 dark:bg-white/5 dark:text-paper/60">
                        {`{"id":${archive.id},"device_id":${archive.device_id},"tool":"${archive.source_tool}",` +
                          `"file_path":"${archive.file_path}"${archive.sha256 ? `, "sha256":"${archive.sha256}"` : ""}${archive.size_bytes ? `, "size_bytes":${archive.size_bytes}` : ""}${archive.uploaded_at ? `, "uploaded_at":"${archive.uploaded_at}"` : ""}
                        }`}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Decrypted Blobs View */}
        {Object.keys(decryptedBlobs).length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 text-base font-semibold">Decrypted Usage Payloads</h2>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-black/5 bg-paper-muted dark:border-white/5 dark:bg-night-muted">
              {Object.entries(decryptedBlobs).map(([deviceId, payload]) => (
                <details key={deviceId} className="group">
                  <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted hover:text-ink dark:text-paper/50 group-hover:text-ink">
                    [Click to view decrypted JSON for device {deviceId}]
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-black/5 p-3 text-[10px] font-mono text-ink/70 dark:bg-white/5 dark:text-paper/60">
                    {payload}
                  </pre>
                </details>
              ))}
            </div>
          </section>
        )}

      </div>

      <footer className="text-xs text-ink-muted dark:text-paper/40">
        All data shown is scoped to this account only. The server never receives or stores plaintext passwords;
        decryption happens in the browser using your password and the KDF params you set up in Settings.
      </footer>
    </div>
  );
}