// Categorical palette for knowledge-graph node groups.
//
// W2 color policy (single warm accent): the teal/emerald/blue families
// were removed after the kg test run flagged cold nodes (KG4-02,
// rgb(13,148,136) teal); violet/purple stay as the two cool CONTRAST
// anchors — precedent from the W2 sweep, and a fully warm 8-hue ramp
// collapses into near-duplicates that hurt at-a-glance group
// separation. Category identity is double-encoded by legend SHAPE
// (circle/ring/triangle/square), so tonal warmth variation is safe.
export const GROUP_COLORS = [
  '#d97706', // amber
  '#ea580c', // orange
  '#dc2626', // red
  '#e11d48', // rose
  '#a16207', // dark gold
  '#92400e', // amber-800 (brown)
  '#7c3aed', // violet (contrast anchor)
  '#9333ea', // purple (contrast anchor)
];

export function getColor(group?: string): string {
  if (!group) return GROUP_COLORS[0];
  const idx = group.charCodeAt(0) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}
