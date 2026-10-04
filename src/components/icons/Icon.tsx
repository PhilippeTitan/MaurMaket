import React from 'react';
import type { ColorValue } from 'react-native';
import { MaterialCommunityIcons } from './UnifiedIcon';
import { COLORS } from '../../theme';

export type IconName =
  | 'close' | 'close-circle' | 'check' | 'check-circle' | 'chevron-right'
  | 'back' | 'edit' | 'minus' | 'verified' | 'locked' | 'info' | 'alert'
  | 'storefront' | 'sale-tag' | 'cart' | 'package' | 'delivery' | 'offer-coin'
  | 'location-pin' | 'my-location' | 'camera' | 'add-photo' | 'image-unavailable'
  | 'rating' | 'rate-this' | 'message' | 'qr-code' | 'time' | 'secure-account'
  | 'search' | 'plus' | 'map' | 'user';

/** The single shared SVG icon family used throughout MaurMaket. */
export function Icon({ name, size = 24, color = COLORS.text, strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} strokeWidth={strokeWidth} />;
}
