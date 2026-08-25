import { useEffect, useState } from "react";
import { EnrollForm } from "../components/EnrollDevice";
import { api, type EnrollmentToken, type Meta } from "../lib/api";
import { formatDate } from "../lib/format";

function tokenStatus(t: EnrollmentToken): { label: string; cls: string } {
  if (t.revoked_at) return { label: "Revoked", cls: "text-gray-500" };
  if (t.used_at) return { label: "Used", cls: "text-ink-muted dark:text-paper/40" };
  if (t.expires_at && new Date(t.expires_at) < new Date())
    return { label: "Expired", cls: "text-red-600 dark:text-red-400" };
  return { label: "Active", cls: "text-green-600 dark:text-green-400" };
}

export default function Settings() {
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);

  async function load() {
    const [t, m] = await Promise.all([api.enrollmentTokens(), api.meta()]);
    setTokens(t);
    setMeta(m);
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id: number) {
    await api.revokeEnrollment(id);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this enrollment token? Devices already enrolled with it keep working."))
      return;
    await api.deleteEnrollment(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-muted dark:text-paper/50">
          Enroll new machines with a one-time install token, Tailscale-style.
        </p>
      </div>

      <div className="card overflow-hidden">
        {/* Dual tone: warm coral header band over the paper card body. */}
        <div className="bg-clay-500 px-6 py-4 text-white">
          <h2 className="text-base font-semibold">Enroll a new device</h2>
          <p className="mt-0.5 text-sm text-white/80">
            Generate a token, then run the printed one-liner on the target machine. The token is
            shown once and exchanged for a permanent device key on first check-in.
          </p>
        </div>
        <div className="p-6">
          <EnrollForm onCreated={() => load()} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-black/5 px-5 py-3.5 text-sm font-semibold dark:border-white/5">
          Enrollment tokens
        </div>
        {tokens.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-muted dark:text-paper/40">
            No enrollment tokens yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
                <th className="px-5 py-2 font-medium">Label</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="hidden px-5 py-2 font-medium sm:table-cell">Created</th>
                <th className="hidden px-5 py-2 font-medium md:table-cell">Expires</th>
                <th className="px-5 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const st = tokenStatus(t);
                const canRevoke = !t.revoked_at && !t.used_at;
                return (
                  <tr key={t.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-5 py-3 font-medium">{t.label || `token #${t.id}`}</td>
                    <td className={`px-5 py-3 font-medium ${st.cls}`}>{st.label}</td>
                    <td className="hidden px-5 py-3 text-ink-muted dark:text-paper/40 sm:table-cell">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="hidden px-5 py-3 text-ink-muted dark:text-paper/40 md:table-cell">
                      {t.expires_at ? formatDate(t.expires_at) : "never"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-4">
                        {canRevoke && (
                          <button
                            onClick={() => revoke(t.id)}
                            className="text-sm font-medium text-ink-muted transition hover:text-ink dark:text-paper/50 dark:hover:text-paper"
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          onClick={() => remove(t.id)}
                          className="text-sm font-medium text-red-500 transition hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {meta && (
        <div className="card p-5 text-sm">
          <h2 className="mb-3 text-base font-semibold">Server</h2>
          <dl className="grid grid-cols-2 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
                Version
              </dt>
              <dd className="font-medium">{meta.version}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
                Pinned ccusage
              </dt>
              <dd className="font-medium">{meta.ccusage_version}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
                Stale after
              </dt>
              <dd className="font-medium">{meta.device_stale_after_hours}h</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
