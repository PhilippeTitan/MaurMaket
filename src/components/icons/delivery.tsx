import React from 'react';
import { Svg, Rect, Path, Circle } from 'react-native-svg';

export function DeliveryIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="9" width="11" height="8" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M13 12h4l3 3v2h-7z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="7" cy="19" r="1.6" fill={color} stroke="none" />
      <Circle cx="17" cy="19" r="1.6" fill={color} stroke="none" />
    </Svg>
  );
}
