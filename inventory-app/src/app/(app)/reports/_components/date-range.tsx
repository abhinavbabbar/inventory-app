import Link from "next/link";

// Server-rendered GET form: pick a from/to range, submit reloads the page with
// ?from=&to=. Quick presets are plain links.
export function DateRangeForm({
  basePath,
  from,
  to,
}: {
  basePath: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}) {
  const now = new Date();
  const ymd = (dt: Date) =>
    `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, "0")}-${dt
      .getDate()
      .toString()
      .padStart(2, "0")}`;

  const thisMonth = { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  const lastMonth = {
    from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
  const thisYear = { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(now) };

  const preset = (label: string, r: { from: string; to: string }) => (
    <Link
      href={`${basePath}?from=${r.from}&to=${r.to}`}
      className="px-2.5 h-7 inline-flex items-center rounded-full text-xs font-medium bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 dark:bg-fuchsia-900/30 dark:text-fuchsia-300"
    >
      {label}
    </Link>
  );

  const inputClass =
    "h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm";

  return (
    <div className="space-y-2">
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="from" className="block text-xs text-neutral-500 mb-1">From</label>
          <input id="from" type="date" name="from" defaultValue={from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs text-neutral-500 mb-1">To</label>
          <input id="to" type="date" name="to" defaultValue={to} className={inputClass} />
        </div>
        <button
          type="submit"
          className="h-9 px-3 rounded-md text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
        >
          Apply
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {preset("This month", thisMonth)}
        {preset("Last month", lastMonth)}
        {preset("This year", thisYear)}
      </div>
    </div>
  );
}
