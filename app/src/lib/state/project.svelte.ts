import type { Kind } from '../content/layers';

/** One saved piece of work: what was captured, how far the flow got, and every choice made on the way. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** index into the flow steps of the furthest step reached (-1 = nothing captured yet) */
  reached: number;
  kind: Kind;
  /** the flow page last open, so Open lands where you left off */
  path: string;
  /** a downscaled copy of the first captured image (data URL), or '' */
  image: string;
  /** LayerFlowState.snapshot() */
  choices: Record<string, unknown>;
  /** finished = assembled and saved from the Assemble step (older records have none: in progress) */
  status?: 'draft' | 'finished';
  /** a bundled example, not the user's own work */
  example?: boolean;
}

/** The slice of the Web Storage API the store needs (localStorage in the browser, memory in tests and SSR). */
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export class MemoryStorage implements KeyValueStorage {
  private data: Record<string, string> = {};
  getItem(key: string) { return this.data[key] ?? null; }
  setItem(key: string, value: string) { this.data[key] = value; }
  removeItem(key: string) { delete this.data[key]; }
}

const LIST = 'katachi.projects';
const CURRENT = 'katachi.current';
const ns = (userId: string, key: string) => `katachi:v1:${userId}:${key}`;

/** Saved projects in browser storage, namespaced by user_id (the invite code; server-side projects arrive with auth, same id). */
export class ProjectStore {
  constructor(private storage: KeyValueStorage = new MemoryStorage(), private userId = 'guest') {}
  get user() { return this.userId; }
  private listKey() { return ns(this.userId, 'projects'); }
  private currentKey() { return ns(this.userId, 'current'); }
  /** Switch user: legacy un-namespaced crafts move to the first real user who signs in, once. */
  setUserId(userId: string) {
    if (!userId || userId === this.userId) return;
    this.userId = userId;
    try {
      if (userId !== 'guest' && !this.storage.getItem(this.listKey())) {
        const legacy = this.storage.getItem(LIST);
        if (legacy) { this.storage.setItem(this.listKey(), legacy); this.storage.removeItem(LIST); }
        const cur = this.storage.getItem(CURRENT);
        if (cur) { this.storage.setItem(this.currentKey(), cur); this.storage.removeItem(CURRENT); }
      }
    } catch { /* storage unavailable */ }
  }
  private read(): ProjectRecord[] {
    try {
      const v = JSON.parse(this.storage.getItem(this.listKey()) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  private write(list: ProjectRecord[]) {
    try { this.storage.setItem(this.listKey(), JSON.stringify(list)); return; } catch { /* quota: slim down below */ }
    // Quota: drop thumbnails of the oldest crafts (the photos stay in IndexedDB) until the list fits; never throw.
    const slim = [...list].sort((a, b) => a.updatedAt - b.updatedAt);
    for (const victim of slim) {
      if (!victim.image || victim === slim[slim.length - 1]) continue;
      victim.image = '';
      try { this.storage.setItem(this.listKey(), JSON.stringify(list)); return; } catch { /* keep slimming */ }
    }
    console.error('Katachi: browser storage is full; this craft list could not be saved');
  }
  /** newest first */
  list(): ProjectRecord[] { return this.read().sort((a, b) => b.updatedAt - a.updatedAt); }
  load(id: string): ProjectRecord | null { return this.read().find((p) => p.id === id) ?? null; }
  save(p: ProjectRecord) { this.write([...this.read().filter((x) => x.id !== p.id), p]); }
  remove(id: string) {
    this.write(this.read().filter((p) => p.id !== id));
    if (this.current() === id) this.storage.removeItem(this.currentKey());
  }
  current(): string | null { return this.storage.getItem(this.currentKey()); }
  setCurrent(id: string | null) { if (id) this.storage.setItem(this.currentKey(), id); else this.storage.removeItem(this.currentKey()); }
  /** small per-user settings (the default device), namespaced like the crafts */
  getSetting(key: string): string | null { try { return this.storage.getItem(ns(this.userId, key)); } catch { return null; } }
  setSetting(key: string, value: string) { try { this.storage.setItem(ns(this.userId, key), value); } catch { /* storage unavailable: keep it for this session */ } }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** A project is named by its first step: an upload after its file, a camera shot by when it was taken. */
export function projectName({ fileName, at, prefix = 'Photo' }: { fileName?: string; at: Date; prefix?: string }): string {
  const base = fileName?.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  if (base) return base[0].toUpperCase() + base.slice(1);
  return `${prefix} · ${at.getDate()} ${MONTHS[at.getMonth()]}, ${two(at.getHours())}:${two(at.getMinutes())}`;
}
