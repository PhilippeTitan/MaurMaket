import React from 'react';
import { Svg, Path, Rect } from 'react-native-svg';

export function SecureAccountIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="9.3" y="10.5" width="5.4" height="4.2" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M10.5 10.5V9a1.5 1.5 0 013 0v1.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
