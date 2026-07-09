import React from 'react';
import { Svg, Rect, Path } from 'react-native-svg';

export function LockedIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 11V8a4 4 0 018 0v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
