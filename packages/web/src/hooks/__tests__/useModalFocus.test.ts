import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useModalFocus } from '../useModalFocus';

function setupContainer() {
  const container = document.createElement('div');
  container.tabIndex = -1;
  // Add a focusable child so trap logic has something to target.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'OK';
  container.appendChild(btn);
  document.body.appendChild(container);
  return container;
}

describe('useModalFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('focuses the container on enable', () => {
    const container = setupContainer();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      ref.current = container as HTMLDivElement;
      useModalFocus(ref, true);
      return ref;
    });

    expect(document.activeElement).toBe(container);
    container.remove();
    void result;
  });

  it('does nothing when disabled', () => {
    const container = setupContainer();
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      ref.current = container as HTMLDivElement;
      useModalFocus(ref, false);
      return ref;
    });

    expect(document.activeElement).toBe(trigger);
    container.remove();
    trigger.remove();
  });

  it('restores focus to the previously focused element on cleanup', () => {
    const container = setupContainer();
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      ref.current = container as HTMLDivElement;
      useModalFocus(ref, true);
      return ref;
    });

    expect(document.activeElement).toBe(container);
    unmount();
    expect(document.activeElement).toBe(trigger);
    container.remove();
    trigger.remove();
  });

  it('cycles focus back to first when Tab pressed on last element', () => {
    const container = setupContainer();
    const btn = container.querySelector('button')!;
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      ref.current = container as HTMLDivElement;
      useModalFocus(ref, true);
      return ref;
    });

    btn.focus();
    expect(document.activeElement).toBe(btn);

    const handler = vi.spyOn(container, 'focus');
    const preventDefault = vi.fn();
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(tabEvent, 'preventDefault', { value: preventDefault });
    document.dispatchEvent(tabEvent);

    // After Tab on the last (and only) element, focus should cycle back to first.
    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
    handler.mockRestore();
    container.remove();
    void result;
  });
});
