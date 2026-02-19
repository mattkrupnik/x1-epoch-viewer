import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const STORAGE_KEY = "hiddenTokenMints";

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHidden(mints: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...mints]));
}

interface HiddenTokensContextValue {
  hidden: Set<string>;
  hide: (mint: string) => void;
  unhide: (mint: string) => void;
}

const noop = () => {};
const HiddenTokensContext = createContext<HiddenTokensContextValue>({
  hidden: new Set(),
  hide: noop,
  unhide: noop,
});

export function HiddenTokensProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);

  const hide = useCallback((mint: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.add(mint);
      saveHidden(next);
      return next;
    });
  }, []);

  const unhide = useCallback((mint: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.delete(mint);
      saveHidden(next);
      return next;
    });
  }, []);

  return (
    <HiddenTokensContext.Provider value={{ hidden, hide, unhide }}>
      {children}
    </HiddenTokensContext.Provider>
  );
}

export function useHiddenTokens() {
  return useContext(HiddenTokensContext);
}
