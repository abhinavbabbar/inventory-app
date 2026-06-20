import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { Prisma } from "@prisma/client";
import { sumDecimal } from "@/lib/money";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  hr: { borderBottomWidth: 1, borderColor: "#e5e7eb", marginVertical: 12 },

  logo: { maxWidth: 150, maxHeight: 56, objectFit: "contain", marginBottom: 8 },
  companyName: { fontSize: 18, fontWeight: 700 },
  tagline: { fontSize: 9, color: "#6b7280", fontStyle: "italic", marginTop: 2 },
  muted: { color: "#6b7280" },
  invoiceTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 11, fontWeight: 600, marginTop: 2 },

  customerBlock: { marginTop: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 4 },

  table: { marginTop: 16, borderTopWidth: 1, borderColor: "#e5e7eb" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 8, paddingHorizontal: 6 },
  tableHeaderCell: { fontWeight: 700, fontSize: 9, color: "#4b5563", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: "#e5e7eb" },

  cellDesc: { flex: 3 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 1.5, textAlign: "right" },
  cellTotal: { flex: 1.5, textAlign: "right" },

  totalsBox: { marginTop: 12, alignSelf: "flex-end", width: 240 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalsGrand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderColor: "#1f2937", marginTop: 4 },
  grandLabel: { fontWeight: 700, fontSize: 12 },
  grandValue: { fontWeight: 700, fontSize: 12 },

  footer: { position: "absolute", bottom: 36, left: 36, right: 36, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 2,
});

function fmt(value: Prisma.Decimal | string | number): string {
  if (typeof value === "number") return aedFmt.format(value);
  if (typeof value === "string") return aedFmt.format(Number(value));
  return aedFmt.format(value.toNumber());
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export type InvoicePdfInput = {
  company: {
    name: string;
    tagline: string;
    phone: string;
    address: string;
    trn: string;
    logoUrl: string;
  };
  vat: {
    label: string;
    registrationNumber: string | null;
  };
  sale: {
    invoiceNumber: string;
    soldAt: Date;
    placeOfSale: string | null;
    vatRatePct: Prisma.Decimal;
    vatAmountAed: Prisma.Decimal;
    notes: string | null;
  };
  customer: {
    name: string;
    mobile: string | null;
    email: string | null;
    deliveryAddress: string | null;
  } | null;
  lines: Array<{
    description: string;
    sku: string;
    quantity: number;
    unitSalePriceAed: Prisma.Decimal;
  }>;
};

export function InvoiceDocument({ data }: { data: InvoicePdfInput }) {
  const subtotal = sumDecimal(
    data.lines.map((l) => l.unitSalePriceAed.mul(l.quantity)),
  );
  const total = subtotal.add(data.sale.vatAmountAed);
  const hasVat = !data.sale.vatRatePct.isZero();
  // Only embed a logo we can render safely (uploaded data URL or remote image).
  const logo = data.company.logoUrl?.trim() ?? "";
  const showLogo = logo.startsWith("data:image/") || /^https?:\/\//i.test(logo);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.spaceBetween}>
          <View>
            {showLogo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.tagline ? (
              <Text style={styles.tagline}>{data.company.tagline}</Text>
            ) : null}
            {data.company.address && (
              <Text style={[styles.muted, { marginTop: 4 }]}>{data.company.address}</Text>
            )}
            {data.company.phone && (
              <Text style={[styles.muted, { marginTop: 2 }]}>Tel: {data.company.phone}</Text>
            )}
            {data.vat.registrationNumber && (
              <Text style={[styles.muted, { marginTop: 2 }]}>
                {data.vat.label} TRN: {data.vat.registrationNumber}
              </Text>
            )}
            {!data.vat.registrationNumber && data.company.trn && (
              <Text style={[styles.muted, { marginTop: 2 }]}>TRN: {data.company.trn}</Text>
            )}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={[styles.muted, { textAlign: "right", marginTop: 4 }]}>
              {data.sale.invoiceNumber}
            </Text>
            <Text style={[styles.muted, { textAlign: "right" }]}>
              {dateFmt.format(data.sale.soldAt)}
            </Text>
            {data.sale.placeOfSale && (
              <Text style={[styles.muted, { textAlign: "right" }]}>
                Place: {data.sale.placeOfSale}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.hr} />

        {/* Bill to */}
        <Text style={styles.label}>Bill to</Text>
        <View style={styles.customerBlock}>
          {data.customer ? (
            <>
              <Text style={styles.value}>{data.customer.name}</Text>
              {(data.customer.mobile || data.customer.email) && (
                <Text style={[styles.muted, { marginTop: 2 }]}>
                  {[data.customer.mobile, data.customer.email].filter(Boolean).join(" · ")}
                </Text>
              )}
              {data.customer.deliveryAddress && (
                <Text style={[styles.muted, { marginTop: 4 }]}>{data.customer.deliveryAddress}</Text>
              )}
            </>
          ) : (
            <Text style={styles.value}>Walk-in customer</Text>
          )}
        </View>

        {/* Lines */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.cellPrice]}>Unit price</Text>
            <Text style={[styles.tableHeaderCell, styles.cellTotal]}>Line total</Text>
          </View>
          {data.lines.map((line, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.cellDesc}>
                <Text>{line.description}</Text>
                <Text style={[styles.muted, { fontSize: 8 }]}>SKU {line.sku}</Text>
              </View>
              <Text style={styles.cellQty}>{line.quantity}</Text>
              <Text style={styles.cellPrice}>{fmt(line.unitSalePriceAed)}</Text>
              <Text style={styles.cellTotal}>{fmt(line.unitSalePriceAed.mul(line.quantity))}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Subtotal</Text>
            <Text>{fmt(subtotal)}</Text>
          </View>
          {hasVat && (
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>
                {data.vat.label} ({data.sale.vatRatePct.toString()}%)
              </Text>
              <Text>{fmt(data.sale.vatAmountAed)}</Text>
            </View>
          )}
          <View style={styles.totalsGrand}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{fmt(total)}</Text>
          </View>
        </View>

        {data.sale.notes && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.label}>Notes</Text>
            <Text style={[{ marginTop: 4 }]}>{data.sale.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated by Inventory & P&L · {dateFmt.format(new Date())}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
