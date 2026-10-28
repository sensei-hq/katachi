// Every job a Meta model or agent does in the craft journey, in one catalogue (docs/design/07 §4, PRD 04).
// Pages never call models: they call AppState, which runs these through MuseAgents (lib/state/muse.svelte.ts).
// `live` jobs already go to a server route that owns the API key; `placeholder` jobs return fixtures with the
// same shape until the integrated build wires them (the route named in `route` is where each will live).
import type { JourneyId } from './journey';

export type AgentModel = 'Muse Spark 1.3' | 'SAM 3.1' | 'Muse Image' | 'Muse Voice Transcribe' | 'Muse Wonder' | 'Code';
export type AgentJobId =
  | 'intent.classify' | 'capture.describe' | 'shape.cleanSketch' | 'shape.cutout' | 'shape.segment'
  | 'layers.plan' | 'layers.imagineGaps' | 'layers.unfold' | 'layers.refine' | 'sheets.vectorise'
  | 'assemble.instructions' | 'assemble.render';

export interface AgentJob { id: AgentJobId; model: AgentModel; step: JourneyId | 'home'; label: string; route: string; status: 'live' | 'placeholder'; /** typical cost of one call (PRD 04 §4.5); placeholders show it as an estimate */ estUsd: number }

export const agentJobs: Record<AgentJobId, AgentJob> = {
  'intent.classify': { id: 'intent.classify', model: 'Muse Spark 1.3', step: 'home', label: 'Understands what you want to make', route: '/api/intent', status: 'placeholder', estUsd: 0.004 },
  'capture.describe': { id: 'capture.describe', model: 'Muse Spark 1.3', step: 'capture', label: 'Says what is in the picture', route: '/api/scene', status: 'live', estUsd: 0.01 },
  'shape.cleanSketch': { id: 'shape.cleanSketch', model: 'Muse Image', step: 'shape', label: 'Cleans your sketch into line art', route: '/api/art', status: 'live', estUsd: 0.03 },
  'shape.cutout': { id: 'shape.cutout', model: 'SAM 3.1', step: 'shape', label: 'Removes the background and finds the outline', route: '/api/segment', status: 'live', estUsd: 0.0025 },
  'shape.segment': { id: 'shape.segment', model: 'SAM 3.1', step: 'shape', label: 'Finds the regions that can become parts', route: '/api/segment', status: 'live', estUsd: 0.0025 },
  'layers.plan': { id: 'layers.plan', model: 'Muse Spark 1.3', step: 'layers', label: 'Groups regions into layers, back to front', route: '/api/convert', status: 'live', estUsd: 0.02 },
  'layers.imagineGaps': { id: 'layers.imagineGaps', model: 'Muse Image', step: 'layers', label: 'Imagines what hides behind each layer', route: '/api/art', status: 'live', estUsd: 0.01 },
  'layers.unfold': { id: 'layers.unfold', model: 'Muse Spark 1.3', step: 'layers', label: 'Unfolds six views into parts with joints', route: '/api/design', status: 'placeholder', estUsd: 0.02 },
  'layers.refine': { id: 'layers.refine', model: 'Muse Spark 1.3', step: 'layers', label: 'Turns your note into edits on the layers', route: '/api/design', status: 'placeholder', estUsd: 0.005 },
  'sheets.vectorise': { id: 'sheets.vectorise', model: 'Code', step: 'sheets', label: 'Traces each layer into cut paths and nests the sheets', route: 'lib/domain/vector', status: 'live', estUsd: 0 },
  'assemble.instructions': { id: 'assemble.instructions', model: 'Muse Spark 1.3', step: 'assemble', label: 'Writes the assembly steps', route: '/api/design', status: 'placeholder', estUsd: 0.01 },
  'assemble.render': { id: 'assemble.render', model: 'Muse Image', step: 'assemble', label: 'Renders the finished piece', route: '/api/preview', status: 'live', estUsd: 0.04 }
};

/** The jobs Katachi runs when a craft first reaches each flow route. */
export const jobsOnVisit: Record<string, AgentJobId[]> = {
  cutout: ['shape.cutout'], segment: ['shape.segment'], layers: ['layers.plan'], gaps: ['layers.imagineGaps'],
  views: ['layers.unfold'], output: ['sheets.vectorise'], assemble: ['assemble.instructions']
};
