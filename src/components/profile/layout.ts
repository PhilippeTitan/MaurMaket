import { useViewport } from '../../hooks';

/**
 * Shared geometry for both profile surfaces (owner + visitor).
 *
 * The profile is one system: a single column that stops growing at
 * PROFILE_MAX_WIDTH and is centred on wider web layouts. Inside that column the
 * masonry catalog is two columns on phones and three columns once the window is
 * wide enough to give every tile room for a readable title, price and condition.
 */
export const PROFILE_MAX_WIDTH = 900;
/** Horizontal padding inside the centred profile column. */
export const PROFILE_PAD = 16;
/** Gap between masonry tiles. */
export const PROFILE_GRID_GAP = 6;
/** From this window width up, the catalog becomes three columns. */
export const PROFILE_GRID_WIDE_BREAKPOINT = 640;
/** Height of the sticky bar's action row (before the tab row). */
export const PROFILE_STICKY_ROW = 48;

export function useProfileLayout() {
  const vp = useViewport();
  const columns = vp.width >= PROFILE_GRID_WIDE_BREAKPOINT ? 3 : 2;
  /** Width of the centred container, clamped to the window. */
  const containerWidth = Math.min(vp.width, PROFILE_MAX_WIDTH);
  /** Content width inside the container — what the masonry grid may fill. */
  const gridWidth = Math.max(0, containerWidth - PROFILE_PAD * 2);
  return { vp, columns, containerWidth, gridWidth };
}
