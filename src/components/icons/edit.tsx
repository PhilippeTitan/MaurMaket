import React from 'react';
import { Svg, Path, Line } from 'react-native-svg';

export function EditIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20l1-4.2L15.8 5a2 2 0 012.8 0l1.4 1.4a2 2 0 010 2.8L9.2 19 5 20z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="14" y1="7" x2="17" y2="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
