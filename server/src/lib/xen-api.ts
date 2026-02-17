const XEN_API_BASE = process.env.XEN_API_URL || 'https://api.xen.network';
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchEpochSlotMap(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    const response = await fetchWithTimeout(`${XEN_API_BASE}/v1/x1/epochs`);
    if (!response.ok) return map;
    const data = await response.json() as any[];
    data.forEach((e: any) => map.set(e.epoch, e.endSlot));
  } catch (err) {
    console.warn('[xen-api] fetchEpochSlotMap:', (err as Error).message);
  }
  return map;
}

export async function fetchStakeHistory(nodePubkey: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    const response = await fetchWithTimeout(
      `${XEN_API_BASE}/v1/x1/validators/${nodePubkey}/history?groupBy=epoch&network=mainnet`
    );
    if (!response.ok) return map;
    const data = await response.json() as any[];
    data.forEach((item: any) => {
      if (item.epoch !== undefined && item.activatedStake !== undefined) {
        map.set(item.epoch, item.activatedStake / 1e9);
      }
    });
  } catch (err) {
    console.warn('[xen-api] fetchStakeHistory:', (err as Error).message);
  }
  return map;
}

export async function fetchStakeHistoryForEpoch(
  nodePubkey: string,
  epoch: number
): Promise<number | undefined> {
  try {
    const response = await fetchWithTimeout(
      `${XEN_API_BASE}/v1/x1/validators/${nodePubkey}/history?groupBy=epoch&network=mainnet`
    );
    if (!response.ok) return undefined;
    const data = await response.json() as any[];
    const epochData = data.find((item: any) => item.epoch === epoch);
    if (epochData?.activatedStake !== undefined) {
      return epochData.activatedStake / 1e9;
    }
  } catch (err) {
    console.warn('[xen-api] fetchStakeHistoryForEpoch:', (err as Error).message);
  }
  return undefined;
}

export async function fetchValidatorMetadata(
  voteAddress: string
): Promise<{ name?: string; avatar?: string }> {
  try {
    const response = await fetchWithTimeout(
      `${XEN_API_BASE}/v1/x1/validators?network=mainnet&votePubkey=${voteAddress}`
    );
    if (!response.ok) return {};
    const data = await response.json() as any[];
    return {
      name: data[0]?.name || undefined,
      avatar: data[0]?.iconUrl || undefined,
    };
  } catch (err) {
    console.warn('[xen-api] fetchValidatorMetadata:', (err as Error).message);
  }
  return {};
}

export async function fetchValidatorsList(): Promise<any[]> {
  const response = await fetchWithTimeout(
    `${XEN_API_BASE}/v1/x1/validators?network=mainnet&limit=5000`,
    30_000
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json() as any[];
}
