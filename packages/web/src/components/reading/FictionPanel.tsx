'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { extractCharacters, detectMood } from './FictionPanel.utils';
import { FictionMoodIndicator } from './FictionMoodIndicator';
import { FictionCharacterList } from './FictionCharacterList';
import { useModalFocus } from '@/hooks/useModalFocus';

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
 const dialogRef = useRef<HTMLDivElement>(null);
 useModalFocus(dialogRef);

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
  <button type="button"
   onClick={() => setIsOpen(true)}
   aria-expanded={false}
   className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-3 py-2.5 rounded-full shadow-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:scale-105 active:scale-95 transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   aria-label={tc('character_tracker')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
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

   <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={tc('character_tracker')} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }} className="fixed left-0 bottom-0 safe-area-bottom z-50 w-full md:left-6 md:bottom-20 md:w-80 md:max-h-[70vh] bg-surface-0 shadow-2xl rounded-t-2xl md:rounded-2xl border border-purple-200/50 dark:border-purple-800/30 flex flex-col animate-slide-in-up md:animate-fade-in max-h-[60vh]">
   {/* Header */}
   <div className="flex items-center justify-between px-4 py-3 border-b border-purple-200/50 dark:border-purple-900/30">
    <div className="flex items-center gap-2">
    <span className="text-sm">👥</span>
    <h3 className="font-semibold text-sm text-purple-900 dark:text-purple-100">
     {t('fiction_story_tracker')}
    </h3>
    </div>
    <button type="button"
    onClick={() => setIsOpen(false)}
    className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-surface-1 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
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
