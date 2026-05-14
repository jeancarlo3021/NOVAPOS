import { useEffect, useRef, useCallback, RefObject } from 'react';

// Barcode scanners typically type at < 30 ms/character.
// Human keyboard typing is usually > 80 ms/character.
// We use 50 ms as the threshold to distinguish the two.
const SCANNER_THRESHOLD_MS = 50;

// Reset buffer if silence exceeds this value (scanner finished but no Enter sent)
const FLUSH_TIMEOUT_MS = 200;

interface Options {
  /** Ref of the dedicated scanner <input> element */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Called with the scanned code once a complete scan is detected */
  onScan: (code: string) => void;
  /** Minimum code length to be treated as valid (default 2) */
  minLength?: number;
  /** Whether the scanner is enabled (default true) */
  enabled?: boolean;
}

/**
 * Detects barcode scanner input in two ways:
 *  1. When the dedicated input is focused: normal input + Enter handling.
 *  2. When no text input is focused: global keydown listener that collects
 *     fast-typed characters (scanner speed) and fires onScan on Enter.
 *
 * Press F2 at any time to focus the scanner input.
 */
export function useBarcodeScanner({
  inputRef,
  onScan,
  minLength = 2,
  enabled = true,
}: Options): void {
  const bufferRef  = useRef('');
  const lastKeyRef = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = useCallback(() => {
    clearTimer();
    const code = bufferRef.current.trim();
    bufferRef.current = '';
    lastKeyRef.current = 0;
    if (code.length >= minLength) onScan(code);
  }, [onScan, minLength]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeydown = (e: KeyboardEvent) => {
      // F2 → focus the dedicated scanner input from anywhere
      if (e.key === 'F2') {
        e.preventDefault();
        inputRef.current?.select();
        inputRef.current?.focus();
        return;
      }

      // If the scanner input itself is focused, its own onKeyDown handles it
      if (document.activeElement === inputRef.current) return;

      // If any other text input / textarea / select is focused, ignore
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT')
      ) {
        return;
      }

      // Enter key → flush what we collected so far
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault();
          flush();
        }
        return;
      }

      // Only accept printable single characters
      if (e.key.length !== 1) return;

      const now = Date.now();
      const gap = now - lastKeyRef.current;

      // If too slow between keystrokes → this is human typing, not scanner
      if (lastKeyRef.current > 0 && gap > SCANNER_THRESHOLD_MS) {
        bufferRef.current = '';
      }

      bufferRef.current += e.key;
      lastKeyRef.current = now;

      // Auto-flush after silence (handles scanners that don't send Enter)
      clearTimer();
      timerRef.current = setTimeout(flush, FLUSH_TIMEOUT_MS);
    };

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      clearTimer();
    };
  }, [enabled, flush, inputRef, minLength]);
}
