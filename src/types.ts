export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  natcash_phone: string | null;
  accepted_payment_methods: string[] | null;
  role: 'buyer' | 'seller' | 'admin';
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  store_name: string | null;
  store_logo_url: string | null;
  seller_tier: 'none' | 'casual' | 'verified' | 'business';
  id_submitted_at: string | null;
  id_verified: boolean;
  id_verified_at: string | null;
  id_verification_result: 'pending' | 'verified' | 'rejected' | null;
  use_store_identity: boolean;
  email_verified: boolean;
  location_address: string | null;
  location_city: string | null;
  location_lat: number | null;
  location_lng: number | null;
  username: string | null;
  show_real_name: boolean;
  presence_visibility?: 'everyone' | 'chatted_with' | 'nobody';
  sales_count?: number;
  pending_dob?: boolean;
  taste_onboarding_completed?: boolean;
  store_description?: string | null;
  store_service_area?: string | null;
  store_category?: string | null;
  show_public_city?: boolean;
  hide_follower_lists?: boolean;
  hide_follower_counts?: boolean;
  // APP-Q431: keep the person out of in-app search/suggestions while direct
  // links, listings, orders, and messages keep working. Defaults to true.
  search_discoverable?: boolean;
  /** Inbox/Messaging decision: configurable read receipts, default on. */
  read_receipts_enabled?: boolean;
  language?: string;
  pinned_product_id?: string | null;
  pinned_product?: {
    id: string;
    name: string;
    price: number;
    is_available: boolean;
    condition?: string;
    image_url?: string | null;
  } | null;
  followers_count?: number | null;
  following_count?: number | null;
}

export interface ProductImage {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  is_primary: boolean;
  display_order: number;
  image_width?: number;
  image_height?: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  options: Record<string, string>;
  option_label: string;
  price: number;
  stock: number;
  sku: string | null;
  display_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  seller_id: string;
  category_id: string | null;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  effective_price: number;
  is_on_sale: boolean;
  paused_reason?: 'tier_cap' | 'seller_manual' | 'out_of_stock' | null;
  is_pinned?: boolean;
  discount_pct: number;
  images?: ProductImage[];
  seller?: User;
  category?: Category;
  avg_rating?: number;
  review_count?: number;
  like_count?: number;
  wishlist_count?: number;
  is_liked?: boolean;
  is_wishlisted?: boolean;
  recommendation_reason?: string;
  condition?: 'new' | 'like_new' | 'good' | 'fair' | 'for_parts' | null;
  flaw_notes?: string | null;
  sku?: string | null;
  offers_enabled?: boolean;
  language_label?: string | null;
  listing_status?: 'active' | 'pending_review' | 'rejected';
  moderation_reason?: string | null;
  appeal_note?: string | null;
  has_variants?: boolean;
  attrs?: Record<string, string> | null;
  meetup_enabled?: boolean | null;
  delivery_enabled?: boolean | null;
  low_stock_threshold?: number | null;
  variants?: ProductVariant[];
}

