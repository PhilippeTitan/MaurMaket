import React from 'react';
import { Svg, Path } from 'react-native-svg';

export function CheckIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 12.5L9 17l10.5-11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
