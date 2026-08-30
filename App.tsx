import React, { useEffect, useState, useRef, Component, Suspense, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet, TouchableOpacity, Linking, Text, AppState, Modal, Pressable } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import { COLORS, SPACING, RADIUS, SHADOW, FONT_SIZES, FONT_WEIGHTS, FONTS, DURATION, ICON_SIZES, TOUCH, LAYOUT } from './src/theme';
import { i18n } from './src/i18n';
import { network } from './src/network';
import { offlineQueue } from './src/offlineQueue';
import OfflineBanner from './src/components/OfflineBanner';
import { PaperPlaneIcon } from './src/components/UserAvatar';
import { getMe, getFollowerCount, getFollowing, getConversationUnreadCount } from './src/api';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, invalidateUser } from './src/hooks';
import { ToastProvider } from './src/components/Toast';
import { registerForPushNotificationsAsync, setupNotificationListeners } from './src/notifications';
import type { User } from './src/types';
import type { RootStackParamList, AuthStackParamList, TabParamList } from './src/navigation';

import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import EmailVerificationScreen from './src/screens/EmailVerificationScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import FeedScreen from './src/screens/FeedScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import InboxScreen from './src/screens/InboxScreen';
const MapScreen = React.lazy(() => import('./src/screens/MapScreen'));
import MeScreen from './src/screens/MeScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import AddListingScreen from './src/screens/AddListingScreen';
import StorefrontScreen from './src/screens/StorefrontScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import ChatScreen from './src/screens/ChatScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import BusinessSubscriptionScreen from './src/screens/BusinessSubscriptionScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import WishlistScreen from './src/screens/WishlistScreen';
import AddressesScreen from './src/screens/AddressesScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import SellerOnboardingScreen from './src/screens/SellerOnboardingScreen';
import EditListingScreen from './src/screens/EditListingScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsEditScreen from './src/screens/SettingsEditScreen';
import LocationSettingsScreen from './src/screens/LocationSettingsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import SellerToolsSettingsScreen from './src/screens/SellerToolsSettingsScreen';
import PrivacySettingsScreen from './src/screens/PrivacySettingsScreen';
import UsernameSettingsScreen from './src/screens/UsernameSettingsScreen';
import LanguageSettingsScreen from './src/screens/LanguageSettingsScreen';
import OfferDetailScreen from './src/screens/OfferDetailScreen';
import PaymentReturnScreen from './src/screens/PaymentReturnScreen';
import NatCashPaymentScreen from './src/screens/NatCashPaymentScreen';
import PromoManagementScreen from './src/screens/PromoManagementScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import DobConfirmModal from './src/components/DobConfirmModal';
import TasteOnboarding from './src/components/TasteOnboarding';
import FollowListScreen from './src/screens/FollowListScreen';

const MeetupScreen = React.lazy(() => import('./src/screens/MeetupScreen'));

