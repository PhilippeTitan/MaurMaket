# MaurMaket MVP Checklist

Goal: Ship one complete buyer-seller loop before adding extra features.

## Scope Lock

- In scope: listing creation, listing browse, request to buy, seller decision, meetup or delivery selection.
- Out of scope: payments, ratings, chat system, advanced geolocation, subscriptions, analytics.
- Rule: Do not start any out-of-scope work until all in-scope items are done and tested.

## Build Order

- [ ] 1. Seller can create a listing.
- [ ] 2. Buyer can view active listings.
- [ ] 3. Buyer can submit a "Request to Buy" for a listing.
- [ ] 4. Seller can accept or decline each request.
- [ ] 5. If accepted, buyer and seller choose fulfillment mode: `meetup` or `delivery`.
- [ ] 6. Mark request as `completed` or `cancelled`.

## Done Criteria

- [ ] Every step above has at least one backend endpoint.
- [ ] Every step above has a visible UI action in existing pages.
- [ ] State transitions are enforced by backend validation.
- [ ] Manual test run confirms one full loop from listing to completion.

## Daily Execution Rule

- Pick exactly one unchecked item.
- Implement it end-to-end.
- Test it.
- Commit it.
- Move to the next item only after done criteria for that item are met.
