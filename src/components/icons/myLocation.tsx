import React from 'react';
import { Svg, Circle, Line } from 'react-native-svg';

export function MyLocationIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.25" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="12" y1="2.5" x2="12" y2="5.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="18.5" x2="12" y2="21.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="2.5" y1="12" x2="5.5" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="18.5" y1="12" x2="21.5" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
    </Svg>
  );
}
