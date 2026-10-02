const fs = require('fs');
const path = require('path');

// 1. Fix src/types.ts
const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
let typesContent = fs.readFileSync(typesPath, 'utf8');

const regex = /export interface SellerProfile \{[\s\S]*?\}/;
const newSellerProfile = `export interface SellerProfile {
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
}`;

typesContent = typesContent.replace(regex, newSellerProfile);
fs.writeFileSync(typesPath, typesContent, 'utf8');
console.log('src/types.ts updated via regex');

// 2. Fix src/screens/BlockedUsersScreen.tsx
const blockedPath = path.join(__dirname, '..', 'src', 'screens', 'BlockedUsersScreen.tsx');
let blockedContent = fs.readFileSync(blockedPath, 'utf8');
blockedContent = blockedContent.replace(/message="Accounts you block[^"]*"/, 'hint="Accounts you block will not be able to follow you or send you new messages."');
fs.writeFileSync(blockedPath, blockedContent, 'utf8');
console.log('src/screens/BlockedUsersScreen.tsx EmptyState hint fixed');
