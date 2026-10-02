import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { useReduceMotion } from '../../hooks';

/**
 * Drives the profile's collapsing header.
 *
 * The identity header scrolls away naturally; once the in-flow tab bar reaches
 * the top, a compact bar (small avatar + username + Listings/Reviews) slides in.
 * `collapse` is an Animated value in [0,1] for opacity/translate, and
 * `collapsed` is a plain boolean (for pointerEvents and accessibility) flipped
 * by a scroll listener at the same threshold. Reduce Motion collapses instantly
 * instead of fading.
 *
 * `chrome` (0→1 over the first few pixels of scroll) solidifies the bar as soon
 * as content could slide under it, and `scrolled` is the matching boolean — the
 * profile picture must never show through the username.
 */
export function useProfileCollapse(tabBarY: number, topChrome: number) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const collapsedRef = useRef(false);
  const scrolledRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReduceMotion();

  // Before the in-flow tab bar has been measured the profile never collapses,
  // so a fresh render cannot flash the compact bar at scroll 0.
  const threshold = tabBarY > 0 ? Math.max(0, tabBarY - topChrome) : Number.MAX_SAFE_INTEGER;

  useEffect(() => {
    const id = scrollY.addListener(({ value }: { value: number }) => {
      const next = value > threshold + 6;
      if (next !== collapsedRef.current) {
        collapsedRef.current = next;
        setCollapsed(next);
      }
      const isScrolled = value > 4;
      if (isScrolled !== scrolledRef.current) {
        scrolledRef.current = isScrolled;
        setScrolled(isScrolled);
      }
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, threshold]);

  const collapse = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: reduceMotion ? [threshold, threshold + 1] : [threshold, threshold + 26],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY, threshold, reduceMotion],
  );

  const chrome = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: reduceMotion ? [0, 1] : [0, 16],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY, reduceMotion],
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: Platform.OS !== 'web',
      }),
    [scrollY],
  );

  const reset = useMemo(
    () => () => {
      scrollY.setValue(0);
      collapsedRef.current = false;
      scrolledRef.current = false;
      setCollapsed(false);
      setScrolled(false);
    },
    [scrollY],
  );

  return { scrollY, onScroll, collapse, collapsed, chrome, scrolled, reset };
}
