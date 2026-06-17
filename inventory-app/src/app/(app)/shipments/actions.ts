"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { SHIPPING_ALLOCATION_METHODS } from "@/lib/domain";
import { allocateShipping, landedCostAedPerUnit, AllocationError } from "@/lib/shipping";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => !v.startsWith("-"), "Must be non-negative");

const shipmentLineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().int().positive(),
  unitPurchasePriceInr: decimalString,
  manualShippingInr: z.string().trim().optional().nullable(),
});

const shipmentSchema = z.object({
  reference: z.string().trim().min(1).max(64),
  shippedAt: z.coerce.date(),
  arrivedAt: z
    .union([z.coerce.date(), z.literal("").transform(() => null), z.null()])
    .optional()
    .transform((v) => (v instanceof Date ? v : null)),
  fxRateInrToAed: decimalString,
  totalShippingInr: decimalString,
  shippingAllocationMethod: z.enum(SHIPPING_ALLOCATION_METHODS),
  notes: z.string().trim().max(500).optional().transform((v) => v ?? null),
  lines: z.array(shipmentLineSchema).min(1, "At least one line is required"),
});

export type ShipmentFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
    lines?: Array<Partial<Record<string, string>> | undefined>;
  };
};

export async function createShipment(
  _prev: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const session = await auth();
  if (!session?.user) return { errors: { form: "Unauthorized" } };
  if (!can(session.user, "shipments", "create")) return { errors: { form: "Forbidden" } };

  // FormData carries `lines` as a JSON string; everything else is flat.
  const linesRaw = formData.get("lines");
  let linesJson: unknown;
  try {
    linesJson = JSON.parse(typeof linesRaw === "string" ? linesRaw : "[]");
  } catch {
    return { errors: { form: "Invalid line items payload" } };
  }

  const parsed = shipmentSchema.safeParse({
    reference: formData.get("reference"),
    shippedAt: formData.get("shippedAt"),
    arrivedAt: formData.get("arrivedAt"),
    fxRateInrToAed: formData.get("fxRateInrToAed"),
    totalShippingInr: formData.get("totalShippingInr"),
    shippingAllocationMethod: formData.get("shippingAllocationMethod"),
    notes: formData.get("notes"),
    lines: linesJson,
  });

  if (!parsed.success) {
    return fieldErrors(parsed.error);
  }

  const data = parsed.data;

  // Ensure all itemIds exist
  const ids = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (items.length !== ids.length) {
    return { errors: { form: "One or more selected items no longer exist" } };
  }

  // Allocate shipping + compute landed cost
  const totalShippingInr = new Prisma.Decimal(data.totalShippingInr);
  const fxRate = new Prisma.Decimal(data.fxRateInrToAed);
  const linesForCompute = data.lines.map((l) => ({
    quantity: l.quantity,
    unitPurchasePriceInr: new Prisma.Decimal(l.unitPurchasePriceInr),
    manualShippingInr:
      l.manualShippingInr && l.manualShippingInr.trim().length > 0
        ? new Prisma.Decimal(l.manualShippingInr)
        : null,
  }));

  let allocated;
  try {
    allocated = allocateShipping({
      totalShippingInr,
      method: data.shippingAllocationMethod,
      lines: linesForCompute,
    });
  } catch (err) {
    if (err instanceof AllocationError) {
      return { errors: { form: err.message } };
    }
    throw err;
  }

  // Reference must be unique
  const refConflict = await prisma.shipment.findUnique({
    where: { reference: data.reference },
    select: { id: true },
  });
  if (refConflict) {
    return { errors: { fields: { reference: "A shipment with this reference already exists" } } };
  }

  const result = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        reference: data.reference,
        shippedAt: data.shippedAt,
        arrivedAt: data.arrivedAt,
        fxRateInrToAed: fxRate,
        totalShippingInr: totalShippingInr,
        shippingAllocationMethod: data.shippingAllocationMethod,
        notes: data.notes,
      },
    });

    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      const lineCompute = linesForCompute[i];
      const allocation = allocated[i];

      const landed = landedCostAedPerUnit({
        unitPurchasePriceInr: lineCompute.unitPurchasePriceInr,
        allocatedShippingInr: allocation.allocatedShippingInr,
        quantity: line.quantity,
        fxRateInrToAed: fxRate,
      });

      const created = await tx.shipmentLine.create({
        data: {
          shipmentId: shipment.id,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPurchasePriceInr: lineCompute.unitPurchasePriceInr,
          manualShippingInr: lineCompute.manualShippingInr,
          allocatedShippingInr: allocation.allocatedShippingInr,
          landedCostAed: landed,
        },
      });

      await tx.stockMovement.create({
        data: {
          itemId: line.itemId,
          quantity: line.quantity,
          type: "SHIPMENT_IN",
          shipmentLineId: created.id,
          unitCostAed: landed,
        },
      });
    }

    return shipment;
  });

  revalidatePath("/shipments");
  revalidatePath("/inventory");
  redirect(`/shipments/${result.id}`);
}

function fieldErrors(error: z.ZodError): ShipmentFormState {
  const fields: Record<string, string> = {};
  const lines: Array<Partial<Record<string, string>> | undefined> = [];

  for (const issue of error.issues) {
    const [first, second, third] = issue.path;
    if (first === "lines" && typeof second === "number") {
      const slot = lines[second] ?? {};
      slot[String(third ?? "form")] = issue.message;
      lines[second] = slot;
    } else if (typeof first === "string" && !fields[first]) {
      fields[first] = issue.message;
    }
  }
  return { errors: { fields, lines: lines.length > 0 ? lines : undefined } };
}
