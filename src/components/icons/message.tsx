import React from 'react';
import { Svg, Rect, Path } from 'react-native-svg';

export function MessageIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="12" rx="3" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 17l-2 3v-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
