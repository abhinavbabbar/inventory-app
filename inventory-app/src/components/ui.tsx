import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link, { type LinkProps } from "next/link";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---- Button -----------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const buttonVariants = {
  primary:
    "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm hover:from-indigo-700 hover:to-violet-700 dark:from-indigo-500 dark:to-violet-500 dark:hover:from-indigo-400 dark:hover:to-violet-400",
  secondary:
    "bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 dark:bg-neutral-900 dark:text-indigo-300 dark:border-indigo-900/60 dark:hover:bg-indigo-950/40",
  ghost:
    "text-neutral-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-neutral-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300",
  danger:
    "bg-red-600 text-white hover:bg-red-700",
};
const buttonSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    />
  );
});

// ---- LinkButton (styled <Link>) --------------------------------------------

type LinkButtonProps = LinkProps & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
  children: React.ReactNode;
};

export function LinkButton({
  className,
  variant = "primary",
  size = "md",
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

// ---- Form primitives --------------------------------------------------------

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...rest }, ref) {
    return (
      <label
        ref={ref}
        className={cn("block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300", className)}
        {...rest}
      />
    );
  },
);

const inputBase =
  "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(inputBase, "min-h-[80px]", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn(inputBase, className)} {...rest} />;
  },
);

// ---- Card -------------------------------------------------------------------

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-md shadow-sm shadow-indigo-500/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---- StatTile (vibrant gradient KPI tile) -----------------------------------

export function StatTile({
  label,
  value,
  sub,
  grad,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  grad: string; // e.g. "from-emerald-500 to-teal-600"
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl p-4 text-white shadow-lg shadow-indigo-500/15 bg-gradient-to-br", grad)}>
      <div className="text-xs text-white/80">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {sub != null && <div className="text-xs text-white/70 mt-1">{sub}</div>}
      {children}
    </div>
  );
}

// ---- StatusPill -------------------------------------------------------------

export function StatusPill({
  status,
  label,
}: {
  status: "ok" | "warn" | "bad" | "muted";
  label: string;
}) {
  const styles = {
    ok: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    muted: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles[status])}>
      {label}
    </span>
  );
}

// ---- PageHeader -------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
          {title}
        </h1>
        {description != null && (
          <div className="text-sm text-neutral-500 mt-1">{description}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  );
}

// ---- Table primitives -------------------------------------------------------

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 overflow-x-auto",
        className,
      )}
    >
      <table className="w-full text-sm min-w-[640px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-gradient-to-r from-indigo-50/80 to-fuchsia-50/60 dark:from-indigo-950/40 dark:to-fuchsia-950/30 text-indigo-700/80 dark:text-indigo-300/80 text-xs uppercase tracking-wide">
      {children}
    </thead>
  );
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-neutral-100 dark:border-neutral-800 last:border-b-0", className)}>{children}</tr>;
}

export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("text-left font-medium px-4 py-2", className)}>{children}</th>;
}

export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2 align-middle", className)}>{children}</td>;
}

// ---- EmptyState -------------------------------------------------------------

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
