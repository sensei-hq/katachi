// The app's sections (docs/design/11): Home (start a craft + your crafts) and the tools; when a craft is open, its
// steps join the rail as icons (Layers · Cut · Assemble; the outline is worked out automatically from the photo). Copy only: the phone icon nav and the studio rail
// both render these lists.
export type SectionId = 'workshop' | 'queue' | 'layers' | 'cut' | 'assemble';
export interface Section {
  id: SectionId; href: string; label: string; icon: string;
  /** path prefixes that belong to this section (defaults to href) */
  match?: string[];
  /** false: studio rail only (the phone nav keeps the essentials) */
  phone?: boolean;
  /** a craft step that cannot be opened yet (no layers) */
  disabled?: boolean;
  /** a count on the icon (sheets waiting in the cut queue); `pulse` when it just grew */
  badge?: number; pulse?: boolean;
}

export const sections: Section[] = [
  { id: 'workshop', href: '/workshop', label: 'Home', icon: 'i-solar:home-2-linear', match: ['/workshop', '/crafts', '/capture'] },
  // the cut queue: sheets from any craft, cut one at a time with you feeding each sheet
  { id: 'queue', href: '/queue', label: 'Cut queue', icon: 'i-solar:checklist-minimalistic-linear' }
];

/** The open craft's steps, as rail icons (3D crafts open Layers on their parts & joins). */
export function craftSections(kind: 'flat' | '3d' | 'ref' = 'flat'): Section[] {
  return [
    { id: 'layers', href: kind === '3d' ? '/make/views' : '/make/layers', label: 'Layers', icon: 'i-solar:layers-linear', match: ['/make/layers', '/make/views', '/make/reference', '/make/gaps'] },
    { id: 'cut', href: '/make/output', label: 'Cut', icon: 'i-solar:scissors-linear', match: ['/make/output'] },
    { id: 'assemble', href: '/make/assemble', label: 'Assemble', icon: 'i-solar:box-minimalistic-linear', match: ['/make/assemble'] }
  ];
}

/** Studio-only tools, shown in the rail below the divider (not in the phone icon nav). */
export interface Tool { id: 'actions' | 'chains' | 'materials' | 'annotations' | 'settings'; href: string; label: string; icon: string }
export const tools: Tool[] = [
  { id: 'actions', href: '/actions', label: 'Actions', icon: 'i-solar:gallery-linear' },
  { id: 'chains', href: '/chains', label: 'Chains', icon: 'i-solar:link-linear' },
  { id: 'materials', href: '/materials', label: 'Materials', icon: 'i-solar:palette-linear' },
  { id: 'annotations', href: '/annotations', label: 'Annotations', icon: 'i-solar:notes-linear' },
  { id: 'settings', href: '/settings', label: 'Settings', icon: 'i-solar:settings-linear' }
];

/** The section a path belongs to: the longest matching prefix wins; everything else is Home. */
export function sectionFor(pathname: string): SectionId {
  let best: { id: SectionId; len: number } = { id: 'workshop', len: 0 };
  for (const s of [...sections, ...craftSections()]) {
    for (const prefix of s.match ?? [s.href]) {
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && prefix.length > best.len) best = { id: s.id, len: prefix.length };
    }
  }
  return best.id;
}
