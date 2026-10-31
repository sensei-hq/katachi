// Where crafts are kept (design/15 §4). One interface: local now (the summary list in localStorage, the document
// in IndexedDB), Supabase later. A craft saved before the tree (v1) is migrated on load and opens as it was.
import type { CraftDoc, Id } from '../../domain/craft';
import { migrateV1, type V1Snapshot } from '../../domain/craft/migrate';
import { getCraftData, putCraftData, removeCraftData } from '../media-store';
import type { ProjectRecord, ProjectStore } from '../project.svelte';

export interface CraftSummary { id: Id; name: string; updatedAt: number; image: string; status?: 'draft' | 'finished' }
export interface CraftRepository {
  list(): Promise<CraftSummary[]>;
  load(id: Id): Promise<CraftDoc | null>;
  save(doc: CraftDoc): Promise<void>;
  remove(id: Id): Promise<void>;
}

const key = (id: Id) => `doc:${id}`;
let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

export class LocalRepository implements CraftRepository {
  constructor(private projects: ProjectStore, private ids: () => Id = newId) {}
  async list(): Promise<CraftSummary[]> {
    return this.projects.list().map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, image: p.image, status: p.status }));
  }
  async load(id: Id): Promise<CraftDoc | null> {
    const saved = (await getCraftData(key(id))) as CraftDoc | null;
    if (saved?.v === 2) return saved;
    const project = this.projects.load(id);
    if (!project) return null;
    return this.migrate(project, await getCraftData(id));
  }
  /** v1: the light choices in the project record + the heavy results (regions, plan) in IndexedDB */
  migrate(project: ProjectRecord, heavy: Record<string, unknown> | null): CraftDoc {
    const snap = { ...(project.choices as V1Snapshot), ...((heavy ?? {}) as V1Snapshot) };
    return migrateV1(project, snap, this.ids);
  }
  async save(doc: CraftDoc): Promise<void> { await putCraftData(key(doc.id), JSON.parse(JSON.stringify(doc)) as Record<string, unknown>); }
  async remove(id: Id): Promise<void> { await removeCraftData(key(id)); }
}
