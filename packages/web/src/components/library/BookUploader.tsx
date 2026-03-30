'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';

interface BookUploaderProps {
  onUploadComplete: (book: any) => void;
}

export function BookUploader({ onUploadComplete }: BookUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/epub+zip',
      'application/pdf',
      'application/octet-stream',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isValid =
      validTypes.includes(file.type) || ext === 'epub' || ext === 'pdf';

    if (!isValid) {
      setError('Only EPUB and PDF files are supported');
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
      formData.append('author', 'Unknown Author');

      const result = await api.upload<{ book: any }>('/api/upload', formData);

      if (result.success && result.data) {
        onUploadComplete(result.data.book);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setError(result.error?.message || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className={`cursor-pointer block ${
          uploading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="text-6xl mb-4">📚</div>
        <h3 className="text-xl font-semibold mb-2">
          {uploading ? 'Uploading...' : 'Upload a Book'}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          EPUB or PDF, max 50MB
        </p>
        <button
          className={`btn btn-primary ${uploading ? 'opacity-50' : ''}`}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Choose File'}
        </button>
      </label>

      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
