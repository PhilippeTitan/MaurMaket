import React from 'react';
import { Svg, Path, Rect, Circle } from 'react-native-svg';

export function CameraIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 7l1.5-2.5h5L16 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="3" y="7" width="18" height="13" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="12" cy="13.5" r="3.5" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
