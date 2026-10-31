// Several pictures of one object, sorted by Muse Spark (server/meta/views.ts): which side each shows, which are
// close-ups or cut plans. Shared by the server route and the craft state.
export const PICTURE_KINDS = ['view', 'detail', 'plan', 'other'] as const;
export const ANGLES = ['front', 'back', 'left', 'right', 'top', 'base', 'three-quarter', 'unknown'] as const;
export interface PictureRole { index: number; kind: (typeof PICTURE_KINDS)[number]; angle: (typeof ANGLES)[number]; note: string }
export interface ViewsBrief { subject: string; likelyMaterial: 'paper' | 'wood' | 'acrylic' | 'mixed' | 'unknown'; realSizeMm: { w: number; h: number; d: number; basis: string }; pictures: PictureRole[] }
export const ViewsJsonSchema = {
  type: 'object', additionalProperties: false, required: ['subject', 'likelyMaterial', 'realSizeMm', 'pictures'],
  properties: {
    subject: { type: 'string' }, likelyMaterial: { type: 'string', enum: ['paper', 'wood', 'acrylic', 'mixed', 'unknown'] },
    realSizeMm: { type: 'object', additionalProperties: false, required: ['w', 'h', 'd', 'basis'], properties: { w: { type: 'number' }, h: { type: 'number' }, d: { type: 'number' }, basis: { type: 'string' } } },
    pictures: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'kind', 'angle', 'note'], properties: {
      index: { type: 'integer' }, kind: { type: 'string', enum: [...PICTURE_KINDS] }, angle: { type: 'string', enum: [...ANGLES] }, note: { type: 'string' } } } }
  }
} as const;
