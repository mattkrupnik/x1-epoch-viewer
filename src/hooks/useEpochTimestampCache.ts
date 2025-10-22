export const useEpochTimestampCache = () => {
  const getCache = (): Map<number, string> => {
    try {
      const cache = localStorage.getItem('epochTimestampCache');
      if (cache) {
        const parsed = JSON.parse(cache);
        return new Map(Object.entries(parsed).map(([k, v]) => [Number(k), v as string]));
      }
    } catch (error) {
      console.error('Error loading epoch timestamp cache:', error);
    }
    return new Map();
  };

  const saveCache = (cache: Map<number, string>) => {
    try {
      const obj = Object.fromEntries(cache);
      localStorage.setItem('epochTimestampCache', JSON.stringify(obj));
    } catch (error) {
      console.error('Error saving epoch timestamp cache:', error);
    }
  };

  return { getCache, saveCache };
};
