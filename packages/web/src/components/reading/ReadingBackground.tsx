'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface ReadingBackgroundProps {
 content: string;
 enabled: boolean;
}

interface MoodSceneData {
 mood: string;
 scene: string;
 suggestion: string;
 color: string;
}

export const ReadingBackground = React.memo(function ReadingBackground({ content, enabled }: ReadingBackgroundProps) {
 const t = useTranslations('reader');
 const [sceneData, setSceneData] = useState<MoodSceneData | null>(null);
 const [loading, setLoading] = useState(false);
 const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const abortCtrlRef = useRef<AbortController | null>(null);

 const fetchScene = useCallback(async (text: string) => {
 if (!text || text.length < 50) return;

 abortCtrlRef.current?.abort();
 const ctrl = new AbortController();
 abortCtrlRef.current = ctrl;

 setLoading(true);

 const timeout = setTimeout(() => ctrl.abort(), 8000);

 try {
  const result = await api.post<MoodSceneData>(
  '/api/agents/mood/scene',
  { mood: 'neutral', text },
  { signal: ctrl.signal },
  );

  if (result.data && !ctrl.signal.aborted) {
  setSceneData(result.data);
  }
 } catch (err) {
  warn("ReadingBackground: mood scene fetch failed", err);
 } finally {
  clearTimeout(timeout);
  if (!ctrl.signal.aborted) {
  setLoading(false);
  }
 }
 }, []);

 useEffect(() => {
 if (!enabled || !content) {
  setSceneData(null);
  return;
 }

 if (debounceRef.current) clearTimeout(debounceRef.current);

 debounceRef.current = setTimeout(() => {
  fetchScene(content);
 }, 3000);

 return () => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  abortCtrlRef.current?.abort();
 };
 }, [content, enabled, fetchScene]);

 const bgColor = sceneData?.color || '#4A90D9';
 const gradientStyle = useMemo(() => ({
  background: `linear-gradient(135deg, ${bgColor}22 0%, ${bgColor}44 40%, ${bgColor}11 100%)`,
 }), [bgColor]);

 if (!enabled) return null;

 return (
 <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
  {/* Dynamic gradient based on mood color */}
  <div
  className="absolute inset-0 transition-all duration-[2000ms]"
  style={gradientStyle}
  />
  <div className="absolute inset-0 bg-black/5 dark:bg-surface-0/30" />

  {/* Loading indicator */}
  {loading && !sceneData && (
  <div className="absolute bottom-4 right-4 bg-black/30 dark:bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full">
   <div className="flex items-center gap-2">
   <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
   <span className="text-xs text-white/60">{t('generating_scene')}</span>
   </div>
  </div>
  )}

  {/* Scene suggestion tooltip */}
  {sceneData?.suggestion && !loading && (
  <div className="absolute bottom-4 right-4 max-w-xs bg-black/30 dark:bg-white/10 backdrop-blur-sm px-3 py-2 rounded-xl">
   <p className="text-xs text-white/70 italic">{sceneData.suggestion}</p>
  </div>
  )}
 </div>
 );
});
