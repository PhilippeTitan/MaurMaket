import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken } from './api';

export async function registerForPushNotificationsAsync() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const token = await Notifications.getExpoPushTokenAsync();
    if (token?.data) {
      await savePushToken(token.data);
    }
    return token?.data || null;
  } catch (err) {
    console.error('Push registration failed:', err);
    return null;
  }
}

export function setupNotificationListeners(navigationRef: any) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (!navigationRef?.isReady?.()) return;

    switch (data?.type) {
      case 'order_status':
      case 'payment_confirmed':
      case 'payment_failed':
      case 'order_cancelled':
        if (data.orderId) navigationRef.navigate('OrderDetail', { orderId: data.orderId });
        break;
      case 'new_message':
        if (data.conversationId) navigationRef.navigate('Chat', { conversationId: data.conversationId, otherPartyName: '' });
        break;
      case 'meetup_proposed':
      case 'meetup_confirmed':
      case 'meetup_expired':
        if (data.orderId) navigationRef.navigate('Meetup', { orderId: data.orderId });
        break;
      case 'review_received':
      case 'order_note':
        navigationRef.navigate('Orders');
        break;
      case 'new_follower':
        navigationRef.navigate('MeTab');
        break;
      case 'verification_approved':
      case 'verification_rejected':
      case 'subscription_activated':
      case 'subscription_expired':
        navigationRef.navigate('Settings');
        break;
      case 'escrow_refunded':
      case 'payout_failed':
        navigationRef.navigate('Payments');
        break;
      case 'dispute_opened':
      case 'dispute_resolved':
        navigationRef.navigate('Orders');
        break;
      case 'new_product_from_followed':
        if (data.productId) navigationRef.navigate('ProductDetail', { productId: data.productId });
        break;
      default:
        navigationRef.navigate('Inbox');
        break;
    }
  });
}
