import { useState, useRef, useEffect, useMemo, useCallback, useId, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
  align?: "left" | "right";
  fullWidth?: boolean; // stretch + inline panel for the mobile filter sheet
}

// checkbox dropdown with optional search filter

export function MultiSelectDropdown({ label, options, selected, onChange, searchable, align = "left", fullWidth = false }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const showSearch = searchable ?? options.length > 6;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  useClickOutside(ref, open, closeDropdown);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeDropdown();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, closeDropdown]);

  const filtered = useMemo(() => {
    if (!filter) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

  const boundedActiveIndex = filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      if (showSearch) inputRef.current?.focus();
      else optionRefs.current[boundedActiveIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [boundedActiveIndex, open, showSearch]);

  function onListboxKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (filtered.length === 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? filtered.length - 1 : event.key === "ArrowDown" ? (boundedActiveIndex + 1) % filtered.length : (boundedActiveIndex - 1 + filtered.length) % filtered.length;
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  }

  const count = selected.length;

  return (
    <div ref={ref} className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all ${
          fullWidth ? "w-full justify-between" : ""
        } ${
          count > 0
            ? "border-primary-dim bg-primary/6 text-primary"
            : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
        }`}
        onClick={() => {
          setOpen((prev) => {
            if (prev) setFilter("");
            return !prev;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        {label}
        <span className={`text-[9px] px-1 rounded-sm min-w-[1ch] text-center ${count > 0 ? "bg-primary/15" : "invisible"}`}>
          {count || 0}
        </span>
        <span className="text-text-dim text-[9px]">{fullWidth && open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className={
          fullWidth
            ? "mt-1 w-full bg-bg-raised border border-border rounded-md py-1"
            : `absolute top-full mt-1 w-52 ${align === "right" ? "right-0" : "left-0"} max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1`
        }>
          {showSearch && (
            <div className="px-2 pb-1">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && filtered.length > 0) {
                    event.preventDefault();
                    optionRefs.current[boundedActiveIndex]?.focus();
                  }
                }}
                placeholder="Filter..."
                aria-label={`Filter ${label}`}
                className="w-full text-[11px] font-mono bg-bg-surface border border-border rounded px-2 py-1 text-text-bright placeholder:text-text-dim"
              />
            </div>
          )}

          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle mb-1">
            <button
              type="button"
              className={`text-[11px] font-mono transition-colors ${
                count === options.length ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange(options.map((o) => o.value))}
            >
              All
            </button>
            <span className="text-border text-[11px]">·</span>
            <button
              type="button"
              className={`text-[11px] font-mono transition-colors ${
                count === 0 ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange([])}
            >
              None
            </button>
          </div>

          <div id={listboxId} className="max-h-64 overflow-y-auto" role="listbox" aria-label={label} aria-multiselectable="true" onKeyDown={onListboxKeyDown}>
            {filtered.map((opt, index) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={index === boundedActiveIndex ? 0 : -1}
                  onFocus={() => setActiveIndex(index)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1 text-left text-xs font-mono transition-colors ${
                    isSelected
                      ? "text-text-bright bg-primary/10"
                      : "text-text-muted hover:text-text-normal hover:bg-primary/8"
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      onChange(selected.filter((v) => v !== opt.value));
                    } else {
                      onChange([...selected, opt.value]);
                    }
                  }}
                >
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "border-primary bg-primary/20"
                      : "border-border"
                  }`}>
                    {isSelected && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-[11px] font-mono text-text-dim">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
