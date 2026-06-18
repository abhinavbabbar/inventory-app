-- Add multi-currency support to PartnerInvestment
-- currency: AED | INR (default AED for backfill)
-- amountOriginal: amount in the stated currency
-- fxRateInrToAed: locked rate for INR contributions; NULL for AED
-- amountAed stays as the canonical equity value
ALTER TABLE "PartnerInvestment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AED';
ALTER TABLE "PartnerInvestment" ADD COLUMN "amountOriginal" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "PartnerInvestment" ADD COLUMN "fxRateInrToAed" DECIMAL(14,6);

-- Backfill: all existing rows are AED contributions
UPDATE "PartnerInvestment" SET "amountOriginal" = "amountAed";