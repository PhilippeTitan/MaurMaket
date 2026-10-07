/**
 * Shared notification routing — single source of truth for type → destination.
 * Used by both notifications.ts (push taps) and InboxScreen.tsx (in-app taps).
 * Prevents routing drift between the two surfaces.
 */

type Nav = {
  navigate: (screen: string, params?: any) => void;
};

export function routeNotification(nav: Nav, type: string, data: Record<string, any> | undefined | null) {
  if (!type) {
    nav.navigate('Inbox');
    return;
  }

  switch (type) {
    // ── Security ──
    case 'new_sign_in':
    case 'account_security':
    case 'password_changed':
    case 'account_frozen':
    case 'account_unfrozen':
    case 'second_factor_removed':
      nav.navigate('SecuritySettings');
      break;

    // ── Order / Payment ──
    case 'order_status':
    case 'payment_confirmed':
    case 'payment_failed':
    case 'order_cancelled':
    case 'review_received':
    case 'review_reminder':
    case 'order_note':
    case 'dispute_opened':
    case 'dispute_resolved':
      if (data?.orderId) nav.navigate('OrderDetail', { orderId: data.orderId });
      else nav.navigate('Orders');
      break;

    // ── Meetup ──
    case 'meetup_proposed':
    case 'meetup_confirmed':
    case 'meetup_expired':
      if (data?.orderId) nav.navigate('Meetup', { orderId: data.orderId });
      else nav.navigate('Orders');
      break;

    // ── Checkout meetup negotiation ──
    case 'fulfillment_proposed':
      nav.navigate('SellerToolsSettings');
      break;
    case 'fulfillment_accepted':
    case 'fulfillment_rejected':
    case 'fulfillment_countered':
      if (data?.pendingId) nav.navigate('MeetupProposal', { pendingId: data.pendingId });
      else nav.navigate('Orders');
      break;
    case 'fulfillment_expired':
      if (data?.pendingId) nav.navigate('MeetupProposal', { pendingId: data.pendingId });
      else nav.navigate('Orders');
      break;
    case 'fulfillment_proposal_expired':
      nav.navigate('SellerToolsSettings');
      break;

    // ── Escrow / Payout ──
    case 'escrow_refunded':
    case 'payout_failed':
      nav.navigate('Payments');
      break;

    // ── Chat ──
    case 'new_message':
      if (data?.conversationId) {
        nav.navigate('Chat', {
          conversationId: data.conversationId,
          otherUserName: data.senderName || 'Chat',
          otherUserId: data.senderId,
          otherUserAvatar: data.image || null,
        });
      }
      break;

    // ── Social ──
    case 'new_follower':
      if (data?.sellerId) nav.navigate('Storefront', { sellerId: data.sellerId });
      else nav.navigate('MeTab');
      break;

    // ── Product ──
    case 'new_product_from_followed':
      if (data?.productId) nav.navigate('ProductDetail', { productId: data.productId });
      break;

    case 'low_stock':
    case 'product_sold_out':
      if (data?.productId) nav.navigate('EditListing', { productId: data.productId });
      break;

    // ── Listing moderation / content review ──
    case 'listing_approved':
    case 'listing_rejected':
    case 'listing_in_review':
    case 'listing_under_review':
    case 'listing_content_confirmed':
      nav.navigate('MyListings');
      break;
    case 'content_review_buyer_notice':
      nav.navigate('HelpSupport');
      break;

    // ── Account / Subscription ──
    case 'subscription_expired':
    case 'subscription_activated':
    case 'verification_approved':
    case 'verification_rejected':
      nav.navigate('Settings');
      break;

    // ── Fallback ──
    default:
      nav.navigate('Inbox');
      break;
  }
}
