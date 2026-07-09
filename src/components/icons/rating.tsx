import React from 'react';
import { Svg, Path } from 'react-native-svg';

export function RatingIcon({ size = 24, color = '#E6EDF3', strokeWidth = 1.75 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.5l2.9 6 6.6.6-5 4.5 1.5 6.4L12 16.9l-5.9 3.1 1.5-6.4-5-4.5 6.6-.6z" fill={color} stroke="none" />
    </Svg>
  );
}
