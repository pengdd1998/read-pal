import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, ErrorAlert, getUserFriendlyError } from '../ui';

describe('LoadingSpinner', () => {
  it('renders an SVG with animate-spin class', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="w-8 h-8" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('w-8')).toBe(true);
    expect(svg?.classList.contains('h-8')).toBe(true);
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  it('uses default className when none provided', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('w-4')).toBe(true);
    expect(svg?.classList.contains('h-4')).toBe(true);
  });
});

describe('ErrorAlert', () => {
  it('renders alert with message', () => {
    render(<ErrorAlert message="Something went wrong" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('returns null for empty message', () => {
    const { container } = render(<ErrorAlert message="" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('getUserFriendlyError', () => {
  it('handles network errors', () => {
    expect(getUserFriendlyError(new Error('network error')))
      .toBe('Unable to connect. Please check your internet connection and try again.');
    expect(getUserFriendlyError(new Error('Failed to fetch data')))
      .toBe('Unable to connect. Please check your internet connection and try again.');
    expect(getUserFriendlyError(new Error('net::ERR_CONNECTION_REFUSED')))
      .toBe('Unable to connect. Please check your internet connection and try again.');
  });

  it('handles timeout', () => {
    expect(getUserFriendlyError(new Error('Request timeout')))
      .toBe('The request timed out. Please try again.');
    expect(getUserFriendlyError(new Error('Request timed out')))
      .toBe('The request timed out. Please try again.');
  });

  it('handles auth errors', () => {
    expect(getUserFriendlyError(new Error('invalid email or password')))
      .toBe('Invalid email or password. Please try again.');
    expect(getUserFriendlyError(new Error('Unauthorized access')))
      .toBe('Invalid email or password. Please try again.');
    expect(getUserFriendlyError(new Error('email already registered')))
      .toBe('An account with this email already exists. Try signing in instead.');
    expect(getUserFriendlyError(new Error('User already registered')))
      .toBe('An account with this email already exists. Try signing in instead.');
  });

  it('handles server errors', () => {
    expect(getUserFriendlyError(new Error('internal server error')))
      .toBe('Something went wrong on our end. Please try again in a moment.');
    expect(getUserFriendlyError(new Error('Server error 500')))
      .toBe('Something went wrong on our end. Please try again in a moment.');
  });

  it('handles rate limit', () => {
    expect(getUserFriendlyError(new Error('rate limit exceeded')))
      .toBe('Too many attempts. Please wait a moment and try again.');
    expect(getUserFriendlyError(new Error('Too many requests')))
      .toBe('Too many attempts. Please wait a moment and try again.');
  });

  it('returns short error messages as-is', () => {
    expect(getUserFriendlyError(new Error('Custom error')))
      .toBe('Custom error');
    expect(getUserFriendlyError(new Error('A brief message')))
      .toBe('A brief message');
  });

  it('returns default message for non-Error values', () => {
    expect(getUserFriendlyError('string error'))
      .toBe('Something went wrong. Please try again.');
    expect(getUserFriendlyError(42))
      .toBe('Something went wrong. Please try again.');
    expect(getUserFriendlyError(null))
      .toBe('Something went wrong. Please try again.');
    expect(getUserFriendlyError(undefined))
      .toBe('Something went wrong. Please try again.');
  });

  it('returns default for very long error messages', () => {
    const longMsg = 'x'.repeat(201);
    expect(getUserFriendlyError(new Error(longMsg)))
      .toBe('Something went wrong. Please try again.');
  });
});
