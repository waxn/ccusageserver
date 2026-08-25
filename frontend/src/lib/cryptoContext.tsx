import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type CryptoParams } from "./api";
import { setupCrypto, unlockCrypto } from "./crypto";

// The encryption password is kept in sessionStorage so a page reload doesn't
// force a re-prompt; it's cleared when the tab closes or on Lock. The derived
// AES key itself is non-extractable and lives only in memory.
const PW_KEY = "ledger-enc-pw";

interface CryptoState {
  loading: boolean;
  params: CryptoParams | null;
  configured: boolean;
  key: CryptoKey | null;
  unlocked: boolean;
  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
}

const Ctx = createContext<CryptoState | undefined>(undefined);

export function CryptoProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<CryptoParams | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.cryptoParams();
        if (cancelled) return;
        setParams(p);
        // Auto-unlock from a remembered password within this tab session.
        const pw = sessionStorage.getItem(PW_KEY);
        if (p.configured && pw) {
          try {
            setKey(await unlockCrypto(pw, p as Required<CryptoParams>));
          } catch {
            sessionStorage.removeItem(PW_KEY);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setup = useCallback(async (password: string) => {
    const { params: sp, key: k } = await setupCrypto(password);
    const saved = await api.cryptoSetup(sp);
    sessionStorage.setItem(PW_KEY, password);
    setParams(saved);
    setKey(k);
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      const p = params ?? (await api.cryptoParams());
      if (!p.configured) throw new Error("Encryption is not set up yet.");
      const k = await unlockCrypto(password, p as Required<CryptoParams>);
      sessionStorage.setItem(PW_KEY, password);
      setParams(p);
      setKey(k);
    },
    [params],
  );

  const lock = useCallback(() => {
    sessionStorage.removeItem(PW_KEY);
    setKey(null);
  }, []);

  const value = useMemo<CryptoState>(
    () => ({
      loading,
      params,
      configured: !!params?.configured,
      key,
      unlocked: key !== null,
      setup,
      unlock,
      lock,
    }),
    [loading, params, key, setup, unlock, lock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCrypto(): CryptoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCrypto must be used within CryptoProvider");
  return ctx;
}
