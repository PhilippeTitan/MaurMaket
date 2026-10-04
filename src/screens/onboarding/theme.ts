import { COLORS } from '../../theme';

export const ONBOARDING_COLORS = {
  bg0: COLORS.bg,
  bg1: COLORS.surface2,
  surface: COLORS.surface,
  surfaceHi: COLORS.surface2,
  border: COLORS.border,
  borderHi: COLORS.borderLight,
  text: COLORS.text,
  sub: COLORS.text2,
  faint: COLORS.text3,
  violet: COLORS.coral,
  pink: COLORS.coralLight,
  amber: COLORS.warning,
  mint: COLORS.green,
  white: COLORS.white,
  coral: COLORS.coral,
  blue: COLORS.blue,
  green: COLORS.green,
  yellow: COLORS.yellow,
  purple: COLORS.purple,
} as const;

export const ONBOARDING_GRADIENT = [COLORS.coral, COLORS.coral] as const;
