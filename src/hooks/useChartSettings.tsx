import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ChartSettings {
  epochCount: number;
  setEpochCount: (count: number) => void;
  showPostBalance: boolean;
  setShowPostBalance: (show: boolean) => void;
}

const ChartSettingsContext = createContext<ChartSettings | null>(null);

export const ChartSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [epochCount, setEpochCount] = useState<number>(() => {
    const saved = localStorage.getItem('globalEpochCount');
    return saved ? parseInt(saved) : 30;
  });

  const [showPostBalance, setShowPostBalance] = useState<boolean>(() => {
    const saved = localStorage.getItem('globalShowPostBalance');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('globalEpochCount', epochCount.toString());
  }, [epochCount]);

  useEffect(() => {
    localStorage.setItem('globalShowPostBalance', showPostBalance.toString());
  }, [showPostBalance]);

  return (
    <ChartSettingsContext.Provider value={{ epochCount, setEpochCount, showPostBalance, setShowPostBalance }}>
      {children}
    </ChartSettingsContext.Provider>
  );
};

export const useChartSettings = () => {
  const context = useContext(ChartSettingsContext);
  if (!context) {
    throw new Error('useChartSettings must be used within ChartSettingsProvider');
  }
  return context;
};

export const useChartSettingsSafe = () => {
  return useContext(ChartSettingsContext);
};
