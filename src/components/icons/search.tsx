import React from 'react';
import { Svg, Circle, Line } from 'react-native-svg';

export function SearchIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10" cy="10" r="6.5" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="15" y1="15" x2="20.5" y2="20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