function LazyMapScreen(props: any) {
  return <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>}><MapScreen {...props} /></Suspense>;
}
function LazyMeetupScreen(props: any) {
  return <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>}><MeetupScreen {...props} /></Suspense>;
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.coral} />
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>Something went wrong</Text>
          <Text style={{ color: COLORS.text2, fontSize: 13, marginTop: 6, textAlign: 'center' }}>Please restart the app.</Text>
          <TouchableOpacity onPress={() => this.setState({ hasError: false })} style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: COLORS.coral }}>
            <Text style={{ color: COLORS.white, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #0D1117 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade', animationDuration: DURATION.screen, contentStyle: { backgroundColor: COLORS.bg } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="EmailVerification" component={EmailVerificationScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  const insets = require('react-native-safe-area-context').useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const poll = async () => {
        try {
          const res = await getConversationUnreadCount() as { count: number };
          if (active) setUnreadCount(res.count || 0);
        } catch {}
      };
      poll();
      const interval = setInterval(poll, 20000);
      return () => { active = false; clearInterval(interval); };
    }, [])
  );

  return (
    <View style={styles.mainShell}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          animation: 'none',
          // NOTE: height + marginBottom here define the tab bar's on-screen
          // position. MapScreen.tsx has its own TAB_BAR_TOP_OFFSET constant
          // that mirrors this exact math (for the radial FAB + seller sheet,
          // which need to sit just above the tab bar). If you change
          // height/marginBottom here, update TAB_BAR_TOP_OFFSET in
          // MapScreen.tsx to match, or those elements will drift out of
          // alignment with the tab bar again.
          tabBarStyle: {
            backgroundColor: COLORS.surface,
            borderRadius: RADIUS.fab,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingBottom: 0,
            paddingTop: 0,
            height: LAYOUT.tabBarHeight,
            marginBottom: insets.bottom > 0 ? insets.bottom + SPACING.xs : LAYOUT.tabBarMarginBottom,
            marginHorizontal: SPACING.lg,
            ...SHADOW.lg,
            position: 'absolute',
          },
          tabBarActiveTintColor: COLORS.coral,
          tabBarInactiveTintColor: COLORS.text2,
          tabBarIconStyle: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        }}
      >
        <Tab.Screen
          name="FeedTab"
          component={FeedScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="fire" size={ICON_SIZES.tab} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ExploreTab"
          component={ExploreScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="magnify" size={ICON_SIZES.tab} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="InboxTab"
          component={InboxScreen}
          options={{
            tabBarIcon: () => null,
            tabBarButton: (props) => (
              <TouchableOpacity
                style={styles.fabContainer}
                onPress={props.onPress}
                activeOpacity={0.8}
              >
                  <View style={styles.fab}>
                    <PaperPlaneIcon size={ICON_SIZES.tab} color={COLORS.text} />
                  </View>
                  {unreadCount > 0 && <View style={styles.inboxDot} />}
              </TouchableOpacity>
            ),
          }}
        />
        <Tab.Screen
          name="MapTab"
          component={LazyMapScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="map-marker-radius-outline" size={ICON_SIZES.tab} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MeTab"
          component={MeScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="account" size={ICON_SIZES.tab} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [pendingDob, setPendingDob] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState<{ title: string; message: string; onRetry: () => void } | null>(null);

  useEffect(() => {
    (async () => {
      await store.init();
      await i18n.init();
      await network.init();
      await offlineQueue.init();
      if (store.token) {
        const hydrateSession = async () => {
          try {
            const res = await getMe() as { user: User };
            await store.setUser(res.user, store.token);
          registerForPushNotificationsAsync();
          // Preload follower/following counts so MeScreen has them instantly
          if (res.user?.id) {
            getFollowerCount(res.user.id).then((r: any) => store.setFollowerCount(r?.count || 0)).catch(() => {});
            getFollowing().then((r: any) => {
              const list = r?.following || [];
              store.setFollowingList(list.map((f: any) => f.seller_id || f.id).filter(Boolean));
              store.setFollowingCount(list.length);
            }).catch(() => {});
          }
          } catch (err: any) {
            const msg = err?.message || '';
            const isAuthError = msg.includes('Unauthorized') || msg.includes('Invalid token') || msg.includes('User not found');
            if (isAuthError) {
              await store.logout();
            }
            // Network errors, timeouts, backend down — keep cached session
          }
        };
        if (store.user) {
          // The encrypted profile snapshot makes repeat launches feel immediate;
          // the server still validates the token and refreshes the profile in background.
          queryClient.setQueryData(['user'], store.user);
          void hydrateSession();
        } else {
          await hydrateSession();
        }
      }
      setIsLoggedIn(store.isLoggedIn);
      setPendingDob(!!store.user?.pending_dob);
    })();

    const unsub = store.onChange(() => {
      setIsLoggedIn(store.isLoggedIn);
      setPendingDob(!!store.user?.pending_dob);
    });
    return unsub;
  }, []);

  const pendingDeepLink = useRef<string | null>(null);
  const pendingDeepLinkType = useRef<string | null>(null);

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (url.includes('payment-return')) {
        const match = url.match(/orderId=([^&]+)/);
        const orderId = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('PaymentReturn', { orderId });
        } else {
          pendingDeepLink.current = orderId || null;
          pendingDeepLinkType.current = 'payment-return';
        }
      } else if (url.includes('maurmaket://verify')) {
        const match = url.match(/code=([^&]+)/);
        const code = match?.[1];
        if (store.isLoggedIn) {
          if (navigationRef.isReady()) {
            navigationRef.navigate('EmailVerification', { code });
          } else {
            pendingDeepLink.current = code || null;
            pendingDeepLinkType.current = 'verify';
          }
        }
      } else if (url.includes('maurmaket://reset-password')) {
        const match = url.match(/code=([^&]+)/);
        const code = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('Auth', { screen: 'ForgotPassword', params: { code } });
        } else {
          pendingDeepLink.current = code || null;
          pendingDeepLinkType.current = 'reset-password';
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (url.includes('payment-return')) {
        const match = url.match(/orderId=([^&]+)/);
        const orderId = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('PaymentReturn', { orderId });
        } else {
          pendingDeepLink.current = orderId || null;
          pendingDeepLinkType.current = 'payment-return';
        }
      } else if (url.includes('maurmaket://verify')) {
        const match = url.match(/code=([^&]+)/);
        const code = match?.[1];
        if (store.isLoggedIn) {
          if (navigationRef.isReady()) {
            navigationRef.navigate('EmailVerification', { code });
          } else {
            pendingDeepLink.current = code || null;
            pendingDeepLinkType.current = 'verify';
          }
        }
      } else if (url.includes('maurmaket://reset-password')) {
        const match = url.match(/code=([^&]+)/);
        const code = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('Auth', { screen: 'ForgotPassword', params: { code } });
        } else {
          pendingDeepLink.current = code || null;
          pendingDeepLinkType.current = 'reset-password';
        }
      }
    }).catch(() => {});

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setupNotificationListeners(navigationRef);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (status) => {
      if (status === 'active' && store.isLoggedIn) {
        invalidateUser();
        // Check for abandoned payment — user returned to app without completing MonCash
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const raw = await AsyncStorage.getItem('mm_pending_payment');
          if (!raw) return;
          const { pendingId, orderId: pendingOrderId, createdAt } = JSON.parse(raw);
          // Skip if less than 5s ago (user just left, still might be paying)
          if (Date.now() - createdAt < 5000) return;
          await AsyncStorage.removeItem('mm_pending_payment');
          const nav = navigationRef.current;
          if (!nav) return;
          if (pendingId) {
            const { checkPendingStatus, reportAbandonedPayment } = await import('./src/api');
            const res = await checkPendingStatus(pendingId) as { status: string; orderId?: string };
            if (res.status === 'pending') {
              reportAbandonedPayment({ pendingId }).catch(() => {});
              setPaymentFailed({
                title: 'Payment not completed',
                message: 'Your payment was not processed. Your items are still in your cart.',
                onRetry: () => nav.navigate('Checkout'),
              });
            }
          } else if (pendingOrderId) {
            const { getOrder, reportAbandonedPayment } = await import('./src/api');
            const res = await getOrder(pendingOrderId) as { order?: { status: string } };
            if (res.order?.status === 'pending') {
              reportAbandonedPayment({ orderId: pendingOrderId }).catch(() => {});
              setPaymentFailed({
                title: 'Payment not completed',
                message: 'Your payment was not processed. You can retry from the order details.',
                onRetry: () => nav.navigate('OrderDetail', { orderId: pendingOrderId }),
              });
            }
          }
        } catch {}
      }
    });
    return () => sub.remove();
  }, []);

  if (isLoggedIn === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.coral} />
      </View>
    );
  }

  const appContent = (
    <NavigationContainer ref={navigationRef} onReady={() => {
      if (pendingDeepLink.current) {
        const value = pendingDeepLink.current;
        const type = pendingDeepLinkType.current;
        pendingDeepLink.current = null;
        pendingDeepLinkType.current = null;
        if (type === 'payment-return') {
          navigationRef.navigate('PaymentReturn', { orderId: value });
        } else if (type === 'verify' && store.isLoggedIn) {
          navigationRef.navigate('EmailVerification', { code: value });
        } else if (type === 'reset-password') {
          navigationRef.navigate('Auth', { screen: 'ForgotPassword', params: { code: value } });
        }
      }
    }}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: DURATION.screen, contentStyle: { backgroundColor: COLORS.bg } }}>
        {!isLoggedIn ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="AddListing" component={AddListingScreen} />
            <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} />
            <Stack.Screen name="Storefront" component={StorefrontScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Orders" component={OrdersScreen} />
            <Stack.Screen name="Inbox" component={InboxScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="BusinessSubscription" component={BusinessSubscriptionScreen} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen name="Addresses" component={AddressesScreen} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="EditListing" component={EditListingScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="SettingsEdit" component={SettingsEditScreen} />
            <Stack.Screen name="LocationSettings" component={LocationSettingsScreen} />
            <Stack.Screen name="SellerToolsSettings" component={SellerToolsSettingsScreen} />
            <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
            <Stack.Screen name="UsernameSettings" component={UsernameSettingsScreen} />
            <Stack.Screen name="LanguageSettings" component={LanguageSettingsScreen} />
            <Stack.Screen name="FollowList" component={FollowListScreen} />
            <Stack.Screen name="OfferDetail" component={OfferDetailScreen} />
            <Stack.Screen name="PaymentReturn" component={PaymentReturnScreen} />
            <Stack.Screen name="NatCashPayment" component={NatCashPaymentScreen} />
            <Stack.Screen name="Meetup" component={LazyMeetupScreen} />
            <Stack.Screen name="PromoManagement" component={PromoManagementScreen} />
            <Stack.Screen name="Notification" component={NotificationScreen} />
            <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  return <QueryClientProvider client={queryClient}><SafeAreaProvider><ToastProvider><ErrorBoundary><OfflineBanner />{appContent}<DobConfirmModal visible={pendingDob} onCompleted={() => setPendingDob(false)} />{isLoggedIn && store.user?.taste_onboarding_completed === false && <TasteOnboarding />}<Modal visible={!!paymentFailed} transparent animationType="fade"><Pressable style={pmStyles.overlay} onPress={() => setPaymentFailed(null)}><Pressable style={pmStyles.card} onPress={() => {}}><View style={pmStyles.iconWrap}><MaterialCommunityIcons name="alert-circle-outline" size={48} color={COLORS.coral} /></View><Text style={pmStyles.title}>{paymentFailed?.title}</Text><Text style={pmStyles.message}>{paymentFailed?.message}</Text><TouchableOpacity style={pmStyles.retryBtn} onPress={() => { paymentFailed?.onRetry(); setPaymentFailed(null); }}><Text style={pmStyles.retryText}>Retry Payment</Text></TouchableOpacity><TouchableOpacity style={pmStyles.cancelBtn} onPress={() => setPaymentFailed(null)}><Text style={pmStyles.cancelText}>Cancel</Text></TouchableOpacity></Pressable></Pressable></Modal></ErrorBoundary></ToastProvider></SafeAreaProvider></QueryClientProvider>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainShell: {
    flex: 1,
  },
  fabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: LAYOUT.tabBarHeight,
    height: LAYOUT.tabBarHeight,
    borderRadius: RADIUS.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.coral,
  },
});

const pmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 28, width: '82%', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  iconWrap: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 14, color: COLORS.text2, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  retryBtn: { backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 10 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelBtn: { paddingVertical: 10 },
  cancelText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },
});
