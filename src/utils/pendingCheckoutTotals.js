function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Rebuild an unpaid checkout from its locked cart prices and seller terms. */
export function calculatePendingCheckoutTotals(cartData = [], fulfillmentTerms = [], promo = null) {
  const sellers = new Map();
  for (const item of cartData) {
    const sellerId = String(item.seller_id || item.sellerId || '');
    if (!sellerId) throw new Error('Checkout item is missing its seller allocation');
    const seller = sellers.get(sellerId) || { sellerId, merchandise: 0, discount: 0, deliveryFee: 0 };
    seller.merchandise = money(seller.merchandise + Number(item.price || 0) * Number(item.quantity || 1));
    sellers.set(sellerId, seller);
  }
  const bySeller = new Map((fulfillmentTerms || []).map(term => [String(term.sellerId || term.seller_id || ''), term]));
  for (const [sellerId, seller] of sellers) {
    const term = bySeller.get(sellerId);
    if (!term) throw new Error('Checkout is missing a seller fulfillment allocation');
    seller.deliveryFee = money(term.deliveryFee || 0);
  }
  if (bySeller.size !== sellers.size) throw new Error('Checkout seller terms do not match its cart');

  let discount = 0;
  if (promo && sellers.size) {
    const eligibleSeller = promo.seller_id ? String(promo.seller_id) : null;
    const eligible = eligibleSeller ? sellers.get(eligibleSeller)?.merchandise || 0
      : [...sellers.values()].reduce((sum, seller) => sum + seller.merchandise, 0);
    if (eligible >= Number(promo.min_order_amount || 0)) {
      discount = promo.discount_type === 'percentage'
        ? Math.min(eligible * Number(promo.discount_value || 0) / 100, Number(promo.discount_value || 0) * 10)
        : Math.min(eligible, Number(promo.discount_value || 0));
      discount = money(discount);
      if (discount > 0 && eligibleSeller) sellers.get(eligibleSeller).discount = discount;
      else if (discount > 0) {
        const ordered = [...sellers.values()].sort((a, b) => a.sellerId.localeCompare(b.sellerId));
        const totalCents = Math.round(discount * 100);
        const shares = ordered.map(seller => {
          const exact = totalCents * seller.merchandise / eligible;
          return { seller, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
        });
        let leftover = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);
        for (const share of shares.slice().sort((a, b) => b.remainder - a.remainder || a.seller.sellerId.localeCompare(b.seller.sellerId))) {
          if (leftover <= 0) break;
          share.cents += 1;
          leftover -= 1;
        }
        for (const share of shares) share.seller.discount = share.cents / 100;
      }
    }
  }
  const breakdown = [...sellers.values()].map(seller => ({
    ...seller,
    merchandiseAfterDiscount: money(seller.merchandise - seller.discount),
    total: money(seller.merchandise - seller.discount + seller.deliveryFee),
  }));
  return {
    merchandiseSubtotal: money([...sellers.values()].reduce((sum, seller) => sum + seller.merchandise, 0)),
    discountAmount: discount,
    deliveryTotal: money([...sellers.values()].reduce((sum, seller) => sum + seller.deliveryFee, 0)),
    totalAmount: money(breakdown.reduce((sum, seller) => sum + seller.total, 0)),
    sellers: breakdown,
  };
}
