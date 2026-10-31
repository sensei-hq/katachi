// Every Meta model / agent call, kept for this user (localStorage, per invite code) so the cost and the breakdown by
// model survive reloads: the top bar shows the open craft's spend, Under the hood breaks it down by model.
export interface UsageEntry { craftId: string | null; model: string; action: string; costUsd: number; ms: number; at: number; status: 'live' | 'placeholder' | 'failed' }
export interface ModelUsage { model: string; calls: number; costUsd: number; estUsd: number; ms: number }
export interface UsageTotals { calls: number; costUsd: number; estUsd: number; ms: number; byModel: ModelUsage[] }

const KEEP = 2000;
export const money = (n: number) => (n === 0 ? '$0.00' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

export function totalsOf(list: UsageEntry[]): UsageTotals {
  const byModel: ModelUsage[] = [];
  for (const e of list) {
    let m = byModel.find((x) => x.model === e.model);
    if (!m) { m = { model: e.model, calls: 0, costUsd: 0, estUsd: 0, ms: 0 }; byModel.push(m); }
    m.calls++; m.ms += e.ms;
    if (e.status === 'live') m.costUsd += e.costUsd; else if (e.status === 'placeholder') m.estUsd += e.costUsd;
  }
  byModel.sort((a, b) => b.costUsd + b.estUsd - (a.costUsd + a.estUsd));
  return { calls: list.length, costUsd: byModel.reduce((a, m) => a + m.costUsd, 0), estUsd: byModel.reduce((a, m) => a + m.estUsd, 0), ms: byModel.reduce((a, m) => a + m.ms, 0), byModel };
}

export class UsageLedger {
  entries = $state<UsageEntry[]>([]);
  constructor(private read: () => string | null = () => null, private write: (s: string) => void = () => {}) { this.reload(); }
  /** load this user's calls (after the invite code changed) */
  reload() { try { const raw = this.read(); const list = raw ? (JSON.parse(raw) as UsageEntry[]) : []; this.entries = Array.isArray(list) ? list : []; } catch { this.entries = []; } }
  add(e: Omit<UsageEntry, 'at'> & { at?: number }) {
    this.entries = [...this.entries, { ...e, at: e.at ?? Date.now() }].slice(-KEEP);
    try { this.write(JSON.stringify(this.entries)); } catch { /* storage full or unavailable: kept for this session */ }
  }
  forCraft(craftId: string | null | undefined) { return craftId ? this.entries.filter((e) => e.craftId === craftId) : []; }
  totals(craftId?: string | null) { return totalsOf(craftId === undefined ? this.entries : this.forCraft(craftId)); }
  /** the top bar: what the open craft cost (live calls), how many models; the user's total without a craft */
  label(craftId?: string | null) {
    const t = this.totals(craftId ?? undefined);
    return `${money(t.costUsd)} · ${t.byModel.length} model${t.byModel.length === 1 ? '' : 's'}`;
  }
}
