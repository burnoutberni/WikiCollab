import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

interface ConnectionContextValue {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(true);
  return (
    <ConnectionContext.Provider value={{ connected, setConnected }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider');
  }
  return context;
}
