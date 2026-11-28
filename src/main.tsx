import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FirebaseProvider } from './contexts/FirebaseContext.tsx';
import { SupabaseProvider } from './contexts/SupabaseContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <SupabaseProvider>
      <FirebaseProvider>
        <App />
      </FirebaseProvider>
    </SupabaseProvider>
  </ErrorBoundary>
);
