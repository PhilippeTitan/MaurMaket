import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkWishlistBatch, toggleWishlist } from '../api';
import { store } from '../store';
import { useToast } from '../components/Toast';
import { useTranslation } from '@/localization';

/**
 * Save/bookmark state for a list of listings shown outside the react-query
 * caches (profile grids).
 *
 * The server owns the truth; this hook mirrors it optimistically so a tap gives
 * instant bookmark feedback, then rolls the change back if the request fails.
 * Only the ids the profile is currently showing are queried, and nothing is
 * requested for signed-out visitors.
 */
export function useSavedListings(productIds: string[]) {
  const toast = useToast();
  const { t } = useTranslation();
  const [saved, setSaved] = useState<Set<string>>(() => new Set());

  const idKey = useMemo(() => productIds.filter(Boolean).join(','), [productIds]);

  useEffect(() => {
    if (!idKey || !store.isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = (await checkWishlistBatch(idKey.split(','))) as {
          wishlisted?: Record<string, boolean>;
        };
        if (cancelled) return;
        const map = res?.wishlisted || {};
        setSaved(new Set(Object.keys(map).filter((id) => map[id])));
      } catch {
        /* Bookmarks simply render unsaved; a retry happens on the next visit. */
      }
    })();
    return () => { cancelled = true; };
  }, [idKey]);

  const toggle = useCallback(
    async (productId: string) => {
      const wasSaved = saved.has(productId);
      setSaved((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      try {
        await toggleWishlist(productId);
      } catch {
        setSaved((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        toast.error(t('profile.saveFailed'), t('feedback.connectionRetry'));
      }
    },
    [saved, toast, t],
  );

  const isSaved = useCallback((productId: string) => saved.has(productId), [saved]);

  return { isSaved, toggle };
}
