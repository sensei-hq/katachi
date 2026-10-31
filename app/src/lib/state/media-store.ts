// The craft's captured images live in IndexedDB (browser storage that holds megabytes), not in the
// localStorage craft list (≈5 MB for everything). Capture puts them here; reopening a craft reads them
// back so every step — Capture included — shows the real photo. In-memory where IndexedDB is missing.
export interface StoredMedia { id: string; label: string; url: string; source: 'camera' | 'upload' | 'sketch' }

const DB = 'katachi-media', STORE = 'crafts', DATA = 'craft-data';
const memory = new Map<string, StoredMedia[]>();
const memoryData = new Map<string, Record<string, unknown>>();

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((res) => {
    try {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => { for (const st of [STORE, DATA]) if (!req.result.objectStoreNames.contains(st)) req.result.createObjectStore(st); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch { res(null); }
  });
}
export async function putMedia(craftId: string, media: StoredMedia[]): Promise<void> {
  memory.set(craftId, media);
  const db = await open(); if (!db) return;
  await new Promise<void>((res) => { try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(media, craftId); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}
export async function getMedia(craftId: string): Promise<StoredMedia[]> {
  const db = await open();
  if (!db) return memory.get(craftId) ?? [];
  return new Promise((res) => {
    try { const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(craftId); req.onsuccess = () => res((req.result as StoredMedia[] | undefined) ?? memory.get(craftId) ?? []); req.onerror = () => res(memory.get(craftId) ?? []); }
    catch { res(memory.get(craftId) ?? []); }
  });
}
export async function removeMedia(craftId: string): Promise<void> {
  memory.delete(craftId);
  const db = await open(); if (!db) return;
  await new Promise<void>((res) => { try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(craftId); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}

// The craft's heavy results (traced mask paths, cut sheets) — megabytes for a detailed photo — live here too,
// so the localStorage craft list stays small and a save never fails on quota.
export async function putCraftData(craftId: string, data: Record<string, unknown>): Promise<void> {
  memoryData.set(craftId, data);
  const db = await open(); if (!db) return;
  await new Promise<void>((res) => { try { const tx = db.transaction(DATA, 'readwrite'); tx.objectStore(DATA).put(data, craftId); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}
export async function getCraftData(craftId: string): Promise<Record<string, unknown> | null> {
  const db = await open();
  if (!db) return memoryData.get(craftId) ?? null;
  return new Promise((res) => {
    try { const req = db.transaction(DATA, 'readonly').objectStore(DATA).get(craftId); req.onsuccess = () => res((req.result as Record<string, unknown> | undefined) ?? memoryData.get(craftId) ?? null); req.onerror = () => res(memoryData.get(craftId) ?? null); }
    catch { res(memoryData.get(craftId) ?? null); }
  });
}
export async function removeCraftData(craftId: string): Promise<void> {
  memoryData.delete(craftId);
  const db = await open(); if (!db) return;
  await new Promise<void>((res) => { try { const tx = db.transaction(DATA, 'readwrite'); tx.objectStore(DATA).delete(craftId); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}
