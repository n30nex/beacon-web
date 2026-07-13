import { useState, useRef, useCallback, useEffect, useId, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

export function Dropdown({ renderTrigger, align = "right", width = "w-48", fullWidth = false, children }: {
  renderTrigger: (props: { open: boolean; toggle: () => void; panelId: string }) => ReactNode;
  align?: "left" | "right";
  width?: string;
  // stretch + render the panel inline (accordion) for the mobile filter sheet
  fullWidth?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useClickOutside(ref, open, close);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const focusId = window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
    return () => window.cancelAnimationFrame(focusId);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocusRef.current = activeElement && activeElement !== document.body
      ? activeElement
      : ref.current?.querySelector<HTMLElement>("button, [role=button]") ?? null;
    const focusId = window.requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        '[aria-selected="true"], [aria-checked="true"], [role="menuitem"], [role="option"], button:not([disabled]), input:not([disabled])',
      );
      target?.focus();
    });
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // innermost layer wins — don't let an enclosing sheet/modal close too
      close();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  function movePanelFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"]), [role="option"]:not([aria-disabled="true"]), button:not([disabled]), input:not([disabled])',
    ) ?? []);
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? controls.length - 1
        : event.key === "ArrowDown"
          ? current < 0 ? 0 : (current + 1) % controls.length
          : current <= 0 ? controls.length - 1 : current - 1;
    event.preventDefault();
    controls[next]?.focus();
  }

  return (
    <div ref={ref} className={`relative ${fullWidth ? "w-full" : ""}`}>
      {renderTrigger({ open, toggle, panelId })}
      {open && (
        <div ref={panelRef} id={panelId} onKeyDown={movePanelFocus} className={
          fullWidth
            ? "crt-panel mt-1 w-full bg-bg-raised border border-border rounded-md py-1 max-h-72 overflow-y-auto"
            : `crt-panel absolute top-full mt-1 ${align === "left" ? "left-0" : "right-0"} ${width} max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg z-[120] py-1 max-h-80 overflow-y-auto`
        }>
          {children(close)}
        </div>
      )}
    </div>
  );
}
