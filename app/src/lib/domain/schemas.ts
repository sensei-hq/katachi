import { z } from 'zod';
export const SceneObjectSchema = z.object({
  id: z.string(), label: z.string(), samPrompt: z.string(),
  role: z.enum(['art','fit_target','reference','other']),
  bbox: z.tuple([z.number(),z.number(),z.number(),z.number()]),
  shapeHint: z.enum(['round','rectangular','freeform'])
}).strict();
export const SceneAnalysisSchema = z.object({
  objects: z.array(SceneObjectSchema),
  reference: z.object({ objectId: z.string(), kind: z.enum(['id1_card','us_letter','a4','ruler','cutting_mat','quarter','none']) }).strict(),
  camera: z.object({ topDownConfidence: z.number().min(0).max(1) }).strict(),
  notes: z.string()
}).strict();
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;
export const DesignSpecSchema = z.object({
  project: z.string(),
  material: z.object({ id: z.string(), thicknessMm: z.number().positive() }).strict(),
  deviceId: z.string(),
  sheet: z.object({ wMm: z.number().positive(), hMm: z.number().positive() }).strict(),
  parts: z.array(z.object({
    name: z.string(), qty: z.number().int().positive(), template: z.string(),
    params: z.record(z.union([z.string(), z.number()])),
    engrave: z.array(z.object({ artId: z.string(), sizeMm: z.number().positive(), anchor: z.string() }).strict()).optional()
  }).strict()),
  kerfMm: z.number().nonnegative(), clearanceMm: z.number().nonnegative(),
  assumptions: z.array(z.string())
}).strict();
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
export const BurnEventsSchema = z.object({
  events: z.array(z.object({ atSec: z.number().nonnegative(), kind: z.enum(['flare','smoke_heavy','workpiece_shift','incomplete_cut','ok']), note: z.string() }).strict())
}).strict();
export type BurnEvents = z.infer<typeof BurnEventsSchema>;

export const ImageBriefSchema = z.object({
  subject: z.string(), class: z.enum(['layered', 'composite-3d', 'pattern-shape', 'fit-target']),
  arrangement: z.enum(['stacked', 'multiple-items', 'single-item', 'assembly-3d']),
  likelyMaterial: z.enum(['paper', 'wood', 'acrylic', 'mixed', 'unknown']),
  subjectPrompt: z.string(),
  regions: z.array(z.object({ id: z.string(), label: z.string(), samPrompt: z.string(), likelyBought: z.boolean(), note: z.string() }).strict()),
  items: z.array(z.object({ id: z.string(), label: z.string(), samPrompt: z.string(), arrangement: z.enum(['stacked', 'single-item']), regions: z.array(z.object({ id: z.string(), label: z.string(), samPrompt: z.string(), likelyBought: z.boolean(), note: z.string() }).strict()) }).strict()),
  colourGroupsHint: z.number().int().min(1).max(12),
  reference: z.object({ kind: z.string(), samPrompt: z.string() }).strict().nullable(),
  topDownConfidence: z.number().min(0).max(1), notes: z.string(),
  /** the real size Spark estimates from what it is (a photo has no scale): the whole piece, or one typical item */
  realSizeMm: z.object({ w: z.number().positive(), h: z.number().positive(), basis: z.string() }).strict().optional()
}).strict();
export type ImageBrief = z.infer<typeof ImageBriefSchema>;
export const ImageBriefJsonSchema = {
  type: 'object', additionalProperties: false, required: ['subject', 'class', 'arrangement', 'likelyMaterial', 'subjectPrompt', 'regions', 'items', 'colourGroupsHint', 'reference', 'topDownConfidence', 'notes', 'realSizeMm'],
  properties: {
    subject: { type: 'string' }, class: { type: 'string', enum: ['layered', 'composite-3d', 'pattern-shape', 'fit-target'] }, arrangement: { type: 'string', enum: ['stacked', 'multiple-items', 'single-item', 'assembly-3d'] },
    likelyMaterial: { type: 'string', enum: ['paper', 'wood', 'acrylic', 'mixed', 'unknown'] }, subjectPrompt: { type: 'string' },
    regions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'samPrompt', 'likelyBought', 'note'], properties: { id: { type: 'string' }, label: { type: 'string' }, samPrompt: { type: 'string' }, likelyBought: { type: 'boolean' }, note: { type: 'string' } } } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'samPrompt', 'arrangement', 'regions'], properties: { id: { type: 'string' }, label: { type: 'string' }, samPrompt: { type: 'string' }, arrangement: { type: 'string', enum: ['stacked', 'single-item'] }, regions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'samPrompt', 'likelyBought', 'note'], properties: { id: { type: 'string' }, label: { type: 'string' }, samPrompt: { type: 'string' }, likelyBought: { type: 'boolean' }, note: { type: 'string' } } } } } } },
    colourGroupsHint: { type: 'integer' },
    reference: { anyOf: [{ type: 'object', additionalProperties: false, required: ['kind', 'samPrompt'], properties: { kind: { type: 'string' }, samPrompt: { type: 'string' } } }, { type: 'null' }] },
    topDownConfidence: { type: 'number' }, notes: { type: 'string' },
    realSizeMm: { type: 'object', additionalProperties: false, required: ['w', 'h', 'basis'], properties: { w: { type: 'number' }, h: { type: 'number' }, basis: { type: 'string' } } }
  }
} as const;

export const SceneAnalysisJsonSchema = {
  type: 'object', additionalProperties: false, required: ['objects', 'reference', 'camera', 'notes'],
  properties: {
    objects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'samPrompt', 'role', 'bbox', 'shapeHint'], properties: { id: { type: 'string' }, label: { type: 'string' }, samPrompt: { type: 'string' }, role: { type: 'string', enum: ['art', 'fit_target', 'reference', 'other'] }, bbox: { type: 'array', items: { type: 'number' } }, shapeHint: { type: 'string', enum: ['round', 'rectangular', 'freeform'] } } } },
    reference: { type: 'object', additionalProperties: false, required: ['objectId', 'kind'], properties: { objectId: { type: 'string' }, kind: { type: 'string', enum: ['id1_card', 'us_letter', 'a4', 'ruler', 'cutting_mat', 'quarter', 'none'] } } },
    camera: { type: 'object', additionalProperties: false, required: ['topDownConfidence'], properties: { topDownConfidence: { type: 'number' } } },
    notes: { type: 'string' }
  }
} as const;
