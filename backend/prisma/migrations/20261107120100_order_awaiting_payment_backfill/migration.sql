-- Every ONLINE order that was never paid goes back to AWAITING_PAYMENT —
-- including ones a seller had already moved forward before the guard
-- existed. An unpaid order was never fulfilled, so its fulfilment trail goes:
-- stage stamps, delivery estimate and seller-added parcels. The payment job
-- then closes each one (re-checks the gateway, cancels, returns stock).
UPDATE "order_items" i
SET "shipmentId" = NULL
FROM "orders" o
WHERE i."orderId" = o."id"
  AND o."paymentMethod" = 'ONLINE'
  AND o."paymentStatus" IN ('PENDING', 'FAILED')
  AND o."status" NOT IN ('PENDING', 'CANCELLED');

DELETE FROM "order_shipments" s
USING "orders" o
WHERE s."orderId" = o."id"
  AND o."paymentMethod" = 'ONLINE'
  AND o."paymentStatus" IN ('PENDING', 'FAILED')
  AND o."status" NOT IN ('PENDING', 'CANCELLED');

UPDATE "orders"
SET "status" = 'AWAITING_PAYMENT',
    "confirmedAt" = NULL,
    "packedAt" = NULL,
    "shippedAt" = NULL,
    "deliveredAt" = NULL,
    "estimatedDeliveryAt" = NULL
WHERE "paymentMethod" = 'ONLINE'
  AND "paymentStatus" IN ('PENDING', 'FAILED')
  AND "status" <> 'CANCELLED';
