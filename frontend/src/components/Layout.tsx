import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-clay-100 text-clay-800 dark:bg-night-muted dark:text-clay-200"
            : "text-ink-muted hover:bg-paper-muted dark:text-paper/60 dark:hover:bg-night-muted",
        ].join(" ")
      }
    >
      <span className="h-5 w-5">{icon}</span>
      {label}
    </NavLink>
  );
}

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z" strokeLinejoin="round" />
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="14" height="11" rx="2" />
      <path d="M18 8h3a1 1 0 011 1v9a1 1 0 01-1 1h-3M2 19h9" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.9 1.09V21a2 2 0 11-4 0v-.09A1.65 1.65 0 007 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15H4.5a2 2 0 110-4h.09A1.65 1.65 0 006.4 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.09A1.65 1.65 0 0011 3v-.09a2 2 0 114 0V3a1.65 1.65 0 001.09 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09a2 2 0 010 4z" />
    </svg>
  ),
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="flex h-full min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-black/5 bg-paper-card/60 p-4 dark:border-white/5 dark:bg-night-card/40 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-clay-500 text-white shadow-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-base font-semibold">Ledger</div>
            <div className="text-xs text-ink-muted dark:text-paper/40">usage tracker</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavItem to="/" label="Dashboard" icon={icons.dashboard} />
          <NavItem to="/devices" label="Devices" icon={icons.devices} />
          <NavItem to="/settings" label="Settings" icon={icons.settings} />
        </nav>

        <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/5">
          <div className="mb-3 px-3">
            <div className="text-xs uppercase tracking-wide text-ink-muted dark:text-paper/40">
              Account
            </div>
            <div className="truncate text-sm font-medium" title={user?.email}>
              {user?.email}
            </div>
          </div>
          <button onClick={toggleTheme} className="btn-ghost w-full justify-start">
            {theme === "dark" ? "☀︎ Light mode" : "☾ Dark mode"}
          </button>
          <button onClick={logout} className="btn-ghost w-full justify-start text-clay-600">
            ⏻ Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
