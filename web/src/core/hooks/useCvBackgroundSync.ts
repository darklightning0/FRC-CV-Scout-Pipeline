/**
 * Background CV sync — polls the public CV API whenever an event is set,
 * so scouts get new matches without opening the CV tab.
 */

import { useEffect, useRef } from 'react';
import {
  CV_API_POLL_INTERVAL_MS,
  getStoredCvSyncBaseUrl,
  pullCvBundlesForEvent,
} from '@/core/lib/cvSyncClient';
import { getCurrentEvent } from '@/core/lib/tba';

export function useCvBackgroundSync(enabled = true): void {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      if (inFlight.current || !navigator.onLine) return;
      const eventKey = getCurrentEvent()?.trim();
      if (!eventKey) return;
      const baseUrl = getStoredCvSyncBaseUrl();
      if (!baseUrl) return;

      inFlight.current = true;
      try {
        await pullCvBundlesForEvent(baseUrl, eventKey);
      } catch {
        // Offline / not deployed yet — silent
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), CV_API_POLL_INTERVAL_MS);
    const onFocus = () => void tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
}