export interface ListingDraft {
  id: string;
  seller_id: string;
  data: Partial<ListingForm>;
  source_product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingForm {
  name: string;
  description: string;
  categoryId: string | null;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'for_parts' | '';
  flawNotes: string;
  sku: string;
  attrs: Record<string, string>;
  languageLabel: string;
  images: string[];
  price: string;
  stock: string;
  salePrice: string;
  saleEndDate: string;
  clearSale: boolean;
  offersEnabled: boolean;
  meetupEnabled: boolean | null;
  deliveryEnabled: boolean | null;
  lowStockThreshold: string;
  hasVariants: boolean;
  variantDims: Array<{ name: string; values: string[] }>;
  variants: Array<{ options: Record<string, string>; price: string; stock: string; sku: string }>;
  fulfillPickup: boolean;
  fulfillDelivery: boolean;
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  effective_price?: number;
  is_on_sale?: boolean;
  discount_pct?: number;
  quantity: number;
  images?: ProductImage[];
  seller_id: string;
  seller_name?: string | null;
  store_name?: string | null;
  stock: number;
  acceptedOfferMessageId?: string;
  variantId?: string | null;
  variantLabel?: string | null;
  variantOptions?: Record<string, string> | null;
}

/**
 * One line the account cart refused to keep (`ignored`) or kept without its
 * agreed price (`released`), as reported by PUT /api/cart (APP-Q097).
 */
export interface CartSyncIssue {
  productId: string;
  variantId?: string | null;
  reason: string;
}

/** The same answer, tagged with what it means for the shopper, for the UI. */
export interface CartSyncNotice {
  kind: 'removed' | 'released';
  productId: string;
  variantId: string | null;
  reason: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  seller_id: string;
  quantity: number;
  price: number;
  variant_id?: string | null;
  variant_label?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  product?: Product;
}

export interface Order {
  id: string;
  buyer_id: string;
  total_amount: number;
  status: string;
  payment_method?: 'moncash' | 'natcash' | string;
  moncash_reference: string | null;
  delivery_method: string;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_note: string | null;
  meetup_lat: number | null;
  meetup_lng: number | null;
  meetup_address: string | null;
  meetup_scheduled_at?: string | null;
  meetup_note: string | null;
  meetup_confirmed: boolean;
  meetup_proposed_by: string | null;
  meetup_started_at: string | null;
  meetup_expires_at: string | null;
  meetup_started?: boolean;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  seller_name?: string;
  buyer_name?: string;
  my_role?: 'buyer' | 'seller';
  item_count?: number;
  first_product_name?: string;
  product_image?: string | null;
  seller_snapshot_name?: string | null;
  seller_snapshot_logo_url?: string | null;
  seller_count?: number;
  other_sellers?: Array<{ id: string; full_name: string; phone?: string | null }>;
  seller_fulfillments?: Array<{ seller_id: string; payment_status?: string; fulfillment_status: string; fulfillment_method?: string | null }>;
  escrow?: Array<{ seller_id: string; escrow_status: string; gross_amount?: number }>;
  cancellation_requests?: Array<{
    id: string; seller_id: string; raised_by: string; description: string; status: string;
    resolution: string | null; response_deadline: string | null; created_at: string;
    seller_name?: string | null; requester_name?: string | null;
  }>;
  // The buyer's own review for this order (edit/delete affordance in Order Detail).
  my_review?: {
    id: string;
    rating: number;
    comment: string | null;
    is_edited?: boolean;
    seller_response?: string | null;
    created_at: string;
    deleted_at?: string | null;
  } | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name?: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  seller_id: string;
  rating: number;
  comment: string | null;
  seller_response: string | null;
  seller_responded_at: string | null;
  is_edited: boolean;
  created_at: string;
  reviewer?: User;
  reviewer_name?: string;
  reviewer_avatar?: string | null;
  reviewer_username?: string | null;
  is_verified_purchase?: boolean;
  is_transaction_level?: boolean;
  updated_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
  dismissed_from_feed?: boolean;
  action_required?: boolean;
  action_resolved?: boolean;
  action_deadline?: string | null;
  group_key?: string | null;
  is_group?: boolean;
  group_count?: number;
  group_items?: Notification[];
}

export interface NotificationPreferences {
  categories: {
    security_account?: 'push_now';
    orders_payments?: 'push_now';
    meetups?: 'push_now';
    disputes?: 'push_now';
    inventory_alerts?: 'push_now';
    follows?: 'push_now';
    offers?: 'push_now';
    reviews?: 'push_now' | 'daily_summary' | 'in_app';
    seller_updates?: 'push_now' | 'daily_summary' | 'in_app';
    marketing_promos?: 'push_now' | 'in_app' | 'off';
  };
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
    days: 'all' | 'weekdays' | 'weekends';
  };
  snooze_until: string | null;
  daily_summary_time: string;
  time_zone?: string;
  hide_sensitive_previews: boolean;
  muted_seller_ids: string[];
}

export interface Conversation {
  id: string;
  order_id: string | null;
  product_id: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  created_at: string;
  other_user?: User;
  last_message?: Message;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  order_status?: string | null;
  order_product_name?: string | null;
  other_party_id?: string;
  other_party_name?: string;
  other_party_username?: string | null;
  last_message_type?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type?: string;
  image_url?: string;
  audio_url?: string;
  audio_duration?: number;
  product_data?: {
    productId: string;
    sellerId: string;
    name: string;
    description?: string | null;
    price: number;
    listPrice: number;
    imageUrl?: string | null;
    sharedAt: string;
    availableAtShare: boolean;
    currentlyAvailable?: boolean;
    currentStock?: number;
  };
  offer_data?: {
    productId: string;
    productName: string;
    offeredPrice: number;
    listPrice: number;
    quantity: number;
    status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'redeemed';
    negotiationRound?: number;
    counterCount?: number;
    negotiationId?: string;
    buyerId?: string;
    sellerId?: string;
    senderId?: string;
    expiresAt?: string;
    acceptedExpiresAt?: string | null;
    isInCheckout?: boolean;
    currentStock?: number;
    productAvailable?: boolean;
  };
  reply_to?: {
    id: string;
    content: string | null;
    senderId: string;
    senderName: string;
    type?: string;
  };
  reactions?: { emoji: string; userId: string; userName: string }[];
  delivery_status?: 'sent' | 'delivered' | 'read';
  client_id?: string;
  is_edited?: boolean;
  is_deleted?: boolean;
  is_read: boolean;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  is_default: boolean;
}

