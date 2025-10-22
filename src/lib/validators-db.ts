// IndexedDB utility for caching validator data

interface ValidatorCache {
  votePubkey: string;
  nodePubkey: string;
  name: string;
  iconUrl?: string;
}

const DB_NAME = 'X1ValidatorsDB';
const STORE_NAME = 'validators';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'votePubkey' });
        objectStore.createIndex('name', 'name', { unique: false });
        objectStore.createIndex('nodePubkey', 'nodePubkey', { unique: false });
      }
    };
  });
};

export const saveValidators = async (validators: ValidatorCache[]): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  // Clear existing data
  await new Promise<void>((resolve, reject) => {
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => resolve();
    clearRequest.onerror = () => reject(clearRequest.error);
  });

  // Add new validators
  for (const validator of validators) {
    await new Promise<void>((resolve, reject) => {
      const addRequest = store.add(validator);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    });
  }
};

export const searchValidators = async (query: string): Promise<ValidatorCache[]> => {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    
    request.onsuccess = () => {
      const all = request.result as ValidatorCache[];
      const lowerQuery = query.toLowerCase();
      
      // Filter by votePubkey or name
      const filtered = all.filter(v => 
        v.votePubkey?.toLowerCase().includes(lowerQuery) ||
        v.name?.toLowerCase().includes(lowerQuery)
      ).slice(0, 10); // Limit to 10 results
      
      resolve(filtered);
    };
    
    request.onerror = () => reject(request.error);
  });
};

export const hasValidatorsCache = async (): Promise<boolean> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
};

export const getValidatorByVotePubkey = async (votePubkey: string): Promise<ValidatorCache | null> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.get(votePubkey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};
