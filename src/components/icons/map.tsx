import React from 'react';
import { Svg, Path, Circle, Ellipse } from 'react-native-svg';

export function MapIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2c-3.3 0-6 2.6-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.4-2.7-6-6-6z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="8" r="2" stroke={color} strokeWidth={strokeWidth} />
      <Ellipse cx="12" cy="21" rx="5.5" ry="1.4" stroke={color} strokeWidth={strokeWidth} strokeDasharray="2 2" />
    </Svg>
  );
}
