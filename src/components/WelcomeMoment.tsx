import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';

interface WelcomeMomentProps {
  name: string;
  onEnter: () => void;
}

export default function WelcomeMoment({ name, onEnter }: WelcomeMomentProps) {
  const circleScale = useRef(new Animated.Value(0.55)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.82)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(12)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnY = useRef(new Animated.Value(10)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(circleScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(circleOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(ringScale, { toValue: 1.15, friction: 7, tension: 55, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(btnY, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }),
      ]),
    ]).start();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, [circleScale, circleOpacity, ringScale, ringOpacity, textOpacity, textY, btnOpacity, btnY, shimmer]);

  const firstName = name.split(' ')[0] || name;
  const shimmerY = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });
  const buttonScale = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.015, 1] });

  return (
    <View style={styles.container}>
      <View style={styles.visual}>
        <Animated.View style={[styles.outerRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={[styles.innerRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: circleScale }], opacity: circleOpacity }]}> 
          <MaterialCommunityIcons name="check" size={40} color="#fff" />
        </Animated.View>
        <Animated.View style={[styles.spark, styles.sparkOne, { transform: [{ translateY: shimmerY }] }]} />
        <Animated.View style={[styles.spark, styles.sparkTwo, { transform: [{ translateY: Animated.multiply(shimmerY, -1) }] }]} />
      </View>

      <Animated.Text style={[styles.eyebrow, { opacity: textOpacity }]}>Account created</Animated.Text>
      <Animated.Text style={[styles.title, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>You're in, {firstName}.</Animated.Text>
      <Animated.Text style={[styles.subtitle, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>MaurMaket is ready. Browse, buy, sell, and message with your account.</Animated.Text>

      <Animated.View style={[styles.btnWrap, { opacity: btnOpacity, transform: [{ translateY: btnY }, { scale: buttonScale }] }]}>
        <TouchableOpacity style={styles.btn} onPress={onEnter} activeOpacity={0.86}>
          <Text style={styles.btnText}>Enter MaurMaket</Text>
          <View style={styles.btnIcon}><MaterialCommunityIcons name="arrow-right" size={18} color="#fff" /></View>
        </TouchableOpacity>
      </Animated.View>

      <Text style={styles.footerText}>You can finish verification and profile setup later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  visual: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  outerRing: { position: 'absolute', width: 146, height: 146, borderRadius: 73, borderWidth: 1, borderColor: COLORS.coral, opacity: 0.15 },
  innerRing: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 1, borderColor: COLORS.coral, opacity: 0.22 },
  checkCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 32, elevation: 12 },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.coral, opacity: 0.7 },
  sparkOne: { top: 20, right: 15 },
  sparkTwo: { bottom: 24, left: 16, width: 4, height: 4, borderRadius: 2, opacity: 0.45 },
  eyebrow: { color: COLORS.coral, fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.85, marginBottom: 7 },
  title: { fontFamily: 'Syne', fontSize: 30, lineHeight: 34, fontWeight: '800', color: COLORS.text, marginBottom: 9, textAlign: 'center' },
  subtitle: { color: COLORS.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310, marginBottom: 28 },
  btnWrap: { width: '100%' },
  btn: { minHeight: 56, backgroundColor: COLORS.coral, paddingHorizontal: 17, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 8 },
  btnText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  btnIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  footerText: { color: COLORS.text2, fontSize: 11.5, marginTop: 15, textAlign: 'center' },
});