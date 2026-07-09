import React from 'react';
import { Svg, Path, Line, Rect } from 'react-native-svg';

export function StorefrontIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 8l1.5-4h15L21 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 8h18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="8" x2="8" y2="11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="8" x2="16" y2="11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="4" y="11" width="16" height="9" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="10" y="15" width="4" height="5" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
