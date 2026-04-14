'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional label for debugging — shown in error message */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const errorMessage = this.state.error?.message || 'This section encountered an error';
      const isChunkError = errorMessage.toLowerCase().includes('chunk') ||
        errorMessage.toLowerCase().includes('loading css') ||
        errorMessage.toLowerCase().includes('dynamically imported');

      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>

            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              {this.props.label ? `Error in ${this.props.label}` : 'Something went wrong'}
            </h3>

            <p className="text-xs text-gray-500 mb-3">{errorMessage}</p>

            {isChunkError && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                This may be caused by a stale page after a recent update.
              </p>
            )}

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98] transition-all"
              >
                Try again
              </button>
              {isChunkError ? (
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all"
                >
                  Reload page
                </button>
              ) : (
                <button
                  onClick={this.handleGoHome}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all"
                >
                  Go Home
                </button>
              )}
            </div>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer">Stack trace</summary>
                <pre className="mt-2 text-[10px] text-red-500 overflow-auto max-h-32 bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
