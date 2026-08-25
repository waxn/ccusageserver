import { useEffect, useState } from "react";
import { api, type Device } from "../lib/api";
import { formatDate, relativeTime } from "../lib/format";

function HealthBadge({ device }: { device: Device }) {
  if (device.revoked_at) {
    return (
      <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-paper/50">
        Revoked
      </span>
    );
  }
  if (device.stale) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
        Stale
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
      Healthy
    </span>
  );
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setDevices(await api.devices());
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id: number) {
    if (!confirm("Revoke this device's API key? It will stop syncing until re-enrolled.")) return;
    await api.revokeDevice(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="text-sm text-ink-muted dark:text-paper/50">
          Machines syncing usage to this account. A device that stops checking in is flagged so
          silent sync failures don't go unnoticed.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-muted dark:text-paper/40">
            Loading…
          </div>
        ) : devices.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-ink-muted dark:text-paper/50">
              No devices enrolled yet.
            </p>
            <p className="mt-1 text-sm text-ink-muted dark:text-paper/40">
              Head to <span className="font-medium">Settings</span> to create an enrollment token
              and run the install one-liner on a machine.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
                <th className="px-5 py-3 font-medium">Device</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Last synced</th>
                <th className="hidden px-5 py-3 font-medium lg:table-cell">Enrolled</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{d.hostname}</div>
                    <div className="text-xs text-ink-muted dark:text-paper/40">
                      {d.os || "unknown OS"}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <HealthBadge device={d} />
                  </td>
                  <td className="hidden px-5 py-3.5 md:table-cell">
                    <span className={d.stale && !d.revoked_at ? "text-red-600 dark:text-red-400" : ""}>
                      {relativeTime(d.last_seen_at)}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 text-ink-muted dark:text-paper/40 lg:table-cell">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!d.revoked_at && (
                      <button
                        onClick={() => revoke(d.id)}
                        className="text-sm font-medium text-clay-600 hover:text-clay-700"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
