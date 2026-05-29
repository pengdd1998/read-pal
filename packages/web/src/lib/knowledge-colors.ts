export const GROUP_COLORS = [
  '#0d9488', // teal
  '#7c3aed', // violet
  '#ea580c', // orange
  '#2563eb', // blue
  '#dc2626', // red
  '#059669', // emerald
  '#d97706', // amber
  '#9333ea', // purple
];

export function getColor(group?: string): string {
  if (!group) return GROUP_COLORS[0];
  const idx = group.charCodeAt(0) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}
