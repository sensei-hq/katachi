// Meta Model API client (server-only). Key never reaches the browser (R-PL-1).
// OpenAI-compatible: https://api.meta.ai/v1 — models muse-spark-1.3, sam-3.1, muse-image-1.0, muse-wonder-1.0.
import { costFor } from '../trace';
export function metaEnabled(env: Record<string, string | undefined>): boolean { return Boolean(env.META_API_KEY); }
export class MetaHttpError extends Error { constructor(public status: number, body: string) { super(`Meta API ${status}: ${body.slice(0, 200)}`); } }
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export class MetaClient {
  constructor(private apiKey: string, private fetchFn: FetchFn = (url, init) => fetch(url, init), private baseUrl = 'https://api.meta.ai/v1') {}
  private async post(path: string, body: unknown): Promise<any> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new MetaHttpError(res.status, await res.text());
    return res.json();
  }
  async sparkJson(system: string, user: string, schema?: Record<string, unknown>, name = 'Response'): Promise<{ data: any; costUsd: number; latencyMs: number }> {
    const t0 = Date.now();
    const out = await this.post('/responses', { model: 'muse-spark-1.3', instructions: system, input: user, ...(schema ? { text: { format: { type: 'json_schema', name, strict: true, schema } } } : {}) });
    const raw: string = out.output_text ?? out.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? '{}';
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    const text = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    return { data: JSON.parse(text), costUsd: costFor('muse-spark-1.3', { inputTokens: out.usage?.input_tokens ?? 6000, outputTokens: out.usage?.output_tokens ?? 400 }), latencyMs: Date.now() - t0 };
  }
  async sparkVision(system: string, text: string, imageDataUrl: string | undefined, schema?: Record<string, unknown>, name = 'Vision'): Promise<{ data: any; costUsd: number; latencyMs: number }> {
    const t0 = Date.now();
    const content: unknown[] = [{ type: 'input_text', text }];
    if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl });
    const out = await this.post('/responses', { model: 'muse-spark-1.3', instructions: system, input: [{ role: 'user', content }], ...(schema ? { text: { format: { type: 'json_schema', name, strict: true, schema } } } : {}) });
    const raw: string = out.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? '{}';
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    return { data: JSON.parse(s >= 0 ? raw.slice(s, e + 1) : raw), costUsd: costFor('muse-spark-1.3', { inputTokens: out.usage?.input_tokens ?? 6000, outputTokens: out.usage?.output_tokens ?? 800 }), latencyMs: Date.now() - t0 };
  }
  /** Spark vision on several pictures at once (views of one object) */
  async sparkVisionMany(system: string, text: string, images: string[], schema?: Record<string, unknown>, name = 'Vision'): Promise<{ data: any; costUsd: number; latencyMs: number }> {
    const t0 = Date.now();
    const content: unknown[] = [{ type: 'input_text', text }, ...images.flatMap((url, i) => [{ type: 'input_text', text: `Picture ${i + 1}:` }, { type: 'input_image', image_url: url }])];
    const out = await this.post('/responses', { model: 'muse-spark-1.3', instructions: system, input: [{ role: 'user', content }], ...(schema ? { text: { format: { type: 'json_schema', name, strict: true, schema } } } : {}) });
    const raw: string = out.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? '{}';
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    return { data: JSON.parse(s >= 0 ? raw.slice(s, e + 1) : raw), costUsd: costFor('muse-spark-1.3', { inputTokens: out.usage?.input_tokens ?? 6000 * images.length, outputTokens: out.usage?.output_tokens ?? 800 }), latencyMs: Date.now() - t0 };
  }
  async samText(imageDataUrl: string, prompt: string): Promise<string> {
    const out = await this.post('/responses', { model: 'sam-3.1', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: imageDataUrl }] }], metadata: { mask_encoding: 'one_bit' } });
    return out.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text ?? '';
  }
  async samMask(imageUrl: string, prompt: string): Promise<{ costUsd: number }> {
    await this.post('/responses', { model: 'sam-3.1', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: imageUrl }] }], metadata: { mask_encoding: 'one_bit' } });
    return { costUsd: costFor('sam-3.1', { images: 1 }) };
  }
  async imageEdit(prompt: string, n = 3): Promise<{ costUsd: number }> {
    await this.post('/images/edits', { model: 'muse-image-1.0', prompt, n, output_format: 'png', tool_enablement: { enable_web_search: false, enable_shell: false, enable_image_search: false }, reasoning_strength: 'low' });
    return { costUsd: costFor('muse-image-1.0', { images: n }) };
  }
  /** Muse Image edit/generate with a source image (probed live: edits 400s without `images`, returns b64_json). */
  async imageEditWith(imageDataUrl: string, prompt: string, n = 1): Promise<{ images: string[]; costUsd: number; latencyMs: number }> {
    const t0 = Date.now();
    const out = await this.post('/images/edits', { model: 'muse-image-1.0', prompt, images: [{ image_url: imageDataUrl }], n, output_format: 'png', tool_enablement: { enable_web_search: false, enable_shell: false, enable_image_search: false }, reasoning_strength: 'low' });
    const images = (out.data ?? []).map((d: { b64_json?: string; url?: string }) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : (d.url ?? ''))).filter(Boolean);
    return { images, costUsd: costFor('muse-image-1.0', { images: Math.max(1, images.length) }), latencyMs: Date.now() - t0 };
  }
}
