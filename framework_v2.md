# MaurMaket Phase 2 Framework — Ecosystem Expansion

> [!NOTE]
> Since the V1 Growth Framework (Trust, Discovery, Comm, Operations) has been successfully implemented, the next logic loop focuses on **Scale, Logistics, and Virality**. What stops a buyer from spending 10x more? What stops a seller from listing 100x more items?

## Logic Loop Analysis: Current Friction Points

| Current Friction (V1) | The Root Problem | The Solution (Phase 2 Layer) |
|-------------------|----------------|-------------------------|
| **Delivery is physical/ad-hoc** | Sellers get paid instantly on checkout via MonCash. Buyers take all the risk if delivery fails. | **Layer 6: Logistics & Escrow Engine** |
| **Simple Listings Only** | To sell 3 sizes of a shirt, the seller must create 3 separate listings. Clutters search. | **Layer 7: Enterprise Seller Suite** |
| **Browsing is solitary** | E-commerce in Haiti is highly social (WhatsApp/IG). A static feed is boring. | **Layer 8: Social Commerce & Curation** |
| **No Retention Incentives** | Buyers return only if they need something. No reward for loyalty. | **Layer 9: Gamification & Loyalty** |
| **Manual Moderation** | Spam or prohibited items require manual admin review. | **Layer 10: AI & Automation** |

---

## Layer 6: Logistics & Escrow Engine (Transaction Security)

> **The Flywheel**: Escrow removes buyer risk → Buyers spend more freely on high-ticket items → Sellers get more volume → Delivery partners get more volume.

- **MonCash Escrow**: Instead of instant payout to the seller's balance, funds are held in `pending_escrow` upon MonCash success.
- **Delivery Partner API**: Integrate with local delivery services. When tracking marks as `delivered`, or when the buyer taps `Confirm Receipt`, escrow unlocks to the seller's balance.
- **Automated Refunds**: If a `dispute` is resolved in the buyer's favor, the escrow reverses automatically via MonCash API without the platform needing a manual reserve pool.

## Layer 7: Enterprise Seller Suite (Scaling Sellers)

> **The Flywheel**: Powerful tools save seller time → Sellers list their entire inventory → Massive catalog growth → Better buyer discovery.

- **Product Variants (SKUs)**: A single product listing supports variants (Size: S/M/L, Color: Red/Blue). Each variant has its own `stock` count.
- **Bulk CSV Import**: Sellers can upload a spreadsheet to create 100 listings at once.
- **Staff Accounts / Roles**: A seller can invite `employees` who can answer chats and update order statuses, but *cannot* request MonCash payouts.

## Layer 8: Social Commerce & Curation (Virality)

> **The Flywheel**: Fun content → higher time-in-app → accidental discovery → impulse purchases.

- **Video Snippets (Stories/Reels)**: Sellers can upload 15-second vertical videos of products instead of just static images. These appear in a dedicated "Discover" video feed.
- **User-Curated Collections**: Buyers can create public "Lookbooks" or "Wishlist Boards" (e.g., "Summer Beach Outfits"). If someone buys from their board, the curator earns a micro-commission.
- **Group Buy / Make an Offer**: "Buy with a friend for 15% off" (generates viral sharing) or a "Make Offer" button for haggling (digitizing the traditional Haitian market experience).

## Layer 9: Gamification & Loyalty (Retention)

> **The Flywheel**: Points earned → sunk cost fallacy → users buy here instead of Facebook Marketplace to use their points.

- **MaurMaket Coins (MMC)**: Earn 1 point per 100 Rs spent. Earn 50 points for leaving a review with a photo. Earn 200 points for a successful referral.
- **VIP Tiers**: 
  - *Bronze*: Default
  - *Silver* (>50k Rs spent): Free standard delivery once a month.
  - *Gold* (>200k Rs spent): Early access to sales, priority support.
- **Daily Check-in Streaks**: Open the app 7 days in a row to win a random promo code.

## Layer 10: AI & Automation (Platform Efficiency)

> **The Flywheel**: Zero-effort listing → better quality catalog → higher conversion.

- **Smart Image Enhancement**: Auto-remove messy backgrounds from seller uploads using a background-removal API, giving the marketplace a clean, premium look.
- **Auto-Categorization**: AI vision model detects the product in the photo and auto-fills the category and tags.
- **Listing Translation**: Automatically translate product descriptions between French and Haitian Creole based on the buyer's device preference.

---

## Next Steps

Since V1 is basically complete, which direction should we build next?

1. **Transaction Security**: Do we build the Escrow system first? (Highest impact on trust)
2. **Seller Scale**: Do we build Product Variants first? (Highest impact on catalog size)
3. **Virality**: Do we build Video Snippets or Offers first? (Highest impact on growth)
