import React, { useEffect, useState, Component, Suspense } from 'react';
import { ActivityIndicator, View, StyleSheet, TouchableOpacity, Linking, Text } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import { COLORS, SPACING } from './src/theme';
import { i18n } from './src/i18n';
import { getMe } from './src/api';
import type { User } from './src/types';
import type { RootStackParamList, AuthStackParamList, TabParamList } from './src/navigation';

import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
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
import SettingsEditScreen from './src/screens/SettingsEditScreen';
import PaymentReturnScreen from './src/screens/PaymentReturnScreen';

const MeetupScreen = React.lazy(() => import('./src/screens/MeetupScreen'));

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
          <TouchableOpacity onPress={() => {}} style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: COLORS.coral }}>
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
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  const insets = require('react-native-safe-area-context').useSafeAreaInsets();
  return (
    <View style={styles.mainShell}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: COLORS.surface,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom - 4 : 0,
            paddingTop: 0,
            height: 56 + (insets.bottom > 0 ? insets.bottom : 0),
            marginBottom: insets.bottom > 0 ? 8 : 16,
            marginHorizontal: 16,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
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
              <MaterialCommunityIcons name="fire" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ExploreTab"
          component={ExploreScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="magnify" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="SellTab"
          component={View}
          options={{
            tabBarIcon: () => null,
            tabBarButton: (props) => (
              <TouchableOpacity
                style={styles.fabContainer}
                onPress={props.onPress}
                activeOpacity={0.8}
              >
                <View style={styles.fab}>
                  <MaterialCommunityIcons name="plus" size={26} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            ),
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              const target = store.isSeller ? 'AddListing' : 'SellerOnboarding';
              (navigation as any).getParent()?.navigate(target);
            },
          })}
        />
        <Tab.Screen
          name="MapTab"
          component={MapScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="map-marker-radius-outline" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MeTab"
          component={MeScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="account" size={26} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      await store.init();
      await i18n.init();
      if (store.token) {
        try {
          const res = await getMe() as { user: User };
          await store.setUser(res.user, store.token);
        } catch {
          await store.logout();
        }
      }
      setIsLoggedIn(store.isLoggedIn);
    })();

    const unsub = store.onChange(() => {
      setIsLoggedIn(store.isLoggedIn);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (url.includes('payment-return')) {
        const match = url.match(/orderId=([^&]+)/);
        const orderId = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('PaymentReturn', { orderId });
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url && url.includes('payment-return')) {
        const match = url.match(/orderId=([^&]+)/);
        const orderId = match?.[1];
        if (navigationRef.isReady()) {
          navigationRef.navigate('PaymentReturn', { orderId });
        }
      }
    }).catch(() => {});

    const sub = Linking.addEventListener('url', handleDeepLink);
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
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Cart" component={CartScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="AddListing" component={AddListingScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} />
            <Stack.Screen name="Storefront" component={StorefrontScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
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
            <Stack.Screen name="SettingsEdit" component={SettingsEditScreen} />
            <Stack.Screen name="PaymentReturn" component={PaymentReturnScreen} />
            <Stack.Screen name="Meetup" component={MeetupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  return <SafeAreaProvider><ErrorBoundary><Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={COLORS.coral} /></View>}>{appContent}</Suspense></ErrorBoundary></SafeAreaProvider>;
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
