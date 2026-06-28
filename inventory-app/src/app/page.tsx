import Link from "next/link";

export const metadata = {
  title: "BookWise — Your digital accountant",
  description:
    "BookWise is the all-in-one inventory, invoicing and accounting app — from stock and purchase orders to invoices, VAT, reports and live FX.",
};

const features = [
  { title: "Inventory & landed cost", desc: "FIFO costing, reorder alerts, on-order tracking.", grad: "from-cyan-500 to-blue-600", icon: "M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7" },
  { title: "Invoices & 5% VAT", desc: "Branded PDFs with VAT shown separately.", grad: "from-indigo-500 to-violet-600", icon: "M6 2h9l5 5v15H6zM14 2v6h6" },
  { title: "Estimates → orders", desc: "Quote, convert, dispatch — one flow.", grad: "from-violet-500 to-fuchsia-600", icon: "M4 5h16M4 12h16M4 19h10" },
  { title: "Purchase orders", desc: "Order, receive into shipments, track dues.", grad: "from-blue-500 to-indigo-600", icon: "M3 3h2l2 13h11l2-8H7M9 21h0M18 21h0" },
  { title: "Reports & P&L", desc: "Profit, VAT return, AR/AP aging.", grad: "from-emerald-500 to-teal-600", icon: "M4 19V5m4 14V9m4 10V7m4 12v-6m4 6V11" },
  { title: "Live multi-currency FX", desc: "Real-time rates with a built-in converter.", grad: "from-amber-500 to-orange-600", icon: "M4 12a8 8 0 0114-5m2 5a8 8 0 01-14 5M8 7H4V3m12 14h4v4" },
  { title: "Partner P&L", desc: "Multi-currency capital and profit split.", grad: "from-fuchsia-500 to-pink-600", icon: "M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 6a3 3 0 100 6 3 3 0 000-6zm11 14v-2a4 4 0 00-3-3.8" },
  { title: "Email & WhatsApp", desc: "Send invoices and chase payments instantly.", grad: "from-green-500 to-emerald-600", icon: "M3 7l9 6 9-6M3 7v10h18V7" },
];

