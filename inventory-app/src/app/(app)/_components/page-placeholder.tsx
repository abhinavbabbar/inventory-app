export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-neutral-500 mt-1">{description}</p>
      </header>
      <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
        <p className="text-sm text-neutral-500">
          Coming in <span className="font-medium text-neutral-700 dark:text-neutral-300">{phase}</span>
        </p>
      </div>
    </div>
  );
}
