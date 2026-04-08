'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';

interface BookUploaderProps {
  onUploadComplete: (book: Book) => void;
}

export function BookUploader({ onUploadComplete }: BookUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('author', 'Unknown Author');

      const result = await api.upload<{ book: Book }>('/api/upload', formData);

      if (result.success && result.data) {
        const data = result.data as unknown as { book: Book };
        onUploadComplete(data.book);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setError(result.error?.message || 'Upload failed');
      }
    } catch {
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isValid =
      [
        'application/epub+zip',
        'application/pdf',
        'application/octet-stream',
      ].includes(file.type) ||
      ext === 'epub' ||
      ext === 'pdf';

    if (!isValid) {
      setError('Only EPUB and PDF files are supported');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }
    uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleClick = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 overflow-hidden ${
        uploading
          ? 'border-gray-300 dark:border-gray-600 opacity-50'
          : dragOver
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.01]'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50/30 dark:hover:bg-primary-950/10'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
      />

      {/* Animated dashed border shimmer */}
      {!uploading && !dragOver && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none animate-border-shimmer opacity-30" />
      )}

      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-100 to-amber-100 dark:from-primary-900/30 dark:to-amber-900/30 flex items-center justify-center">
        <svg className="w-7 h-7 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-1">
        {uploading ? 'Uploading...' : 'Click or drag your book here to upload'}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        EPUB or PDF, max 50MB
      </p>

      {uploading && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Processing your book...</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
