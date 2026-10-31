// The app lives at the root: / is the gate, studio pages are top level, the image → layers flow is /make/*.
// Old /snap/* links (bookmarks, the PWA start URL, chat actions saved before the move) redirect here.
const flow: Record<string, string> = {
  source: 'layers', cutout: 'layers', objects: 'layers', layers: 'layers', gaps: 'gaps',
  material: 'layers', cut: 'output', views: 'views', reference: 'reference'
};

/** The coaster flow's stage routes, folded into the craft journey (docs/design/07 G8): they open Home. */
const folded = ['/scene', '/plan', '/art', '/preview'];

/** Where an old /snap path (or a folded stage route) now lives, or null when the path is not a legacy one. */
export function legacyPath(path: string): string | null {
  if (folded.includes(path)) return '/workshop';
  // the gallery is part of Home now (design/11)
  if (path === '/crafts') return '/workshop';
  if (path === '/batch') return '/queue';
  // Import, Cutout and Segment became part of Layers (Analyze, design/10)
  if (/^\/make\/(import|cutout|segment)$/.test(path)) return '/make/layers';
  if (path !== '/snap' && !path.startsWith('/snap/')) return null;
  if (path === '/snap') return '/workshop';
  if (path === '/snap/welcome') return '/';
  if (path === '/snap/convert') return '/make/layers';
  const step = path.match(/^\/snap\/layers\/([a-z]+)$/)?.[1];
  if (step) return `/make/${flow[step] ?? 'layers'}`;
  const rest = path.slice('/snap'.length);
  return folded.includes(rest) ? '/workshop' : rest;
}
