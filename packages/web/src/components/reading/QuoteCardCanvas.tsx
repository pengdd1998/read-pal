'use client';

import type { CardTheme } from './QuoteCard';

export const THEMES: Record<CardTheme, {
 label: string;
 bg: string;
 bgGradient: string;
 textColor: string;
 accentColor: string;
 quoteMarkColor: string;
 titleColor: string;
 watermarkColor: string;
 canvasStops: [number, string, number, string][];
 canvasText: string;
 canvasTitle: string;
 canvasWatermark: string;
 canvasQuoteMark: string;
}> = {
 warm: {
 label: 'Warm',
 bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100',
 bgGradient: '',
 textColor: 'text-amber-950',
 accentColor: 'border-amber-300/60',
 quoteMarkColor: 'text-amber-200/70',
 titleColor: 'text-amber-700',
 watermarkColor: 'text-amber-400/50',
 canvasStops: [
  [0, '#FFFBEB', 0.3, '#FFF7ED'],
  [0.6, '#FEF3C7', 1, '#FDE68A'],
 ],
 canvasText: '#451A03',
 canvasTitle: '#B45309',
 canvasWatermark: 'rgba(217, 119, 6, 0.35)',
 canvasQuoteMark: 'rgba(253, 230, 138, 0.6)',
 },
 dark: {
 label: 'Dark',
 bg: 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900',
 bgGradient: '',
 textColor: 'text-gray-100',
 accentColor: 'border-amber-500/30',
 quoteMarkColor: 'text-amber-500/20',
 titleColor: 'text-amber-400',
 watermarkColor: 'text-gray-600',
 canvasStops: [
  [0, '#111827', 0.4, '#1F2937'],
  [0.7, '#1F2937', 1, '#111827'],
 ],
 canvasText: '#F3F4F6',
 canvasTitle: '#FBBF24',
 canvasWatermark: 'rgba(107, 114, 128, 0.5)',
 canvasQuoteMark: 'rgba(245, 158, 11, 0.15)',
 },
};

export function wrapText(
 ctx: CanvasRenderingContext2D,
 text: string,
 maxWidth: number,
): string[] {
 const words = text.split(' ');
 const lines: string[] = [];
 let currentLine = '';

 for (const word of words) {
 const testLine = currentLine ? `${currentLine} ${word}` : word;
 const metrics = ctx.measureText(testLine);
 if (metrics.width > maxWidth && currentLine) {
  lines.push(currentLine);
  currentLine = word;
 } else {
  currentLine = testLine;
 }
 }
 if (currentLine) {
 lines.push(currentLine);
 }
 return lines;
}

export function renderCardToCanvas(
 canvas: HTMLCanvasElement,
 text: string,
 bookTitle: string,
 author: string,
 theme: CardTheme,
 byLabel?: string,
): void {
 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 const W = 1200;
 const H = 630;
 const pad = 80;
 const t = THEMES[theme];

 canvas.width = W;
 canvas.height = H;

 // Background gradient
 const grad = ctx.createLinearGradient(0, 0, W, H);
 for (const [stop, color] of t.canvasStops) {
 grad.addColorStop(stop, color);
 }
 ctx.fillStyle = grad;
 ctx.fillRect(0, 0, W, H);

 // Subtle noise texture via tiny dots
 ctx.globalAlpha = 0.03;
 for (let i = 0; i < 800; i++) {
 const x = Math.random() * W;
 const y = Math.random() * H;
 const r = Math.random() * 1.5;
 ctx.fillStyle = theme === 'warm' ? '#92400E' : '#FBBF24';
 ctx.beginPath();
 ctx.arc(x, y, r, 0, Math.PI * 2);
 ctx.fill();
 }
 ctx.globalAlpha = 1;

 // Decorative border line
 ctx.strokeStyle = theme === 'warm'
 ? 'rgba(217, 119, 6, 0.2)'
 : 'rgba(251, 191, 36, 0.15)';
 ctx.lineWidth = 1;
 const inset = 32;
 ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

 // Large quotation mark watermark
 ctx.font = 'bold 280px Georgia, serif';
 ctx.fillStyle = t.canvasQuoteMark;
 ctx.textAlign = 'left';
 ctx.textBaseline = 'top';
 ctx.fillText('“', pad - 20, pad - 60);

 // Quote text
 const quoteFontSize = text.length > 200 ? 28 : text.length > 120 ? 32 : 38;
 ctx.font = `italic ${quoteFontSize}px Georgia, "Times New Roman", serif`;
 ctx.fillStyle = t.canvasText;
 ctx.textAlign = 'center';
 ctx.textBaseline = 'top';

 const maxTextWidth = W - pad * 2 - 40;
 const lines = wrapText(ctx, text, maxTextWidth);
 const lineHeight = quoteFontSize * 1.6;
 const textBlockHeight = lines.length * lineHeight;
 const textStartY = (H - textBlockHeight) / 2 - 20;

 for (let i = 0; i < lines.length; i++) {
 ctx.fillText(lines[i], W / 2, textStartY + i * lineHeight);
 }

 // Thin separator
 const sepY = textStartY + textBlockHeight + 30;
 ctx.strokeStyle = theme === 'warm'
 ? 'rgba(180, 83, 9, 0.25)'
 : 'rgba(251, 191, 36, 0.25)';
 ctx.lineWidth = 1;
 ctx.beginPath();
 ctx.moveTo(W / 2 - 40, sepY);
 ctx.lineTo(W / 2 + 40, sepY);
 ctx.stroke();

 // Book title & author
 const metaY = sepY + 20;
 ctx.font = '16px "DM Sans", system-ui, sans-serif';
 ctx.fillStyle = t.canvasTitle;
 ctx.textAlign = 'center';
 ctx.fillText(`${bookTitle}`, W / 2, metaY);

 ctx.font = 'italic 14px Georgia, serif';
 ctx.fillStyle = t.canvasTitle;
 ctx.globalAlpha = 0.7;
 ctx.fillText(`${byLabel || 'by'} ${author}`, W / 2, metaY + 24);
 ctx.globalAlpha = 1;

 // Watermark
 ctx.font = '11px "DM Sans", system-ui, sans-serif';
 ctx.fillStyle = t.canvasWatermark;
 ctx.textAlign = 'right';
 ctx.fillText('read-pal', W - inset - 8, H - inset - 4);

 // Closing quote mark (small, bottom-right of text block)
 ctx.font = 'bold 120px Georgia, serif';
 ctx.fillStyle = t.canvasQuoteMark;
 ctx.textAlign = 'right';
 ctx.textBaseline = 'bottom';
 ctx.fillText('”', W - pad + 20, textStartY + textBlockHeight + 10);
}
