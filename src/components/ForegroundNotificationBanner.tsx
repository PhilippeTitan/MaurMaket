import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { onForegroundNotification, type ForegroundNotification } from '../notifications';
import { routeNotification } from '../notificationRouting';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const URGENT_TYPES = new Set([
  'fulfillment_proposed',
  'fulfillment_countered',
  'fulfillment_accepted',
  'fulfillment_rejected',
  'meetup_proposed',
  'meetup_confirmed',
  'meetup_expired',
  'payment_confirmed',
  'payment_failed',
  'order_status',
  'dispute_opened',
  'dispute_resolved',
  'low_stock',
  'product_sold_out',
  'subscription_expired',
  'natcash_access_expiry',
  'new_message',
]);

interface Props {
  navigationRef: any;
}

export default function ForegroundNotificationBanner({ navigationRef }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [current, setCurrent] = useState<ForegroundNotification | null>(null);
  const queueRef = useRef<ForegroundNotification[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showNext = () => {
    if (queueRef.current.length === 0) {
      setCurrent(null);
      return;
    }
    const next = queueRef.current.shift()!;
    setCurrent(next);

    translateY.setValue(-120);
    opacity.setValue(0);

    if (reduceMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }

    // 5-second auto-dismiss
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      dismissCurrent();
    }, 5000);
  };

  const dismissCurrent = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (reduceMotion) {
      translateY.setValue(-120);
      opacity.setValue(0);
      showNext();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        showNext();
      });
    }
  };

  useEffect(() => {
    onForegroundNotification((notif) => {
      // Only show banner for urgent or action-needed events
      if (URGENT_TYPES.has(notif.type)) {
        if (!current) {
          queueRef.current.push(notif);
          showNext();
        } else {
          // Queue it so they display one at a time
          queueRef.current.push(notif);
        }
      }
    });

    return () => {
      onForegroundNotification(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current]);

  const handlePress = () => {
    if (!current) return;
    const item = current;
    dismissCurrent();
    if (navigationRef?.isReady?.()) {
      routeNotification(navigationRef, item.type, item.data);
    }
  };

  if (!current) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 6,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={current.title}
      >
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="bell-ring-outline" size={20} color={COLORS.coral} />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          {current.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {current.body}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismissCurrent}
          accessibilityLabel="Dismiss banner"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={16} color={COLORS.text2} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 99999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.coral + '50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.coral + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 2,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});
