export const COLORS = {
  bg: '#0D1117',
  surface: '#161B22',
  surface2: '#1C2235',
  border: '#21262D',
  text: '#E6EDF3',
  text2: '#8B949E',
  coral: '#FF4D6A',
  blue: '#00C2FF',
  green: '#00E5A0',
  yellow: '#FFD166',
  white: '#FFFFFF',
  error: '#FF4D6A',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// Unified corner-radius scale. Use these instead of one-off numbers so every
// button/card/pill in the app shares the same visual language.
export const RADIUS = {
  // Rows inside a list/settings card (Settings rows, Address rows, etc.)
  row: 10,
  // Cards / surfaces (settings card, balance card, info card)
  card: 12,
  // Media cards (product cards, image-bearing tiles)
  media: 16,
  // Primary CTA buttons (Save, Submit, Checkout, Subscribe)
  button: 12,
  // Pill-shaped buttons (auth screens, follow/message, tab-style chips)
  pill: 20,
  // Fully round badges/avatars use 999 or half of width/height as before.
  full: 999,
};

// Standard header heights/paddings so every screen's top bar lines up.
export const HEADER = {
  // Use with insets.top: paddingTop: insets.top + HEADER.topPad
  topPad: SPACING.md,
  // Title font size for utility/list screens (Settings, Cart, Orders list rows etc.)
  titleSize: 16,
};

export const FONTS = {
  heading: 'Syne',
  body: 'Inter',
};

export const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 24,
  elevation: 8,
};

export function isVerifiedSeller(stats: { avg_rating?: number; review_count?: number; sales_count?: number }): boolean {
  return (
    (stats.avg_rating ?? 0) >= 4.5 &&
    (stats.review_count ?? 0) >= 10 &&
    (stats.sales_count ?? 0) >= 20
  );
}

export function getDisplayName(seller: { full_name?: string; store_name?: string | null; use_store_identity?: boolean } | null | undefined): string {
  if (!seller) return 'Seller';
  if (seller.use_store_identity && seller.store_name) return seller.store_name;
  return seller.full_name || 'Seller';
}

export function getSellerAvatar(seller: { avatar_url?: string | null; store_logo_url?: string | null; use_store_identity?: boolean } | null | undefined): string | null {
  if (!seller) return null;
  if (seller.use_store_identity && seller.store_logo_url) return seller.store_logo_url;
  return seller.avatar_url || null;
}

export function formatPrice(n: number): string {
  if (n >= 1000 && n % 1000 === 0) {
    return `${n / 1000}K`;
  }
  return n.toLocaleString();
}