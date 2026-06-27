-- Quotations / estimates that can convert into orders.
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "vatRatePct" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "vatAmountAed" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "convertedOrderId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitSalePriceAed" DECIMAL(14,4) NOT NULL,
    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Estimate_estimateNumber_key" ON "Estimate"("estimateNumber");
CREATE UNIQUE INDEX "Estimate_convertedOrderId_key" ON "Estimate"("convertedOrderId");
CREATE INDEX "Estimate_status_issuedAt_idx" ON "Estimate"("status", "issuedAt");
CREATE INDEX "Estimate_customerId_idx" ON "Estimate"("customerId");
CREATE INDEX "EstimateLine_estimateId_idx" ON "EstimateLine"("estimateId");
CREATE INDEX "EstimateLine_itemId_idx" ON "EstimateLine"("itemId");

ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;