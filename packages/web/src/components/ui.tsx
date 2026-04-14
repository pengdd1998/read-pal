'use client';

import React from 'react';

export function LoadingSpinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm animate-scale-in">
      {message}
    </div>
  );
}

/**
 * Convert raw API/network errors into user-friendly messages.
 * Avoids exposing internal details like status codes or stack traces.
 */
export function getUserFriendlyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // Network / connectivity
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('net::')) {
      return 'Unable to connect. Please check your internet connection and try again.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'The request timed out. Please try again.';
    }

    // Auth
    if (msg.includes('invalid email or password') || msg.includes('unauthorized')) {
      return 'Invalid email or password. Please try again.';
    }
    if (msg.includes('email already') || msg.includes('already registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }

    // Server
    if (msg.includes('internal server') || msg.includes('server error')) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }
    if (msg.includes('too many') || msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }

    // Return the original message if it seems user-friendly enough
    if (err.message.length < 200) return err.message;
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Offline banner — shown when the browser is offline.
 * Dismissable, auto-reappears on next offline event.
 */
export function OfflineBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium animate-slide-up">
      You&apos;re offline. Some features may be unavailable.
    </div>
  );
}

