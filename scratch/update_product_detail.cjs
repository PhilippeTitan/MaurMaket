const fs = require('fs');
const path = require('path');

// 1. Update BuyRow.tsx
const buyRowPath = path.join(__dirname, '..', 'src', 'components', 'BuyRow.tsx');
let buyRowCode = fs.readFileSync(buyRowPath, 'utf8');

// Check if already updated
if (!buyRowCode.includes('unavailableRow')) {
  // Insert unavailable check right before if (isOwnProduct)
  const targetCheck = 'if (isOwnProduct) {';
  const newCheck = `if (product.paused_reason === 'tier_cap' || (!product.is_available && !isOwnProduct)) {
    return (
      <View style={styles.unavailableRow}>
        <View style={styles.unavailableBadge}>
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={COLORS.yellow} />
          <Text style={styles.unavailableBadgeText}>Temporarily Unavailable</Text>
        </View>
        <TouchableOpacity
          style={styles.visitSellerBtn}
          onPress={() => navigation.navigate('Storefront', { sellerId: product.seller_id, preloadedSeller: product.seller })}
          accessibilityRole="button"
          accessibilityLabel="view seller store"
        >
          <Text style={styles.visitSellerText}>Visit Store</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  }

  if (isOwnProduct) {`;

  buyRowCode = buyRowCode.replace(targetCheck, newCheck);

  // Add styles to buyRowCode
  const targetStyle = 'ownListingText: {';
  const newStyles = `unavailableRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  unavailableBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  visitSellerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.coral,
    minHeight: 44,
  },
  visitSellerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  ownListingText: {`;

  buyRowCode = buyRowCode.replace(targetStyle, newStyles);
  fs.writeFileSync(buyRowPath, buyRowCode, 'utf8');
  console.log('BuyRow.tsx updated');
} else {
  console.log('BuyRow.tsx already has unavailableRow');
}

// 2. Update ProductDetailScreen.tsx
const prodDetailPath = path.join(__dirname, '..', 'src', 'screens', 'ProductDetailScreen.tsx');
let prodDetailCode = fs.readFileSync(prodDetailPath, 'utf8');

if (!prodDetailCode.includes('tierCapBanner')) {
  const targetContentSheet = '<View style={styles.contentSheet}>';
  const newContentSheet = `<View style={styles.contentSheet}>
          {product.paused_reason === 'tier_cap' && (
            <View style={styles.tierCapBanner}>
              <MaterialCommunityIcons name="clock-alert-outline" size={20} color={COLORS.yellow} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.tierCapTitle}>Temporarily Unavailable</Text>
                <Text style={styles.tierCapMsg}>
                  This listing is temporarily paused due to seller plan listing limits. You can explore available listings from this seller below.
                </Text>
              </View>
            </View>
          )}`;

  prodDetailCode = prodDetailCode.replace(targetContentSheet, newContentSheet);

  const targetStyle2 = 'contentSheet: {';
  const newStyle2 = `tierCapBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.35)',
    borderRadius: RADIUS.card,
    padding: 12,
    marginBottom: SPACING.md,
  },
  tierCapTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.yellow,
  },
  tierCapMsg: {
    fontSize: 12,
    color: COLORS.text2,
    lineHeight: 16,
  },
  contentSheet: {`;

  prodDetailCode = prodDetailCode.replace(targetStyle2, newStyle2);
  fs.writeFileSync(prodDetailPath, prodDetailCode, 'utf8');
  console.log('ProductDetailScreen.tsx updated');
} else {
  console.log('ProductDetailScreen.tsx already has tierCapBanner');
}
