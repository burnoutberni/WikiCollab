import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ConnectionProvider } from './lib/connection-context';
import { DemoDisclaimer } from './components/DemoDisclaimer';
import { InstallBanner } from './components/InstallBanner';
import { LoadingSpinner } from './components/LoadingSpinner';
import { OfflineBanner } from './components/OfflineBanner';

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

const Dashboard = lazy(() =>
  import('./components/Dashboard').then((mod) => ({ default: mod.Dashboard }))
);
const DocumentEditor = lazy(() =>
  import('./components/DocumentEditor').then((mod) => ({ default: mod.DocumentEditor }))
);

function App() {
  return (
    <BrowserRouter>
      <ConnectionProvider>
        <OfflineBanner />
        {isDemoMode && <DemoDisclaimer />}
        <Suspense fallback={<LoadingSpinner fullScreen label="Loading page..." />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/doc/:id" element={<DocumentEditor />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <InstallBanner />
      </ConnectionProvider>
    </BrowserRouter>
  );
}

export default App;
