import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

interface WelcomeMomentProps {
  name: string;
  onEnter: () => void;
}

export default function WelcomeMoment({ name, onEnter }: WelcomeMomentProps) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(8)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(btnOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const firstName = name.split(' ')[0] || name;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.checkCircle, { transform: [{ scale }], opacity }]}>
        <MaterialCommunityIcons name="check" size={40} color="#fff" />
      </Animated.View>

      <Animated.Text style={[styles.title, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
        You're in, {firstName}
      </Animated.Text>

      <Animated.Text style={[styles.subtitle, { opacity: textOpacity }]}>
        Your account's ready. Browsing, buying, and messaging sellers all work right away — verify your email whenever's convenient.
      </Animated.Text>

      <Animated.View style={[styles.btnWrap, { opacity: btnOpacity }]}>
        <TouchableOpacity style={styles.btn} onPress={onEnter} activeOpacity={0.8}>
          <Text style={styles.btnText}>Enter MaurMaket</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  checkCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: COLORS.coral,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 12,
  },
  title: {
    fontFamily: 'Syne',
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.text2,
    fontSize: 14.5,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
    marginBottom: 32,
  },
  btnWrap: {
    width: '100%',
  },
  btn: {
    backgroundColor: COLORS.coral,
    padding: 16,
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: COLORS.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
