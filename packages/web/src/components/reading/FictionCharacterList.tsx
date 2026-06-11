'use client';
import React from 'react';
import { useTranslations } from 'next-intl';
import { type Character } from './FictionPanel.utils';

interface FictionCharacterListProps {
 characters: Character[];
 selectedCharacter: string | null;
 onCharacterClick: (name: string) => void;
 onAskCompanion?: (name: string) => void;
}

export const FictionCharacterList = React.memo(function FictionCharacterList({
 characters,
 selectedCharacter,
 onCharacterClick,
 onAskCompanion,
}: FictionCharacterListProps) {
 const t = useTranslations('reader');

 return (
 <div className="flex-1 overflow-y-auto p-4">
  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
  {t('fiction_characters')}
  </p>

  {characters.length === 0 ? (
  <p className="text-xs text-gray-500 text-center py-4">
   {t('fiction_no_characters')}
  </p>
  ) : (
  <div className="space-y-2">
   {characters.map((char) => (
   <CharacterItem
    key={char.name}
    char={char}
    isSelected={selectedCharacter === char.name}
    onCharacterClick={onCharacterClick}
    onAskCompanion={onAskCompanion}
    t={t}
   />
   ))}
  </div>
  )}
 </div>
 );
});

interface CharacterItemProps {
 char: Character;
 isSelected: boolean;
 onCharacterClick: (name: string) => void;
 onAskCompanion?: (name: string) => void;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const CharacterItem = React.memo(function CharacterItem({
 char,
 isSelected,
 onCharacterClick,
 onAskCompanion,
 t,
}: CharacterItemProps) {
 return (
 <div>
  <button type="button"
  onClick={() => onCharacterClick(char.name)}
  aria-label={isSelected ? t('fiction_collapse', { name: char.name }) : t('fiction_expand', { name: char.name })}
  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
   isSelected
   ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700'
   : 'bg-gray-50/50 border border-transparent hover:bg-surface-1'
  }`}
  >
  <div className="flex items-center justify-between">
   <span className="text-sm font-medium text-gray-800">
   {char.name}
   </span>
   <span className="text-xs text-gray-500">
   {char.mentions}x
   </span>
  </div>
  {isSelected && (
   <div className="mt-2 space-y-2">
   <p className="text-xs text-gray-500 italic">
    &ldquo;{char.context}&rdquo;
   </p>
   {onAskCompanion && (
   <button type="button"
    onClick={(e) => {
    e.stopPropagation();
    onAskCompanion(char.name);
    }}
    aria-label={t('fiction_ask_about', { name: char.name.split(' ')[0] })}
    className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {t('fiction_ask_about', { name: char.name.split(' ')[0] })}
   </button>
   )}
   </div>
  )}
  </button>
 </div>
 );
});
