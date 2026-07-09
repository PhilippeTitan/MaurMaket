import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';

export function SaleTagIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12.5L12.5 20a1.5 1.5 0 01-2.1 0l-6.4-6.4a1.5 1.5 0 010-2.1L11.5 4H19a1 1 0 011 1v7.5z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="15.4" cy="8.6" r="1.3" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
