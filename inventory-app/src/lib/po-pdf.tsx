import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { Prisma } from "@prisma/client";
import { sumDecimal } from "@/lib/money";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  hr: { borderBottomWidth: 1, borderColor: "#e5e7eb", marginVertical: 12 },
  logo: { maxWidth: 150, maxHeight: 56, objectFit: "contain", marginBottom: 8 },
  companyName: { fontSize: 18, fontWeight: 700 },
  muted: { color: "#6b7280" },
  title: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 11, fontWeight: 600, marginTop: 2 },
  block: { marginTop: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 4 },
  table: { marginTop: 16, borderTopWidth: 1, borderColor: "#e5e7eb" },
  th: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 8, paddingHorizontal: 6 },
  thc: { fontWeight: 700, fontSize: 9, color: "#4b5563", textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: "#e5e7eb" },
  cDesc: { flex: 3 },
  cQty: { flex: 1, textAlign: "right" },
  cPrice: { flex: 1.5, textAlign: "right" },
  cTotal: { flex: 1.5, textAlign: "right" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderColor: "#1f2937", marginTop: 4, alignSelf: "flex-end", width: 240 },
  grand: { fontWeight: 700, fontSize: 12 },
  footer: { position: "absolute", bottom: 36, left: 36, right: 36, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmt = (v: Prisma.Decimal | number) => inrFmt.format(typeof v === "number" ? v : v.toNumber());
const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export type PoPdfInput = {
  company: { name: string; tagline: string; phone: string; address: string; logoUrl: string };
  po: { poNumber: string; orderedAt: Date; expectedAt: Date | null; notes: string | null };
  supplier: { name: string; phone: string | null; email: string | null; address: string | null };
  lines: Array<{ description: string; sku: string; quantity: number; unitPurchasePriceInr: Prisma.Decimal }>;
};

export function PoDocument({ data }: { data: PoPdfInput }) {
  const total = sumDecimal(data.lines.map((l) => l.unitPurchasePriceInr.mul(l.quantity)));
  const logo = data.company.logoUrl?.trim() ?? "";
  const showLogo = logo.startsWith("data:image/") || /^https?:\/\//i.test(logo);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.spaceBetween}>
          <View>
            {showLogo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.address ? <Text style={[styles.muted, { marginTop: 4 }]}>{data.company.address}</Text> : null}
            {data.company.phone ? <Text style={[styles.muted, { marginTop: 2 }]}>Tel: {data.company.phone}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>PURCHASE ORDER</Text>
            <Text style={[styles.muted, { textAlign: "right", marginTop: 4 }]}>{data.po.poNumber}</Text>
            <Text style={[styles.muted, { textAlign: "right" }]}>{dateFmt.format(data.po.orderedAt)}</Text>
            {data.po.expectedAt ? (
              <Text style={[styles.muted, { textAlign: "right" }]}>Expected: {dateFmt.format(data.po.expectedAt)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.hr} />

        <Text style={styles.label}>Supplier</Text>
        <View style={styles.block}>
          <Text style={styles.value}>{data.supplier.name}</Text>
          {(data.supplier.phone || data.supplier.email) && (
            <Text style={[styles.muted, { marginTop: 2 }]}>
              {[data.supplier.phone, data.supplier.email].filter(Boolean).join(" · ")}
            </Text>
          )}
          {data.supplier.address ? <Text style={[styles.muted, { marginTop: 4 }]}>{data.supplier.address}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.thc, styles.cDesc]}>Item</Text>
            <Text style={[styles.thc, styles.cQty]}>Qty</Text>
            <Text style={[styles.thc, styles.cPrice]}>Unit price (INR)</Text>
            <Text style={[styles.thc, styles.cTotal]}>Line total</Text>
          </View>
          {data.lines.map((line, idx) => (
            <View key={idx} style={styles.tr}>
              <View style={styles.cDesc}>
                <Text>{line.description}</Text>
                <Text style={[styles.muted, { fontSize: 8 }]}>SKU {line.sku}</Text>
              </View>
              <Text style={styles.cQty}>{line.quantity}</Text>
              <Text style={styles.cPrice}>{fmt(line.unitPurchasePriceInr)}</Text>
              <Text style={styles.cTotal}>{fmt(line.unitPurchasePriceInr.mul(line.quantity))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.grand}>Total</Text>
          <Text style={styles.grand}>{fmt(total)}</Text>
        </View>

        {data.po.notes ? (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.label}>Notes</Text>
            <Text style={{ marginTop: 4 }}>{data.po.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>Purchase order · {dateFmt.format(new Date())}</Text>
      </Page>
    </Document>
  );
}

export async function renderPoPdf(data: PoPdfInput): Promise<Buffer> {
  return renderToBuffer(<PoDocument data={data} />);
}
