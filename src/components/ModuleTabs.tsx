import "../features/shared/responsive-panels.css";

interface ModuleTabOption<T extends string> {
  id: T;
  label: string;
  description?: string;
}

interface ModuleTabsProps<T extends string> {
  label: string;
  options: readonly ModuleTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ModuleTabs<T extends string>({ label, options, value, onChange }: ModuleTabsProps<T>) {
  return (
    <div className="module-tabs crt-panel flex shrink-0 flex-col gap-2 border-b border-border bg-bg-surface/95 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
        <div className="truncate font-mono text-[13px] font-semibold text-text-bright">
          {options.find((option) => option.id === value)?.description ?? value}
        </div>
      </div>
      <div className="module-tab-scroll relative max-w-full min-w-0 overflow-hidden">
        <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto pb-1 pr-6 md:pb-0">
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(option.id)}
                className={`module-tab-button shrink-0 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? "border-primary/55 bg-primary/14 text-text-bright shadow-[inset_0_0_16px_rgba(var(--rgb-primary),0.12)]"
                    : "border-border-subtle bg-bg-base/65 text-text-muted hover:border-primary/35 hover:text-text-normal"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
