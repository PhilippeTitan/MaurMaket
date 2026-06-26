import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  FeedTab: undefined;
  ExploreTab: undefined;
  SellTab: undefined;
  MapTab: undefined;
  MeTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<TabParamList>;
  ProductDetail: { productId: string };
  Cart: undefined;
  Checkout: { promoCode?: string } | undefined;
  AddListing: undefined;
  SellerOnboarding: undefined;
  Storefront: { sellerId: string };
  Settings: undefined;
  Orders: undefined;
  Inbox: { returnTab?: keyof TabParamList } | undefined;
  Chat: {
    conversationId: string;
    otherUserName: string;
    draftOffer?: {
      productId: string;
      productName: string;
      listPrice: number;
    };
  };
  Notifications: undefined;
  OrderDetail: { orderId: string };
  Wishlist: undefined;
  Addresses: undefined;
  Payments: undefined;
  EditListing: { productId: string };
  SettingsEdit: { field: 'name' | 'email' | 'phone' | 'bio' | 'password' | 'storeName'; title: string };
  PaymentReturn: { orderId?: string };
};
