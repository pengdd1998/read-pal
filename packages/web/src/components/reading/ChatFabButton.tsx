'use client';

import React, { useMemo } from 'react';

interface ChatFabButtonProps {
 btnRef: React.Ref<HTMLButtonElement>;
 friendName: string;
 wasDragRef: React.MutableRefObject<boolean>;
 btnPos: { x: number; y: number };
 isDragging: boolean;
 isSnapping: boolean;
 snapTransition: string;
 onDragStart: (x: number, y: number) => void;
 onDragMove: (x: number, y: number) => void;
 onDragEnd: () => void;
 dragRef: React.MutableRefObject<{ moved: boolean } | null>;
 onOpen: () => void;
 ariaLabel: string;
}

export const ChatFabButton = React.memo(function ChatFabButton({
 btnRef,
 friendName,
 wasDragRef,
 btnPos,
 isDragging,
 isSnapping,
 snapTransition,
 onDragStart,
 onDragMove,
 onDragEnd,
 dragRef,
 onOpen,
 ariaLabel,
}: ChatFabButtonProps) {
 const fabStyle = useMemo(() => ({
  left: btnPos.x,
  top: btnPos.y,
  background: 'linear-gradient(135deg, rgb(20, 184, 166), rgb(16, 185, 129))',
  boxShadow: isDragging
   ? '0 8px 24px -4px rgba(20, 184, 166, 0.3), 0 4px 12px -2px rgba(16, 185, 129, 0.2)'
   : '0 4px 14px -2px rgba(30, 42, 56, 0.12), 0 2px 6px -1px rgba(30, 42, 56, 0.06)',
  transition: isDragging ? 'box-shadow 0.15s ease' : isSnapping ? `box-shadow 0.15s ease, ${snapTransition}` : 'box-shadow 0.15s ease, transform 0.2s ease',
  transform: isDragging ? 'scale(1.08)' : undefined,
  cursor: isDragging ? 'grabbing' : 'grab',
 }), [btnPos.x, btnPos.y, isDragging, isSnapping, snapTransition]);

 return (
 <button type="button"
  ref={btnRef}
  id="tour-ai-companion"
  onClick={(e) => {
  if (wasDragRef.current) { e.preventDefault(); wasDragRef.current = false; return; }
  onOpen();
  }}
  onMouseDown={(e) => {
  e.preventDefault();
  onDragStart(e.clientX, e.clientY);
  const onMouseMove = (ev: MouseEvent) => onDragMove(ev.clientX, ev.clientY);
  const onMouseUp = () => {
   onDragEnd();
   window.removeEventListener('mousemove', onMouseMove);
   window.removeEventListener('mouseup', onMouseUp);
  };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  }}
  onTouchStart={(e) => {
  const touch = e.touches[0];
  onDragStart(touch.clientX, touch.clientY);
  }}
  onTouchMove={(e) => {
  const touch = e.touches[0];
  onDragMove(touch.clientX, touch.clientY);
  if (dragRef.current?.moved) e.preventDefault();
  }}
  onTouchEnd={() => { onDragEnd(); }}
  className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full select-none touch-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  style={fabStyle}
  aria-label={ariaLabel}
 >
  <svg aria-hidden="true" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
 </button>
 );
});
