# MaurMaket MVP API Stubs

This is the smallest API surface needed for the first complete commerce loop.

## 1) Seller creates listing

- `POST /api/listings`
- Body:
```json
{
  "seller_id": "u_123",
  "title": "Dress - Red Floral",
  "description": "New condition",
  "price_htg": 4500,
  "region": "Port-au-Prince",
  "image_url": "https://..."
}
```
- Result: create listing with `status=active`.

## 2) Buyer views listings

- `GET /api/listings?region=Port-au-Prince&status=active`
- Result: list of active listings.

## 3) Buyer requests to buy

- `POST /api/purchase-requests`
- Body:
```json
{
  "listing_id": "l_001",
  "buyer_id": "u_888",
  "offered_price_htg": 4300,
  "note": "Can meet tomorrow afternoon"
}
```
- Result: request with `status=requested` and `fulfillment_mode=none`.

## 4) Seller accepts or declines

- `PATCH /api/purchase-requests/:id/decision`
- Body:
```json
{
  "seller_id": "u_123",
  "decision": "accepted"
}
```
- Allowed `decision`: `accepted` or `declined`.

## 5) Buyer/Seller picks meetup or delivery

- `PATCH /api/purchase-requests/:id/fulfillment`
- Body for meetup:
```json
{
  "mode": "meetup",
  "meetup_region": "Delmas"
}
```
- Body for delivery:
```json
{
  "mode": "delivery",
  "delivery_region": "Petion-Ville"
}
```
- Rule: request must already be `accepted`.

## 6) Close loop

- `PATCH /api/purchase-requests/:id/status`
- Body:
```json
{
  "status": "completed"
}
```
- Allowed final status: `completed` or `cancelled`.

## Minimal validation checklist per endpoint

- Validate required fields.
- Validate role ownership (`buyer_id`, `seller_id`).
- Validate state transition rules from `backend/mvp-data-contract.json`.
- Return clear error codes for invalid transitions.
