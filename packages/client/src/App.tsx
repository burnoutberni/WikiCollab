import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { DemoDisclaimer } from './components/DemoDisclaimer';
import { LoadingSpinner } from './components/LoadingSpinner';

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

const Dashboard = lazy(() =>
  import('./components/Dashboard').then((mod) => ({ default: mod.Dashboard }))
);
const DocumentEditor = lazy(() =>
  import('./components/DocumentEditor').then((mod) => ({ default: mod.DocumentEditor }))
);

/** Top-level client router for the dashboard and document editor views. */
function App() {
  return (
    <BrowserRouter>
      {isDemoMode && <DemoDisclaimer />}
      <Suspense fallback={<LoadingSpinner fullScreen label="Loading page..." />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/doc/:id" element={<DocumentEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
