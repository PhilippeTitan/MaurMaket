import React from 'react';
import { Svg, Rect } from 'react-native-svg';

export function QrCodeIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="5.4" y="5.4" width="1.6" height="1.6" fill={color} stroke="none" />
      <Rect x="15" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="17.4" y="5.4" width="1.6" height="1.6" fill={color} stroke="none" />
      <Rect x="3" y="15" width="6" height="6" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="5.4" y="17.4" width="1.6" height="1.6" fill={color} stroke="none" />
      <Rect x="14" y="14" width="2" height="2" fill={color} stroke="none" />
      <Rect x="18" y="14" width="2" height="2" fill={color} stroke="none" />
      <Rect x="14" y="18" width="2" height="2" fill={color} stroke="none" />
      <Rect x="18" y="18" width="2" height="2" fill={color} stroke="none" />
      <Rect x="16" y="16" width="2" height="2" fill={color} stroke="none" />
    </Svg>
  );
}
