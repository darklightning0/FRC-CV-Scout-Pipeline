const DEFAULT_PROCEED_DEBOUNCE_MS = 1000;

let lastProceedTimestamp = 0;

export function shouldAllowProceed(debounceMs: number = DEFAULT_PROCEED_DEBOUNCE_MS): boolean {
  const now = Date.now();
  if (now - lastProceedTimestamp < debounceMs) {
    return false;
  }

  lastProceedTimestamp = now;
  return true;
}

export { DEFAULT_PROCEED_DEBOUNCE_MS };
