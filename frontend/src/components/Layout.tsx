import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCrypto } from "../lib/cryptoContext";
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
      <span className="shrink-0">{icon}</span>
      {label}
    </NavLink>
  );
}

// Sidebar nav icons (from SVG Repo). Recolored to currentColor so they inherit
// the active/muted text color of the nav item.
const icons = {
  dashboard: (
    <svg
      viewBox="0 -0.5 25 25"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.918 10.0005H7.082C6.66587 9.99708 6.26541 10.1591 5.96873 10.4509C5.67204 10.7427 5.50343 11.1404 5.5 11.5565V17.4455C5.5077 18.3117 6.21584 19.0078 7.082 19.0005H9.918C10.3341 19.004 10.7346 18.842 11.0313 18.5502C11.328 18.2584 11.4966 17.8607 11.5 17.4445V11.5565C11.4966 11.1404 11.328 10.7427 11.0313 10.4509C10.7346 10.1591 10.3341 9.99708 9.918 10.0005Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.918 4.0006H7.082C6.23326 3.97706 5.52559 4.64492 5.5 5.4936V6.5076C5.52559 7.35629 6.23326 8.02415 7.082 8.0006H9.918C10.7667 8.02415 11.4744 7.35629 11.5 6.5076V5.4936C11.4744 4.64492 10.7667 3.97706 9.918 4.0006Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.082 13.0007H17.917C18.3333 13.0044 18.734 12.8425 19.0309 12.5507C19.3278 12.2588 19.4966 11.861 19.5 11.4447V5.55666C19.4966 5.14054 19.328 4.74282 19.0313 4.45101C18.7346 4.1592 18.3341 3.9972 17.918 4.00066H15.082C14.6659 3.9972 14.2654 4.1592 13.9687 4.45101C13.672 4.74282 13.5034 5.14054 13.5 5.55666V11.4447C13.5034 11.8608 13.672 12.2585 13.9687 12.5503C14.2654 12.8421 14.6659 13.0041 15.082 13.0007Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.082 19.0006H17.917C18.7661 19.0247 19.4744 18.3567 19.5 17.5076V16.4936C19.4744 15.6449 18.7667 14.9771 17.918 15.0006H15.082C14.2333 14.9771 13.5256 15.6449 13.5 16.4936V17.5066C13.525 18.3557 14.2329 19.0241 15.082 19.0006Z"
      />
    </svg>
  ),
  devices: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15H4V6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V8" />
      <path d="M2 18H14" />
      <path d="M14 9.2C14 8.53726 14.597 8 15.3333 8H20.6667C21.403 8 22 8.53726 22 9.2V18.8C22 19.4627 21.403 20 20.6667 20H15.3333C14.597 20 14 19.4627 14 18.8V9.2Z" />
      <path d="M18 17H18.01" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M3.66122 10.6392C4.13377 10.9361 4.43782 11.4419 4.43782 11.9999C4.43781 12.558 4.13376 13.0638 3.66122 13.3607C3.33966 13.5627 3.13248 13.7242 2.98508 13.9163C2.66217 14.3372 2.51966 14.869 2.5889 15.3949C2.64082 15.7893 2.87379 16.1928 3.33973 16.9999C3.80568 17.8069 4.03865 18.2104 4.35426 18.4526C4.77508 18.7755 5.30694 18.918 5.83284 18.8488C6.07287 18.8172 6.31628 18.7185 6.65196 18.5411C7.14544 18.2803 7.73558 18.2699 8.21895 18.549C8.70227 18.8281 8.98827 19.3443 9.00912 19.902C9.02332 20.2815 9.05958 20.5417 9.15224 20.7654C9.35523 21.2554 9.74458 21.6448 10.2346 21.8478C10.6022 22 11.0681 22 12 22C12.9319 22 13.3978 22 13.7654 21.8478C14.2554 21.6448 14.6448 21.2554 14.8478 20.7654C14.9404 20.5417 14.9767 20.2815 14.9909 19.9021C15.0117 19.3443 15.2977 18.8281 15.7811 18.549C16.2644 18.27 16.8545 18.2804 17.3479 18.5412C17.6837 18.7186 17.9271 18.8173 18.1671 18.8489C18.693 18.9182 19.2249 18.7756 19.6457 18.4527C19.9613 18.2106 20.1943 17.807 20.6603 17C20.8677 16.6407 21.029 16.3614 21.1486 16.1272M20.3387 13.3608C19.8662 13.0639 19.5622 12.5581 19.5621 12.0001C19.5621 11.442 19.8662 10.9361 20.3387 10.6392C20.6603 10.4372 20.8674 10.2757 21.0148 10.0836C21.3377 9.66278 21.4802 9.13092 21.411 8.60502C21.3591 8.2106 21.1261 7.80708 20.6601 7.00005C20.1942 6.19301 19.9612 5.7895 19.6456 5.54732C19.2248 5.22441 18.6929 5.0819 18.167 5.15113C17.927 5.18274 17.6836 5.2814 17.3479 5.45883C16.8544 5.71964 16.2643 5.73004 15.781 5.45096C15.2977 5.1719 15.0117 4.6557 14.9909 4.09803C14.9767 3.71852 14.9404 3.45835 14.8478 3.23463C14.6448 2.74458 14.2554 2.35523 13.7654 2.15224C13.3978 2 12.9319 2 12 2C11.0681 2 10.6022 2 10.2346 2.15224C9.74458 2.35523 9.35523 2.74458 9.15224 3.23463C9.05958 3.45833 9.02332 3.71848 9.00912 4.09794C8.98826 4.65566 8.70225 5.17191 8.21891 5.45096C7.73557 5.73002 7.14548 5.71959 6.65205 5.4588C6.31633 5.28136 6.0729 5.18269 5.83285 5.15108C5.30695 5.08185 4.77509 5.22436 4.35427 5.54727C4.03866 5.78945 3.80569 6.19297 3.33974 7C3.13231 7.35929 2.97105 7.63859 2.85138 7.87273" />
    </svg>
  ),
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { lock } = useCrypto();
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
          <button onClick={lock} className="btn-ghost w-full justify-start">
            🔒 Lock
          </button>
          <button
            onClick={() => {
              lock();
              logout();
            }}
            className="btn-ghost w-full justify-start text-clay-600"
          >
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
