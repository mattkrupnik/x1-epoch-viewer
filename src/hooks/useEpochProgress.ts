import { useState } from "react";

interface EpochProgress {
  slotIndex: number;
  slotsInEpoch: number;
  progressPercent: number;
  slotTime: number;
}

export const useEpochProgress = () => {
  const [epochProgress, setEpochProgress] = useState<EpochProgress>({
    slotIndex: 0,
    slotsInEpoch: 0,
    progressPercent: 0,
    slotTime: 0
  });

  return { epochProgress, setEpochProgress };
};
