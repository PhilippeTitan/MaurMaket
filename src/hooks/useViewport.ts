import { useWindowDimensions } from 'react-native';

// ─────────────────────────────────────────────────────────────
// Viewport conventions, in one place
//
// The app is designed phone-first: content lives in a single column that stops
// growing at CONTENT_MAX_WIDTH and is centred on anything wider (tablet, desktop
// web, split screen). A screen is never laid out shorter than MIN_SCREEN_HEIGHT —
// below that it scrolls rather than squashing its content.
// ─────────────────────────────────────────────────────────────

/** Widest the content column gets before it is centred instead of stretched. */
export const CONTENT_MAX_WIDTH = 430;
/** Horizontal gutter full-bleed screens apply on each side. */
export const SCREEN_GUTTER = 28;
/** Shortest a screen is ever laid out; under this the content scrolls. */
export const MIN_SCREEN_HEIGHT = 620;
/** Slack between the window and the laid-out screen. */
export const SCREEN_HEIGHT_SLACK = 40;

export interface Viewport {
  /** Live window width — re-renders on rotate, resize, split screen, fold. */
  width: number;
  /** Live window height. */
  height: number;
  /** Usable content width inside the gutters, capped at the content column. */
  contentWidth: number;
  /** Minimum height a screen should lay out to at this window size. */
  minScreenHeight: number;
  /** Narrow window: drop to the compact treatment. */
  isCompact: boolean;
  /** Short window: shed vertical air (artwork, headers, sheets). */
  isShort: boolean;
}

/**
 * The one place layout asks "how big is the window?".
 *
 * Never read `Dimensions.get('window')` at module scope: that snapshot is taken
 * once at import, so every number derived from it (screen min-heights, artwork
 * sizes, overlay origins) stays wrong for the rest of the session — rotate the
 * device, resize a browser window, or open the app in split screen and the
 * layout still believes it is the size it booted at, until a full reload.
 */
export function useViewport(): Viewport {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    contentWidth: Math.max(0, Math.min(width, CONTENT_MAX_WIDTH) - SCREEN_GUTTER * 2),
    minScreenHeight: Math.max(MIN_SCREEN_HEIGHT, height - SCREEN_HEIGHT_SLACK),
    isCompact: width < 375,
    isShort: height < 700,
  };
}
