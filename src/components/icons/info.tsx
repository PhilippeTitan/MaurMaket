import React from 'react';
import { Svg, Circle, Line } from 'react-native-svg';

export function InfoIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.25" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="12" y1="11" x2="12" y2="16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="8" r="1" fill={color} stroke="none" />
    </Svg>
  );
}
