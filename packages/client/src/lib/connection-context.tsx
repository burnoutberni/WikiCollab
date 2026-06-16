import { createContext, useContext, useState, ReactNode } from 'react';

interface ConnectionContextValue {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  connected: true,
  setConnected: () => {},
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(true);
  return (
    <ConnectionContext.Provider value={{ connected, setConnected }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
