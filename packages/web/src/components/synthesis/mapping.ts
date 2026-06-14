// Helpers that map backend synthesis payloads into the AnalysisResult shape
// AnalysisResultView renders. The backend emits Pydantic snake_case shapes
// (CrossBookComparison / SynthesisResult) that don't directly match the
// frontend's AnalysisResult contract.

import type { AnalysisResult, Theme } from './types';

type ThemeEntry = { name?: string; description?: string; confidence?: number; strength?: number };

/** Map a backend ThemeEntry (confidence) to the frontend Theme (strength). */
function toTheme(th: ThemeEntry): Theme {
  const strength = typeof th.confidence === 'number'
    ? th.confidence
    : (typeof th.strength === 'number' ? th.strength : 0.5);
  return {
    name: th.name || '—',
    description: th.description || '',
    strength,
  };
}

/**
 * Map a CrossBookComparison payload (cross-book "Analyze All" and two-book
 * "Compare") into AnalysisResult. common_themes -> themes; unique_perspectives
 * and recommended_connections -> insights.
 */
export function mapCrossBookResult(raw: Record<string, unknown>): AnalysisResult {
  const commonThemes = Array.isArray(raw.common_themes) ? raw.common_themes as ThemeEntry[] : [];
  const uniquePerspectives = Array.isArray(raw.unique_perspectives)
    ? raw.unique_perspectives as Array<{ book?: string; perspective?: string }>
    : [];
  const recommendedConnections = Array.isArray(raw.recommended_connections)
    ? raw.recommended_connections as unknown[]
    : [];
  return {
    themes: commonThemes.map(toTheme),
    insights: [
      ...uniquePerspectives.map((p) => (p.book ? `${p.book}: ${p.perspective ?? ''}` : (p.perspective ?? ''))),
      ...recommendedConnections.map((c) => String(c)),
    ],
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

/**
 * Normalize a single-book SynthesisResult payload so themes render correctly
 * (the backend uses ThemeEntry.confidence; the renderer reads Theme.strength —
 * without this the strength chip shows "NaN%"). Other fields pass through.
 */
export function normalizeSynthesisResult(raw: Record<string, unknown>): AnalysisResult {
  const result = { ...(raw as AnalysisResult) };
  if (Array.isArray(result.themes)) {
    result.themes = result.themes.map((th) => toTheme(th as ThemeEntry));
  }
  return result;
}
