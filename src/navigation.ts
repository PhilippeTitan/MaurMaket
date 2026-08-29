import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  EmailVerification: { code?: string } | undefined;
  ForgotPassword: { code?: string } | undefined;
};

export type TabParamList = {
  FeedTab: undefined;
  ExploreTab: undefined;
  InboxTab: undefined;
  MapTab: undefined;
  MeTab: undefined;
};

export type PreloadedSeller = {
  username?: string | null;
  full_name?: string | null;
  store_name?: string | null;
  avatar_url?: string | null;
  store_logo_url?: string | null;
  seller_tier?: string | null;
  bio?: string | null;
  use_store_identity?: boolean | null;
  location_city?: string | null;
  show_real_name?: boolean | null;
  created_at?: string | null;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<TabParamList>;
  ProductDetail: { productId: string };
  Cart: undefined;
  Checkout: { promoCode?: string } | undefined;
  AddListing: undefined;
  SellerOnboarding: undefined;
  Storefront: { sellerId: string; preloadedSeller?: PreloadedSeller };
  Settings: undefined;
  EditProfile: undefined;
  Orders: undefined;
  Inbox: { returnTab?: keyof TabParamList } | undefined;
  Chat: {
    conversationId: string;
    otherUserName: string;
    otherUserId?: string;
    otherUserAvatar?: string | null;
    otherUserStoreLogoUrl?: string | null;
    otherUserUseStoreIdentity?: boolean;
    otherUserTier?: string;
    draftOffer?: {
      productId: string;
      productName: string;
      listPrice: number;
    };
  };
  Verification: undefined;
  BusinessSubscription: undefined;
  OrderDetail: { orderId: string };
  Wishlist: undefined;
  Addresses: undefined;
  Payments: undefined;
  EditListing: { productId: string };
  SettingsEdit: { field: 'name' | 'email' | 'phone' | 'phones' | 'natcash_phone' | 'bio' | 'password' | 'storeName'; title: string };
  PaymentReturn: { orderId?: string; pendingId?: string };
  Meetup: { orderId: string };
  Notification: undefined;
  PromoManagement: undefined;
  Analytics: undefined;
  EmailVerification: { code?: string } | undefined;
  ForgotPassword: { code?: string } | undefined;
  LocationSettings: undefined;
  SellerToolsSettings: undefined;
  PrivacySettings: undefined;
  UsernameSettings: undefined;
  LanguageSettings: undefined;
  FollowList: { userId: string; kind: 'followers' | 'following'; title: string };
  OfferDetail: { messageId: string; conversationId: string };
  NatCashPayment: { orderId?: string; pendingId?: string; total: number; sellerName: string; sellerPhone: string };
};
