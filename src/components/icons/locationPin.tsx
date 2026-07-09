import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';

export function LocationPinIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2c-3.3 0-6 2.6-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.4-2.7-6-6-6z" fill={color} stroke="none" />
      <Circle cx="12" cy="8" r="2" fill="#161B22" stroke="none" />
    </Svg>
  );
}
