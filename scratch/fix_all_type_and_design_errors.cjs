const fs = require('fs');
const path = require('path');

// 1. Fix src/types.ts
const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
let typesContent = fs.readFileSync(typesPath, 'utf8');

const sellerProfileTarget = `export interface SellerProfile {
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
  location_city: string | null;
  natcash_phone: string | null;
  accepted_payment_methods: string[] | null;
}`;

const sellerProfileReplacement = `export interface SellerProfile {
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

if (typesContent.includes(sellerProfileTarget)) {
  typesContent = typesContent.replace(sellerProfileTarget, sellerProfileReplacement);
  fs.writeFileSync(typesPath, typesContent, 'utf8');
  console.log('src/types.ts updated');
} else {
  console.log('src/types.ts SellerProfile not found or already updated');
}

// 2. Fix src/api.ts duplicate blockUser
const apiPath = path.join(__dirname, '..', 'src', 'api.ts');
let apiContent = fs.readFileSync(apiPath, 'utf8');

const duplicateBlockUser = `export const blockUser = (userId: string) =>
  request(\`/api/users/\${userId}/block\`, { method: 'POST' });

export const unblockUser = (userId: string) =>
  request(\`/api/users/\${userId}/block\`, { method: 'DELETE' });`;

const replacementBlockUser = `export const unblockUser = (userId: string) =>
  request(\`/api/users/\${userId}/block\`, { method: 'DELETE' });`;

if (apiContent.includes(duplicateBlockUser)) {
  apiContent = apiContent.replace(duplicateBlockUser, replacementBlockUser);
  fs.writeFileSync(apiPath, apiContent, 'utf8');
  console.log('src/api.ts duplicate blockUser removed');
}

// 3. Fix src/components/ReportModal.tsx
const reportModalPath = path.join(__dirname, '..', 'src', 'components', 'ReportModal.tsx');
let reportModalContent = fs.readFileSync(reportModalPath, 'utf8');
reportModalContent = reportModalContent.replace(/FONT_WEIGHTS\.semiBold/g, 'FONT_WEIGHTS.semibold');
reportModalContent = reportModalContent.replace(/TOUCH\.minTarget/g, 'TOUCH.min');
fs.writeFileSync(reportModalPath, reportModalContent, 'utf8');
console.log('src/components/ReportModal.tsx fixed');

// 4. Fix src/screens/BlockedUsersScreen.tsx
const blockedPath = path.join(__dirname, '..', 'src', 'screens', 'BlockedUsersScreen.tsx');
let blockedContent = fs.readFileSync(blockedPath, 'utf8');
blockedContent = blockedContent.replace(/message="Accounts you block will appear here\."/g, 'hint="Accounts you block will appear here."');
blockedContent = blockedContent.replace(/RADIUS\.md/g, 'RADIUS.card');
blockedContent = blockedContent.replace(/TOUCH\.minTarget/g, 'TOUCH.min');
blockedContent = blockedContent.replace(/FONT_WEIGHTS\.semiBold/g, 'FONT_WEIGHTS.semibold');
fs.writeFileSync(blockedPath, blockedContent, 'utf8');
console.log('src/screens/BlockedUsersScreen.tsx fixed');

// 5. Fix src/screens/StorefrontScreen.tsx
const storefrontPath = path.join(__dirname, '..', 'src', 'screens', 'StorefrontScreen.tsx');
let storefrontContent = fs.readFileSync(storefrontPath, 'utf8');

// replace RADIUS.modal with 20
storefrontContent = storefrontContent.replace(/RADIUS\.modal/g, '20');

// replace targetType: 'user' with targetType: 'profile'
storefrontContent = storefrontContent.replace(/targetType:\s*'user' \| 'review' \| 'reply'/g, "targetType: 'profile' | 'review' | 'reply'");
storefrontContent = storefrontContent.replace(/targetType:\s*'user'/g, "targetType: 'profile'");

// replace fontSize: 36 in ratingBig with fontSize: 32
storefrontContent = storefrontContent.replace(/ratingBig:\s*\{\s*fontSize:\s*36/g, 'ratingBig: { fontSize: 32');

// replace reviewReportBtn with 44x44
storefrontContent = storefrontContent.replace(/reviewReportBtn:\s*\{\s*width:\s*30,\s*height:\s*30/g, 'reviewReportBtn: { width: 44, height: 44');

fs.writeFileSync(storefrontPath, storefrontContent, 'utf8');
console.log('src/screens/StorefrontScreen.tsx fixed');
