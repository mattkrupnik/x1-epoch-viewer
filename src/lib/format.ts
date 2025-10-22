/**
 * Format number with 2 decimal places
 */
export const formatXNT = (value: number): string => {
  return value?.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Format validator address for display
 */
export const formatAddress = (address: string, startChars: number = 12, endChars: number = 4): string => {
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

/**
 * Format epoch progress time remaining
 */
export const formatTimeRemaining = (slotsRemaining: number, slotTime: number): string => {
  const secondsLeft = slotsRemaining * slotTime;
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  return `${hours}h ${minutes}m left`;
};
