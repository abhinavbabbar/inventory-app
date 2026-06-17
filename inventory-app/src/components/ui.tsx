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
    "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200",
  secondary:
    "bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
  ghost:
    "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
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
  "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100";

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
        "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900",
        className,
      )}
    >
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
        <h1 className="text-2xl font-semibold">{title}</h1>
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
        "rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto",
        className,
      )}
    >
      <table className="w-full text-sm min-w-[640px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
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
