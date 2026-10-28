// The gate form. The session itself is an httpOnly signed cookie the server sets; the page only learns "in or not".
export class SessionState {
  code = $state('');
  attested = $state(false);
  safetyAck = $state(false);
  noPersonalAck = $state(false);
  msg = $state('');
  gated = $state(false);
  /** the invite code is the user_id across the app (demo-grade identity until auth lands) */
  userId = $state('');
  get canEnter() { return this.code.trim().length > 0 && this.attested && this.safetyAck && this.noPersonalAck; }
  async enter(code: string, attested: boolean): Promise<boolean> {
    const r = await fetch('/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, attested18: attested }) });
    const data = await r.json().catch(() => ({}));
    this.gated = Boolean(r.ok);
    if (r.ok && data.user_id) this.userId = String(data.user_id);
    if (!r.ok) this.msg = data.reason ?? 'The gate is unavailable — try again';
    return r.ok;
  }
  async enterFromForm(): Promise<boolean> {
    if (!this.code.trim()) { this.msg = 'Enter your invite code'; return false; }
    if (!(this.attested && this.safetyAck && this.noPersonalAck)) { this.msg = 'Tick all three to continue'; return false; }
    const ok = await this.enter(this.code.trim(), this.attested);
    if (ok) this.msg = 'Welcome — opening workshop';
    return ok;
  }
}
