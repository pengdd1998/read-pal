'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface ReadingBackgroundProps {
  /** The current chapter text content -- used to generate the scene */
  content: string;
  /** Whether the dynamic background feature is enabled */
  enabled: boolean;
}

export function ReadingBackground({ content, enabled }: ReadingBackgroundProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const fetchScene = useCallback(async (text: string) => {
    if (!text || text.length < 50) return;

    // Abort any in-flight request
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setLoading(true);
    setError(false);

    try {
      const result = await api.post<{
        imageUrl: string;
        prompt: string;
        cached: boolean;
      }>('/api/agents/mood/scene', { text }, { signal: ctrl.signal });

      const data = result.data as {
        imageUrl?: string;
      } | undefined;

      const url = data?.imageUrl ?? null;

      if (url && !ctrl.signal.aborted) {
        // Pre-load the image before displaying it
        const img = new Image();
        img.onload = () => {
          if (!ctrl.signal.aborted) {
            setImageUrl(url);
            setLoading(false);
          }
        };
        img.onerror = () => {
          if (!ctrl.signal.aborted) {
            setError(true);
            setLoading(false);
          }
        };
        img.src = url;
      } else {
        setLoading(false);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setError(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !content) {
      setImageUrl(null);
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

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      {/* Base gradient fallback */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          opacity: imageUrl ? 0 : 0.3,
        }}
      />

      {/* Generated scene image */}
      {imageUrl && (
        <div
          className="absolute inset-0 transition-opacity duration-[2000ms]"
          style={{ opacity: 1 }}
        >
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'blur(20px) brightness(0.3) saturate(0.7)',
              transform: 'scale(1.1)',
            }}
          />
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
        </div>
      )}

      {/* Loading indicator */}
      {loading && !imageUrl && (
        <div className="absolute bottom-4 right-4 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-white/60">Generating scene...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 to-blue-900/20 dark:from-gray-900/40 dark:to-blue-900/40" />
      )}
    </div>
  );
}
