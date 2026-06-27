-- Multiple payments (multi-payer, back-datable) recorded against an order.
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "amountAed" DECIMAL(14,4) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderPayment_orderId_paidAt_idx" ON "OrderPayment"("orderId", "paidAt");

ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;