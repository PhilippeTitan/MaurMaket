import React from 'react';
import { Svg, Path, Circle, Line } from 'react-native-svg';

export function OfferCoinIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 13c0-1 .9-1.8 1.9-1.8H10l3.6 1.3c1 .35 1 1.7 0 2.1l-4.6 1.6H6.4a1.9 1.9 0 01-1.9-1.9z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.3 11.2V7.6a1.2 1.2 0 012.4 0v3.2M8.7 11V6.4a1.2 1.2 0 012.4 0V11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="18" cy="7.5" r="3" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="18" y1="6" x2="18" y2="9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
