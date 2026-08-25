import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import { CryptoProvider } from "./lib/cryptoContext";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import Settings from "./pages/Settings";
import { EncryptionGate } from "./pages/Encryption";
import Landing from "./pages/Landing";
import Login from "./pages/Login";

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-ink-muted dark:text-paper/50">Loading…</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <CryptoProvider>
      <EncryptionGate>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </EncryptionGate>
    </CryptoProvider>
  );
}
