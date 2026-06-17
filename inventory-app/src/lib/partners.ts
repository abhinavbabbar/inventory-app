import { Prisma } from "@prisma/client";

// Recompute a partner's denormalized equity total from the capital ledger only.
// Opex a partner fronts is a reimbursable cost (tracked via OpexEntry.paidByPartnerId)
// and intentionally does NOT count toward equity or ownership share.
// Call inside a transaction after any change to the capital ledger.
export async function recomputePartnerTotal(
  tx: Prisma.TransactionClient,
  partnerId: string,
): Promise<void> {
  const capital = await tx.partnerInvestment.aggregate({
    where: { partnerId },
    _sum: { amountAed: true },
  });

  await tx.partner.update({
    where: { id: partnerId },
    data: { investmentAed: capital._sum.amountAed ?? new Prisma.Decimal(0) },
  });
}
