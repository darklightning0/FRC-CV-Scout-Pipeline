import { useCvBackgroundSync } from '@/core/hooks/useCvBackgroundSync';

/** Mount once under the app shell to keep CV Dexie fresh in the background. */
export function CvBackgroundSync(): null {
  useCvBackgroundSync(true);
  return null;
}
