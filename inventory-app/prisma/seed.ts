import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function main() {
  await seedAdmin();
  await seedSettings();
  if (process.env.SEED_SAMPLE_DATA === "true") {
    await seedSampleData();
  } else {
    console.log("Skipping sample data. Set SEED_SAMPLE_DATA=true to include demo items/sales.");
  }
}

async function seedAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, name: "Admin", role: "ADMIN" },
    });
    console.log(`Created admin user: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }
}

async function seedSettings() {
  const settings: Array<[string, unknown]> = [
    ["company_info", { name: "Your Company Name", address: "Dubai, UAE", trn: "", logoUrl: "" }],
    ["default_fx_rate", "0.0445"],
    ["vat", { enabled: true, defaultRatePct: "5.00", label: "VAT", registrationNumber: "" }],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: JSON.stringify(value) },
    });
  }
  console.log("Seeded default settings");
}

async function seedSampleData() {
  // Idempotency: skip if any SAMPLE- SKUs already exist.
  const already = await prisma.item.findFirst({ where: { sku: { startsWith: "SAMPLE-" } } });
  if (already) {
    console.log("Sample data already present — skipping.");
    return;
  }

  console.log("Seeding sample data…");

  // Two partners
  const partnerA = await prisma.user.upsert({
    where: { email: "asha@example.com" },
    update: {},
    create: {
      email: "asha@example.com",
      passwordHash: await bcrypt.hash("Partner1!", 10),
      name: "Asha",
      role: "PARTNER",
    },
  });
  const partnerB = await prisma.user.upsert({
    where: { email: "bilal@example.com" },
    update: {},
    create: {
      email: "bilal@example.com",
      passwordHash: await bcrypt.hash("Partner1!", 10),
      name: "Bilal",
      role: "PARTNER",
    },
  });
  // Asha: an opening contribution plus a later top-up (40k + 20k = 60k total).
  const pA = await prisma.partner.upsert({
    where: { userId: partnerA.id },
    update: {},
    create: { userId: partnerA.id, investmentAed: d(60000), notes: "Founding partner" },
  });
  // Bilal: a single contribution (40k).
  const pB = await prisma.partner.upsert({
    where: { userId: partnerB.id },
    update: {},
    create: { userId: partnerB.id, investmentAed: d(40000) },
  });

  // Seed the contribution ledger (skip if already present for idempotency).
  if ((await prisma.partnerInvestment.count({ where: { partnerId: pA.id } })) === 0) {
    await prisma.partnerInvestment.createMany({
      data: [
        { partnerId: pA.id, amountAed: d(40000), contributedAt: daysAgo(90), notes: "Initial investment" },
        { partnerId: pA.id, amountAed: d(20000), contributedAt: daysAgo(25), notes: "Q2 top-up" },
        { partnerId: pB.id, amountAed: d(40000), contributedAt: daysAgo(90), notes: "Initial investment" },
      ],
    });
  }
  console.log("  · 2 partners (60% / 40% split) with contribution ledger");

  // Items
  const items = await Promise.all([
    prisma.item.create({
      data: {
        sku: "SAMPLE-SCARF",
        name: "Cotton scarf",
        category: "Apparel",
        unit: "pc",
        reorderThreshold: 10,
      },
    }),
    prisma.item.create({
      data: {
        sku: "SAMPLE-LAMP",
        name: "Brass desk lamp",
        category: "Home",
        unit: "pc",
        reorderThreshold: 3,
      },
    }),
    prisma.item.create({
      data: {
        sku: "SAMPLE-TEA",
        name: "Premium chai blend",
        category: "Grocery",
        unit: "box",
        reorderThreshold: 20,
      },
    }),
  ]);
  console.log(`  · ${items.length} items`);

  // Shipment from India: 50 scarves @ ₹200, 5 lamps @ ₹2500, 30 tea boxes @ ₹150
  // Total shipping ₹3000, FX 0.045, EQUAL_PER_UNIT
  const fxRate = d("0.045");
  const shipping = d(3000);
  const totalUnits = 50 + 5 + 30; // 85
  const perUnitShipping = shipping.div(totalUnits); // ~35.29

  const shipment = await prisma.shipment.create({
    data: {
      reference: "SAMPLE-SH-001",
      shippedAt: daysAgo(20),
      arrivedAt: daysAgo(10),
      fxRateInrToAed: fxRate,
      totalShippingInr: shipping,
      shippingAllocationMethod: "EQUAL_PER_UNIT",
      notes: "Sample shipment from Mumbai",
    },
  });

  const lineSpecs = [
    { itemId: items[0].id, qty: 50, unitPriceInr: d(200) },
    { itemId: items[1].id, qty: 5, unitPriceInr: d(2500) },
    { itemId: items[2].id, qty: 30, unitPriceInr: d(150) },
  ];

  for (const spec of lineSpecs) {
    const allocatedShipping = perUnitShipping
      .mul(spec.qty)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const landedPerUnit = spec.unitPriceInr
      .add(allocatedShipping.div(spec.qty))
      .mul(fxRate)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN);

    const line = await prisma.shipmentLine.create({
      data: {
        shipmentId: shipment.id,
        itemId: spec.itemId,
        quantity: spec.qty,
        unitPurchasePriceInr: spec.unitPriceInr,
        allocatedShippingInr: allocatedShipping,
        landedCostAed: landedPerUnit,
      },
    });
    await prisma.stockMovement.create({
      data: {
        itemId: spec.itemId,
        quantity: spec.qty,
        type: "SHIPMENT_IN",
        shipmentLineId: line.id,
        unitCostAed: landedPerUnit,
      },
    });
  }
  console.log("  · 1 shipment with 3 lines (85 units total)");

  // Customer
  const customer = await prisma.customer.create({
    data: {
      name: "Reem al Falasi",
      email: "reem@example.com",
      mobile: "+971 50 123 4567",
      deliveryAddress: "Marina Tower 2, Dubai",
    },
  });

  // A few sales over the past week
  const saleSpecs = [
    {
      daysBack: 5,
      lines: [
        { itemId: items[0].id, qty: 6, price: d("18.00") },
        { itemId: items[2].id, qty: 4, price: d("12.00") },
      ],
      customerId: customer.id,
      placeOfSale: "Store",
    },
    {
      daysBack: 3,
      lines: [{ itemId: items[1].id, qty: 1, price: d("180.00") }],
      customerId: null, // walk-in
      placeOfSale: "Exhibition",
    },
    {
      daysBack: 1,
      lines: [{ itemId: items[2].id, qty: 8, price: d("12.00") }],
      customerId: customer.id,
      placeOfSale: "Online",
    },
  ];

  for (let i = 0; i < saleSpecs.length; i++) {
    const s = saleSpecs[i];
    const subtotal = s.lines.reduce(
      (acc, l) => acc.add(l.price.mul(l.qty)),
      d(0),
    );
    const vatRate = d(5);
    const vatAmount = subtotal.mul(vatRate).div(100).toDecimalPlaces(2);
    const invoiceNumber = `SAMPLE-INV-${(i + 1).toString().padStart(3, "0")}`;

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber,
        customerId: s.customerId,
        soldAt: daysAgo(s.daysBack),
        placeOfSale: s.placeOfSale,
        vatRatePct: vatRate,
        vatAmountAed: vatAmount,
      },
    });

    // For sample data we know there's exactly one shipment layer per item.
    for (const line of s.lines) {
      const shipmentLine = await prisma.shipmentLine.findFirst({
        where: { shipmentId: shipment.id, itemId: line.itemId },
      });
      const unitCost = shipmentLine!.landedCostAed as Prisma.Decimal;
      const saleLine = await prisma.saleLine.create({
        data: {
          saleId: sale.id,
          itemId: line.itemId,
          quantity: line.qty,
          unitSalePriceAed: line.price,
          unitCostAedSnapshot: unitCost,
        },
      });
      await prisma.stockMovement.create({
        data: {
          itemId: line.itemId,
          quantity: -line.qty,
          type: "SALE_OUT",
          saleLineId: saleLine.id,
          shipmentLineId: shipmentLine!.id,
          unitCostAed: unitCost,
        },
      });
    }
  }
  console.log(`  · ${saleSpecs.length} sales`);

  // Opex this month. Bilal personally fronts the rent + utilities — these are tracked
  // as reimbursable costs he advanced (paidByPartnerId), NOT as equity. Ownership share
  // stays based on capital investment only.
  const opexEntries = [
    { category: "RENT", amount: d(3000), days: 8, paidByPartnerId: pB.id as string | null },
    { category: "SALARY", amount: d(5000), days: 8, paidByPartnerId: null },
    { category: "UTILITY", amount: d(450), days: 4, paidByPartnerId: pB.id as string | null },
    { category: "MARKETING", amount: d(800), days: 2, paidByPartnerId: null },
  ];
  for (const o of opexEntries) {
    await prisma.opexEntry.create({
      data: {
        category: o.category,
        amountAed: o.amount,
        incurredAt: daysAgo(o.days),
        paidByPartnerId: o.paidByPartnerId,
      },
    });
  }
  console.log(`  · ${opexEntries.length} opex entries (2 fronted by Bilal, reimbursable)`);

  console.log("Sample data done.");
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
