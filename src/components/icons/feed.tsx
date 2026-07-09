import React from 'react';
import { Svg, Path } from 'react-native-svg';

export function FeedIcon({ size = 24, color = '#E6EDF3' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2c1 3-2 4-2 7a2 2 0 104 0c0-1-.5-1.8-1-2.5.5 2 3 3.5 3 6.5 0 3.3-2.7 6-6 6s-6-2.7-6-6c0-4 3-5.5 4-7 .3 1.5 0 2.5-.5 3.5C8 8 9 5 12 2z" fill={color} stroke="none" />
    </Svg>
  );
}
