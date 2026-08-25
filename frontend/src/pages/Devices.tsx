import { useEffect, useState } from "react";
import { AddDeviceModal } from "../components/EnrollDevice";
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

function AddDeviceButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-primary" onClick={onClick}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      Add device
    </button>
  );
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const activeCount = devices.filter((d) => !d.revoked_at).length;

  return (
    <div className="space-y-6">
      <AddDeviceModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => load()} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Devices</h1>
          <p className="text-sm text-ink-muted dark:text-paper/50">
            Machines syncing usage to this account. A device that stops checking in is flagged so
            silent sync failures don't go unnoticed.
          </p>
        </div>
        {devices.length > 0 && <AddDeviceButton onClick={() => setModalOpen(true)} />}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Dual tone: warm coral-tinted header band over the paper table body. */}
        <div className="flex items-center justify-between border-b border-clay-200/50 bg-clay-50/70 px-5 py-3.5 dark:border-white/5 dark:bg-night-muted/50">
          <div className="text-sm font-semibold">
            Enrolled machines
            {!loading && (
              <span className="ml-2 rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium text-clay-700 dark:bg-clay-500/20 dark:text-clay-200">
                {activeCount} active
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-muted dark:text-paper/40">
            Loading…
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-100 text-clay-600 dark:bg-clay-500/20 dark:text-clay-300">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="14" height="11" rx="2" />
                <path d="M18 8h3a1 1 0 011 1v9a1 1 0 01-1 1h-3M2 19h9" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium">No devices enrolled yet</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted dark:text-paper/40">
              Add a machine to start tracking its usage. You'll get a one-liner to run on it,
              Tailscale-style.
            </p>
            <div className="mt-5">
              <AddDeviceButton onClick={() => setModalOpen(true)} />
            </div>
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
