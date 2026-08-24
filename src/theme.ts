/**
 * MaurMaket Design Tokens — Phase 1: Formalized Design System
 *
 * This file defines the complete token system for the application.
 * All colors, spacing, typography, radii, shadows, and motion values
 * are defined here and should be imported from this file.
 *
 * Color Palette: Dark-first with warm coral accents
 * Typography: Syne (headings) + Inter (body)
 * Spacing: 4-point base scale
 */

// ─────────────────────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────────────────────

/** Core background and surface colors */
export const COLORS: Record<string, string> = {
  // Backgrounds
  bg: '#0D1117',           // Main app background
  surface: '#161B22',      // Cards, sheets, elevated surfaces
  surface2: '#1C2235',     // Secondary elevated surfaces
  surfaceHover: '#21262D', // Hover/pressed state for interactive surfaces

  // Borders
  border: '#21262D',       // Default border color
  borderLight: '#30363D',  // Lighter border for emphasis
  borderFocus: '#FF4D6A',  // Focus ring color

  // Text
  text: '#E6EDF3',         // Primary text
  text2: '#8B949E',        // Secondary text
  text3: '#6E7681',        // Tertiary text (placeholders, hints)
  textInverse: '#0D1117',  // Text on light backgrounds

  // Brand / Accent
  coral: '#FF4D6A',        // Primary accent (CTAs, active states)
  coralLight: '#FF7A93',   // Lighter coral for hover/pressed
  coralDark: '#E63354',    // Darker coral for active
  coralMuted: 'rgba(255, 77, 106, 0.15)', // Muted coral for backgrounds

  blue: '#00C2FF',         // Secondary accent (links, info)
  blueMuted: 'rgba(0, 194, 255, 0.15)',

  green: '#00E5A0',        // Success, online status
  greenMuted: 'rgba(0, 229, 160, 0.15)',

  yellow: '#FFE066',       // Warning, ratings
  yellowMuted: 'rgba(255, 224, 102, 0.15)',

  purple: '#8B5CF6',       // NatCash accent
  purpleMuted: 'rgba(139, 92, 246, 0.15)',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Semantic
  error: '#FF4D6A',        // Same as coral — error states
  success: '#00E5A0',      // Same as green
  warning: '#FFE066',      // Same as yellow
  info: '#00C2FF',         // Same as blue
};

/** Seller tier colors */
export const TIER_COLORS: Record<string, string> = {
  casual: '#00E5A0',
  verified: '#1E3A5F',
  business: '#FFD700',
};

/** @deprecated Legacy tier gradients — unused, will be removed */
export const TIER_GRADIENTS: Record<string, [string, string]> = {
  casual: ['#00E5A0', '#00C2FF'],
  verified: ['#1E3A5F', '#FF4D6A'],
  business: ['#FFD700', '#FF4D6A'],
};

/** @deprecated Legacy CTA gradient — migrate to COLORS.coral solid */
export const BUTTON_GRADIENT: [string, string] = ['#F47A20', '#E41E26'];

// ─────────────────────────────────────────────────────────────
// OPACITY
// ─────────────────────────────────────────────────────────────

/** Common opacity values for dark theme */
export const OPACITY = {
  /** Full opacity — default for most elements */
  full: 1,
  /** 90% — subtle dimming, hover states */
  high: 0.9,
  /** 70% — secondary text, disabled text on dark */
  medium: 0.7,
  /** 50% — placeholder text, disabled states */
  low: 0.5,
  /** 35% — muted backgrounds, subtle borders */
  subtle: 0.35,
  /** 20% — very subtle backgrounds, overlay scims */
  faint: 0.2,
  /** 15% — card backgrounds, surface tints */
  ghost: 0.15,
  /** 8% — barely visible tints */
  whisper: 0.08,
  /** 0% — fully transparent */
  none: 0,
} as const;

// ─────────────────────────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────────────────────────

