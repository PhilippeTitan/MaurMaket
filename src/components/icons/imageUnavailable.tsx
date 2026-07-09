import React from 'react';
import { Svg, Rect, Circle, Path, Line } from 'react-native-svg';

export function ImageUnavailableIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="8.5" cy="10" r="1.6" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4 17l4.5-5 3.5 3.5L16 11l4.5 5.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
