/** Restore only reservations owned by the cancelled seller portion. */
export async function releaseCancelledOrderStock(client, orderId, fulfillments, sellerId = null) {
  // Legacy MonCash checkouts may still hold confirmed stock under checkout id.
  for (const fulfillment of fulfillments) {
    const checkoutId = String(fulfillment.payment_reference || '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkoutId)) {
      await client.query(
        `UPDATE stock_reservations SET order_id = $1, checkout_id = NULL
         WHERE checkout_id = $2 AND status IN ('active','confirmed')
           AND ($3::uuid IS NULL OR seller_id = $3)`,
        [orderId, checkoutId, sellerId]
      );
    }
  }
  const released = await client.query(
    `UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP
     WHERE order_id = $1 AND status IN ('active','confirmed')
       AND ($2::uuid IS NULL OR seller_id = $2)
     RETURNING product_id, quantity, variant_id`,
    [orderId, sellerId]
  );
  for (const reservation of released.rows) {
    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.product_id]);
    if (reservation.variant_id) {
      await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.variant_id]);
    }
  }
}