/** 4-point base spacing scale */
export const SPACING = {
  /** 2px — micro spacing */
  xxs: 2,
  /** 4px — tight spacing */
  xs: 4,
  /** 8px — default small spacing */
  sm: 8,
  /** 12px — default medium spacing */
  md: 12,
  /** 16px — default large spacing */
  lg: 16,
  /** 20px — extra large spacing */
  xl: 20,
  /** 24px — section spacing */
  xxl: 24,
  /** 32px — large section spacing */
  xxxl: 32,
  /** 40px — screen-level spacing */
  page: 40,
} as const;

// ─────────────────────────────────────────────────────────────
// RADIUS
// ─────────────────────────────────────────────────────────────

/** Corner radius scale — shared across all UI elements */
export const RADIUS = {
  /** No radius */
  none: 0,
  /** 4px — subtle rounding (small chips, badges) */
  xs: 4,
  /** 6px — inline elements (tags, small pills) */
  sm: 6,
  /** 10px — rows inside lists/settings cards */
  row: 10,
  /** 12px — cards, surfaces, buttons, primary CTAs */
  card: 12,
  /** 16px — media cards, image-bearing tiles */
  media: 16,
  /** 20px — pill-shaped buttons, auth screens, tab chips */
  button: 12,
  /** 24px — large pills, search bars */
  pill: 20,
  /** 28px — floating action buttons */
  fab: 28,
  /** Fully round — avatars, badges, circular buttons */
  full: 999,
} as const;

// ─────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────

/** Font families */
export const FONTS = {
  heading: 'Syne',
  body: 'Inter',
} as const;

/** Typography scale — font sizes */
export const FONT_SIZES = {
  /** 10px — badge counts, fine print */
  xs: 10,
  /** 12px — helper text, captions, metadata */
  sm: 12,
  /** 13px — secondary body text, labels */
  base: 13,
  /** 14px — primary body text */
  md: 14,
  /** 15px — menu items, list titles */
  lg: 15,
  /** 16px — screen titles, emphasis */
  xl: 16,
  /** 17px — product names, primary content */
  xxl: 17,
  /** 18px — section headers */
  title: 18,
  /** 20px — screen headlines */
  headline: 20,
  /** 24px — hero text */
  hero: 24,
  /** 28px — large hero text */
  heroLg: 28,
  /** 32px — display text */
  display: 32,
} as const;

/** Font weight scale */
export const FONT_WEIGHTS = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

/** Line height scale */
export const LINE_HEIGHTS = {
  /** Tight — headlines, display text */
  tight: 1.15,
  /** Snug — buttons, labels */
  snug: 1.25,
  /** Normal — body text */
  normal: 1.5,
  /** Relaxed — long-form reading */
  relaxed: 1.65,
} as const;

// ─────────────────────────────────────────────────────────────
// SHADOWS & ELEVATION
// ─────────────────────────────────────────────────────────────

/** Shadow definitions for elevation levels */
export const SHADOW = {
  /** Level 0 — no shadow */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Level 1 — subtle lift (cards at rest) */
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  /** Level 2 — moderate lift (cards on hover, dropdowns) */
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Level 3 — prominent lift (floating elements, modals) */
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Level 4 — maximum lift (FAB, toast, sheet) */
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  /** Colored glow — for accent elements (CTA buttons, badges) */
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  }),
} as const;

// ─────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────

/** Standard header geometry for consistent screen headers */
export const HEADER = {
  /** Padding above content (add to insets.top) */
  topPad: SPACING.md,
  /** Title font size for utility/list screens */
  titleSize: FONT_SIZES.xl,
  /** Default header height (excluding safe area) */
  height: 56,
  /** Horizontal padding */
  paddingHorizontal: SPACING.lg,
} as const;

// ─────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────

/** Standard icon sizes */
export const ICON_SIZES = {
  /** 12px — inline indicators, dots */
  xxs: 12,
  /** 16px — inline icons, badges */
  xs: 16,
  /** 20px — list item icons, secondary actions */
  sm: 20,
  /** 24px — standard icons, tab bar icons */
  md: 24,
  /** 26px — tab bar icons (current size) */
  tab: 26,
  /** 28px — feature icons, section headers */
  lg: 28,
  /** 32px — prominent icons, empty states */
  xl: 32,
  /** 35px — action rail icons (feed), large feature icons */
  xxl: 35,
  /** 48px — hero icons, error states */
  hero: 48,
  /** 72px — empty state illustrations */
  illustration: 72,
} as const;

