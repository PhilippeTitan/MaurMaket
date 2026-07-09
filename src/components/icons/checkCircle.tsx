import React from 'react';
import { Svg, Circle, Path } from 'react-native-svg';

export function CheckCircleIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.25" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 12.5l2.5 2.5L16.5 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
