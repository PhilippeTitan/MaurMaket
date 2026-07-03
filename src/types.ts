export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: 'buyer' | 'seller';
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
}

export interface ProductImage {
  id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
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
  discount_pct: number;
  images?: ProductImage[];
  seller?: User;
  category?: Category;
  avg_rating?: number;
  review_count?: number;
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
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  seller_id: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface Order {
  id: string;
  buyer_id: string;
  total_amount: number;
  status: string;
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
  meetup_note: string | null;
  meetup_confirmed: boolean;
  meetup_proposed_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  actor_id: string;
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
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
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
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
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
