'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { extractCharacters, detectMood } from './FictionPanel.utils';
import { FictionMoodIndicator } from './FictionMoodIndicator';
import { FictionCharacterList } from './FictionCharacterList';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FictionPanelProps {
 chapterContent: string;
 chapterIndex: number;
 onAskAboutCharacter?: (name: string) => void;
}

export const FictionPanel = React.memo(function FictionPanel({
 chapterContent,
 chapterIndex,
 onAskAboutCharacter,
}: FictionPanelProps) {
 const t = useTranslations('reader');
 const tc = useTranslations('common');
 const [isOpen, setIsOpen] = useState(false);
 const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

 const characters = useMemo(
 () => extractCharacters(chapterContent),
 [chapterContent],
 );

 const mood = useMemo(() => detectMood(chapterContent), [chapterContent]);

 // Reset selection when chapter changes
 useEffect(() => {
 setSelectedCharacter(null);
 }, [chapterIndex]);

 const handleCharacterClick = useCallback((name: string) => {
 if (selectedCharacter === name) {
  setSelectedCharacter(null);
 } else {
  setSelectedCharacter(name);
 }
 }, [selectedCharacter]);

 const handleAskCompanion = useCallback((name: string) => {
 onAskAboutCharacter?.(name);
 setIsOpen(false);
 }, [onAskAboutCharacter]);

 if (!chapterContent) return null;

 return (
 <>
  {/* Floating button — positioned near the companion chat button */}
  {!isOpen && (
  <button
   onClick={() => setIsOpen(true)}
   className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-3 py-2.5 rounded-full shadow-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:scale-105 active:scale-95 transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   aria-label={tc('character_tracker')}
  >
   <span className="text-sm">👥</span>
   {characters.length > 0 && (
   <span className="text-xs font-medium">{characters.length}</span>
   )}
  </button>
  )}

  {/* Panel */}
  {isOpen && (
  <>
   {/* Mobile backdrop */}
   <div
   className="fixed inset-0 z-40 md:hidden bg-black/10"
   onClick={() => setIsOpen(false)}
   onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
   tabIndex={-1}
   />

   <div role="dialog" aria-modal="true" aria-label={tc('character_tracker')} className="fixed left-0 bottom-0 safe-area-bottom z-50 w-full md:left-6 md:bottom-20 md:w-80 md:max-h-[70vh] bg-surface-0 shadow-2xl rounded-t-2xl md:rounded-2xl border border-purple-200/50 dark:border-purple-800/30 flex flex-col animate-slide-in-up md:animate-fade-in max-h-[60vh]">
   {/* Header */}
   <div className="flex items-center justify-between px-4 py-3 border-b border-purple-200/50 dark:border-purple-900/30">
    <div className="flex items-center gap-2">
    <span className="text-sm">👥</span>
    <h3 className="font-semibold text-sm text-purple-900 dark:text-purple-100">
     {t('fiction_story_tracker')}
    </h3>
    </div>
    <button
    onClick={() => setIsOpen(false)}
    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
    aria-label={tc('close_character_tracker')}
    >
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
    </button>
   </div>

   <FictionMoodIndicator mood={mood} />

   <FictionCharacterList
    characters={characters}
    selectedCharacter={selectedCharacter}
    onCharacterClick={handleCharacterClick}
    onAskCompanion={onAskAboutCharacter ? handleAskCompanion : undefined}
   />
   </div>
  </>
  )}
 </>
 );
});
