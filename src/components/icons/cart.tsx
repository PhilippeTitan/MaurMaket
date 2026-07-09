import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';

export function CartIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 4h2l2.2 11.2a2 2 0 002 1.6H17a2 2 0 002-1.7L20.5 8H6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="20" r="1.4" fill={color} stroke="none" />
      <Circle cx="17" cy="20" r="1.4" fill={color} stroke="none" />
    </Svg>
  );
}
