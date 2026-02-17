const API_URL = import.meta.env.VITE_API_URL || '';

export const api = {
  async getValidator(voteAddress: string) {
    const response = await fetch(`${API_URL}/api/validators/${voteAddress}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  },

  async addValidator(voteAddress: string) {
    const response = await fetch(`${API_URL}/api/validators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteAddress }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }
    return response.json();
  },

  async checkValidator(voteAddress: string) {
    const response = await fetch(`${API_URL}/api/validators/${voteAddress}/status`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  async deleteValidator(voteAddress: string) {
    const response = await fetch(`${API_URL}/api/validators/${voteAddress}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  async resyncValidator(voteAddress: string) {
    const response = await fetch(`${API_URL}/api/validators/${voteAddress}/resync`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  async searchValidators(query: string): Promise<Array<{ votePubkey: string; nodePubkey: string; name: string; iconUrl?: string }>> {
    const response = await fetch(`${API_URL}/api/validators/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  async getEpochInfo(): Promise<{ epoch: number; slotIndex: number; slotsInEpoch: number; slotTime: number }> {
    const response = await fetch(`${API_URL}/api/epoch-info`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  async getEpochTimestamps(): Promise<Record<number, string>> {
    const response = await fetch(`${API_URL}/api/epoch-timestamps`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },
};
