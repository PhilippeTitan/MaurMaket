import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function UserIcon({ size = 24, color = '#8B949E' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.5" />
      <Path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
