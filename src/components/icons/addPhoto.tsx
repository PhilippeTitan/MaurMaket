import React from 'react';
import { Svg, Path, Rect, Circle, Line } from 'react-native-svg';

export function AddPhotoIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 7l1.5-2.5H12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="2" y="7" width="15" height="12" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="9.5" cy="13" r="3" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="18" cy="6.5" r="3.4" fill="#FF4D6A" stroke="none" />
      <Line x1="18" y1="5" x2="18" y2="8" stroke="#0D1117" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="16.5" y1="6.5" x2="19.5" y2="6.5" stroke="#0D1117" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