const pills = ["Inventory", "Shipments", "Purchase orders", "Suppliers", "Estimates", "Orders", "Invoices", "VAT 5%", "Reports", "Live FX", "Partners", "WhatsApp", "Email", "Multi-payer payments"];

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-fuchsia-50/50 to-cyan-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Animated gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bw-blob absolute -top-24 -left-24 h-96 w-96 rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="bw-blob bw-delay-2 absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="bw-blob bw-delay-4 absolute -bottom-24 left-1/4 h-96 w-96 rounded-full bg-cyan-400/30 blur-3xl" />
      </div>

      <div className="relative">
        {/* Nav */}
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm" />
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
              BookWise
            </span>
          </div>
          <Link href="/login" className="h-9 px-4 inline-flex items-center rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-sm">
            Sign in
          </Link>
        </nav>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-8 grid lg:grid-cols-2 gap-10 items-center">
          <div className="bw-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-900 bg-white/60 dark:bg-white/5 backdrop-blur px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Built for modern businesses
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl font-bold leading-tight">
              <span className="bw-gradient-anim bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-cyan-600 dark:from-indigo-400 dark:via-fuchsia-400 dark:to-cyan-400 bg-clip-text text-transparent">
                One-stop
              </span>{" "}
              solution for your business.
            </h1>
            <p className="mt-3 text-lg font-medium text-neutral-600 dark:text-neutral-300">Your digital accountant.</p>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 max-w-md">
              Inventory, purchase orders, invoices with VAT, partner P&amp;L and live multi-currency rates — beautifully
              simple, from stock to invoice.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login" className="h-11 px-6 inline-flex items-center rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/25">
                Get started →
              </Link>
              <a href="#features" className="h-11 px-6 inline-flex items-center rounded-xl text-sm font-semibold border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-white/5 backdrop-blur hover:bg-white dark:hover:bg-white/10">
                See features
              </a>
            </div>
            <p className="mt-4 text-xs text-neutral-500">No setup fees · runs on web &amp; mobile (PWA) · your data, your rules.</p>
          </div>

          {/* Floating mockup tiles */}
          <div className="relative h-80 sm:h-96">
            <div className="bw-float absolute left-2 top-6 w-44 rounded-2xl p-4 text-white shadow-xl shadow-indigo-500/20 bg-gradient-to-br from-indigo-500 to-violet-600">
              <div className="text-xs text-white/80">MTD revenue</div>
              <div className="text-2xl font-bold tabular-nums mt-1">AED 24,500</div>
              <div className="text-xs text-white/70 mt-1">this month</div>
            </div>
            <div className="bw-float-slow bw-delay-2 absolute right-2 top-0 w-44 rounded-2xl p-4 text-white shadow-xl shadow-emerald-500/20 bg-gradient-to-br from-emerald-500 to-teal-600">
              <div className="text-xs text-white/80">Net profit</div>
              <div className="text-2xl font-bold tabular-nums mt-1">AED 12,800</div>
              <div className="text-xs text-white/70 mt-1">+18% vs last month</div>
            </div>
            <div className="bw-float bw-delay-3 absolute left-10 bottom-2 w-48 rounded-2xl p-4 text-white shadow-xl shadow-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500 to-pink-600">
              <div className="text-xs text-white/80">Receivables</div>
              <div className="text-2xl font-bold tabular-nums mt-1">AED 8,500</div>
              <div className="text-xs text-white/70 mt-1">3 customers · aging</div>
            </div>
            <div className="bw-float-slow bw-delay-1 absolute right-6 bottom-10 w-40 rounded-2xl p-4 shadow-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md">
              <div className="text-xs text-neutral-500">Live FX</div>
              <div className="text-lg font-bold tabular-nums mt-1 text-cyan-600 dark:text-cyan-400">1 USD = 3.67 AED</div>
              <div className="text-[11px] text-neutral-400 mt-1">Live central-bank rate</div>
            </div>
          </div>
        </section>

        {/* Marquee */}
        <div className="relative overflow-hidden py-4 border-y border-white/50 dark:border-white/10 bg-white/40 dark:bg-white/5 backdrop-blur">
          <div className="bw-marquee flex w-max gap-3">
            {[...pills, ...pills].map((p, i) => (
              <span key={i} className="shrink-0 rounded-full bg-gradient-to-r from-indigo-100 to-fuchsia-100 dark:from-indigo-950/50 dark:to-fuchsia-950/50 text-indigo-700 dark:text-indigo-300 px-4 py-1.5 text-sm font-medium">
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">Everything your business needs</h2>
          <p className="mt-2 text-center text-neutral-600 dark:text-neutral-400">From stock to invoice to profit — all in one place.</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-md p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${f.grad} flex items-center justify-center shadow-sm`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={f.icon} />
                  </svg>
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="rounded-3xl overflow-hidden relative bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-10 sm:p-14 text-center text-white shadow-xl shadow-indigo-500/20">
            <h2 className="text-2xl sm:text-3xl font-bold">Ready to balance the books?</h2>
            <p className="mt-2 text-white/80">Start managing inventory, invoices and profit with BookWise today.</p>
            <Link href="/login" className="mt-6 inline-flex h-11 px-7 items-center rounded-xl bg-white text-indigo-700 font-semibold hover:bg-indigo-50">
              Sign in to BookWise →
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/50 dark:border-white/10 py-8">
          <div className="mx-auto max-w-6xl px-6 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600" />
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">BookWise</span>
              <span className="text-neutral-400">· Your digital accountant</span>
            </div>
            <div>© {year} BookWise</div>
          </div>
        </footer>
      </div>
    </main>
  );
}