// ─────────────────────────────────────────────────────────────
// TOUCH TARGETS
// ─────────────────────────────────────────────────────────────

/** Minimum touch target sizes for accessibility */
export const TOUCH = {
  /** 44px — Apple HIG minimum for interactive elements */
  min: 44,
  /** 48px — Material Design recommended minimum */
  recommended: 48,
  /** 56px — Large touch targets (FAB, primary actions) */
  large: 56,
} as const;

// ─────────────────────────────────────────────────────────────
// MOTION
// ─────────────────────────────────────────────────────────────

/** Animation duration tokens */
export const DURATION = {
  /** 100ms — micro interactions (opacity, scale) */
  instant: 100,
  /** 150ms — fast transitions (hover, focus) */
  fast: 150,
  /** 200ms — standard transitions (screen transitions) */
  normal: 200,
  /** 250ms — current screen transition default */
  screen: 220,
  /** 300ms — slower transitions (sheet open/close) */
  slow: 300,
  /** 400ms — complex animations (shared element) */
  complex: 400,
} as const;

/**
 * Easing curves — NOT for direct use with Animated.timing.
 *
 * React Native's Animated API accepts Easing functions from 'react-native',
 * not CSS strings. These are documented here as design intent only.
 * When animating, import { Easing } from 'react-native' and use:
 *   Easing.inOut(Easing.ease)  → equivalent to 'standard'
 *   Easing.out(Easing.ease)   → equivalent to 'decelerate'
 *   Easing.in(Easing.ease)    → equivalent to 'accelerate'
 *   Easing.bezier(...)        → for custom curves like 'spring'
 *
 * For Reanimated (withTiming/withSpring), use Reanimated.Easing instead.
 */
export const EASING = {
  /** Standard ease-in-out — use Easing.inOut(Easing.ease) */
  standard: 'ease-in-out' as const,
  /** Decelerate — use Easing.out(Easing.ease) */
  decelerate: 'ease-out' as const,
  /** Accelerate — use Easing.in(Easing.ease) */
  accelerate: 'ease-in' as const,
  /** Spring-like bounce — use Easing.bezier(0.34, 1.56, 0.64, 1) */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)' as const,
} as const;

// ─────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────

/** Standard layout dimensions */
export const LAYOUT = {
  /** Tab bar height */
  tabBarHeight: 56,
  /** Tab bar bottom margin (accounts for safe area) */
  tabBarMarginBottom: 16,
  /** Maximum content width on larger screens */
  maxContentWidth: 640,
  /** Avatar sizes */
  avatar: {
    xs: 24,
    sm: 32,
    md: 36,
    lg: 48,
    xl: 64,
    xxl: 80,
    profile: 96,
  },
  /** Standard card heights */
  card: {
    sm: 120,
    md: 160,
    lg: 200,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/** Determine if a seller is verified based on stats */
export function isVerifiedSeller(stats: { avg_rating?: number; review_count?: number; sales_count?: number }): boolean {
  return (
    (stats.avg_rating ?? 0) >= 4.5 &&
    (stats.review_count ?? 0) >= 10 &&
    (stats.sales_count ?? 0) >= 20
  );
}

/** Get display name for a seller, preferring store identity when set */
export function getDisplayName(seller: { full_name?: string; store_name?: string | null; use_store_identity?: boolean; username?: string | null } | null | undefined): string {
  if (!seller) return 'Seller';
  if (seller.use_store_identity && seller.store_name) return seller.store_name;
  return seller.username || (seller.full_name || 'Seller');
}

/** Get avatar URL for a seller, preferring store logo when identity is set */
export function getSellerAvatar(seller: { avatar_url?: string | null; store_logo_url?: string | null; use_store_identity?: boolean } | null | undefined): string | null {
  if (!seller) return null;
  if (seller.use_store_identity && seller.store_logo_url) return seller.store_logo_url;
  return seller.avatar_url || null;
}

/** Format a number as a locale-aware price string */
export function formatPrice(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0';
  return n.toLocaleString();
}