export interface SellerProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  store_name: string | null;
  store_logo_url: string | null;
  seller_tier: 'none' | 'casual' | 'verified' | 'business';
  id_verified: boolean;
  use_store_identity: boolean;
  product_count: number;
  sales_count: number;
  avg_rating: number;
  review_count: number;
  username: string | null;
  show_real_name: boolean;
  show_public_city?: boolean;
  hide_follower_lists?: boolean;
  hide_follower_counts?: boolean;
  followers_count?: number | null;
  following_count?: number | null;
  role?: string;
  location_city: string | null;
  natcash_phone: string | null;
  accepted_payment_methods: string[] | null;
  store_description?: string | null;
  store_service_area?: string | null;
  store_category?: string | null;
  pinned_product_id?: string | null;
  pinned_product?: any;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  valid_until: string | null;
  is_active: boolean;
}


export interface RatingBreakdown {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

export interface SellerReviewStats {
  avg_rating: number;
  review_count: number;
  breakdown: RatingBreakdown;
}

export interface BlockedUser {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  store_name: string | null;
  store_logo_url: string | null;
  seller_tier: string;
  use_store_identity: boolean;
  blocked_at: string;
}

export interface UserReportPayload {
  targetType: 'profile' | 'review' | 'reply' | 'order' | 'listing';
  targetId: string;
  reportedUserId?: string;
  reason: string;
  details?: string;
  orderContext?: any;
  // APP-Q544: set when the reporter identifies as the rights holder.
  rightsHolder?: boolean;
}

export interface PolicyDocumentState {
  kind: 'terms' | 'privacy';
  version: string;
  is_material: boolean;
  effective_at: string;
  title: string | null;
  summary: string | null;
  url: string | null;
  available_locales: string[];
  locale_available: boolean;
  accepted: { version: string; accepted_at: string } | null;
  acceptance_current: boolean;
  baseline: boolean;
  notice_dismissed: boolean;
}

export interface PolicyState {
  locale: string;
  supported_locales: string[];
  documents: PolicyDocumentState[];
  needs_acceptance: string[];
  history: { kind: string; version: string; accepted_at: string }[];
}

// Batch 73 / APP-Q369 — the account's private security activity history.
// `event_type` is a stable code so the app can render it in any locale, and
// `user_agent` is the same non-secret device string the session list exposes.
export interface SecurityEvent {
  id: number;
  event_type: 'sign_in' | 'account_frozen' | 'account_unfrozen' | 'two_factor_disabled' | 'passkey_removed' | 'trusted_device_revoked';
  user_agent: string | null;
  /** Only ever the account owner's own freeze note. */
  reason: string | null;
  created_at: string;
}

// Batch 75 — staff reads of this account's identity evidence, shown to the
// subject as a case-linked history. Display-safe by design: `actor_label` is a
// team label rather than a staff identity, and `case_reference` is a plain
// handle (e.g. a support case id), never a note about the review.
export interface KycEvidenceAccessEntry {
  id: string;
  attempt_id: string | null;
  actor_label: string;
  purpose: 'case_review' | 'dispute_review' | 'fraud_review' | 'compliance_audit' | 'rights_claim';
  scope: 'attempt' | 'document' | 'selfie' | 'metadata';
  case_reference: string | null;
  accessed_at: string;
}

// Batch 74 / APP-Q379 — a "remember this device" trust record.
// Trust only ever decides whether a second-factor code is asked for; it is not
// identity verification, KYC evidence, or payment/payout authorization. A
// device is identified by when it was trusted, not by a fingerprint claim.
export interface TrustedDevice {
  id: string;
  trusted_at: string;
  expires_at: string;
  days_remaining: number;
}

// Batch 73/74/75 — fast account freeze for suspected compromise (APP-Q371).
// A freeze stops new listings and payout requests only; sign-in, recovery,
// messages, orders, Support, and export keep working.
export interface AccountFreezeState {
  frozen: boolean;
  frozen_at: string | null;
  reason: string | null;
  frozen_by: 'self' | 'support' | null;
  listings_paused: number;
  has_password?: boolean;
  listings_restored?: number;
}

// Batch 74/75 — data export lifecycle (APP-Q379–APP-Q391). An export is a job
// the user deliberately starts (re-confirming their password when they have
// one), can watch, cancel while it is being prepared, and retry after failure
// without ever receiving a duplicate or partial archive.
export type ExportJobStatus =
  | 'pending'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'superseded';

export interface ExportJob {
  id: string;
  status: ExportJobStatus;
  /** Short machine code (never a raw server error). */
  error: string | null;
  requested_at: string;
  completed_at: string | null;
  /** Set once ready; the archive is deleted after this moment. */
  expires_at: string | null;
  cancelled_at: string | null;
  has_payload: boolean;
}

/** Count-only summary; safe to read without re-authentication. */
export interface DataExportSummary {
  orders: number;
  messages: number;
  reviews: number;
  notifications: number;
  security_events: number;
  /** Staff opens of this account's identity evidence (Batch 75 audit log). */
  kyc_evidence_access: number;
  retention_days: number;
}
