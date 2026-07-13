import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { canonicalizeInvestigationPath, createSavedInvestigation, deleteSavedInvestigation, importSavedInvestigations, renameSavedInvestigation } from "./storage";
import { useSavedInvestigations } from "./useLocalInvestigations";

export function InvestigationsView() {
  const [items, refresh] = useSavedInvestigations();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const importing = useRef<HTMLInputElement>(null);
  const source = useMemo(() => {
    try { return canonicalizeInvestigationPath(params.get("source") ?? "/?tab=Home"); } catch { return "/?tab=Home"; }
  }, [params]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const creating = params.get("create") === "1";

  function closeCreate() {
    setParams((current) => { const next = new URLSearchParams(current); next.delete("create"); next.delete("source"); return next; }, { replace: true });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `beacon-investigations-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function copyLink(path: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable");
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setError("");
      setNotice("Investigation link copied");
    } catch (cause) {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "Copy failed");
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base p-3 md:p-4">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <header className="rounded-sm border border-border bg-bg-surface p-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">Browser-local workspaces</div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="m-0 font-mono text-lg font-semibold uppercase tracking-wider text-text-bright">Investigations</h1>
            <div className="flex gap-2">
              <button type="button" className="min-h-11 border border-border px-3 font-mono text-[11px] uppercase text-text-normal" onClick={() => importing.current?.click()}>Import</button>
              <button type="button" className="min-h-11 border border-border px-3 font-mono text-[11px] uppercase text-text-normal" onClick={exportJson}>Export</button>
            </div>
          </div>
          <input ref={importing} className="hidden" type="file" accept="application/json" onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            try { importSavedInvestigations(await file.text()); setError(""); refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed"); }
            event.currentTarget.value = "";
          }} />
        </header>

        {creating && (
          <form className="rounded-sm border border-primary/45 bg-bg-surface p-3" onSubmit={(event) => { event.preventDefault(); createSavedInvestigation(name, source); setName(""); setError(""); refresh(); closeCreate(); }}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-primary">Save current workspace</div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1.5fr_auto_auto]">
              <input autoFocus aria-label="Investigation name" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Investigation name" className="min-h-11 border border-border bg-bg-base px-3 font-mono text-sm text-text-bright" />
              <input aria-label="Investigation path" value={source} readOnly className="min-h-11 min-w-0 border border-border bg-bg-base px-3 font-mono text-xs text-text-muted" />
              <button type="submit" className="min-h-11 border border-primary/45 bg-primary/10 px-4 font-mono text-[11px] font-semibold uppercase text-primary">Save</button>
              <button type="button" className="min-h-11 border border-border px-4 font-mono text-[11px] uppercase text-text-muted" onClick={closeCreate}>Cancel</button>
            </div>
          </form>
        )}

        {error && <div role="alert" className="border border-danger/45 bg-danger/8 p-3 font-mono text-xs text-danger">{error}</div>}
        <div role="status" aria-live="polite" className={notice ? "border border-green/40 bg-green/8 p-3 font-mono text-xs text-green" : "sr-only"}>{notice}</div>
        {items.length === 0 ? (
          <div className="rounded-sm border border-border bg-bg-surface p-8 text-center font-mono text-sm text-text-dim">No saved investigations. Use Ctrl+K and choose Save Investigation.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <article key={item.id} className="grid gap-2 rounded-sm border border-border bg-bg-surface p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <input aria-label={`Rename ${item.name}`} defaultValue={item.name} onBlur={(event) => { renameSavedInvestigation(item.id, event.currentTarget.value); refresh(); }} className="w-full bg-transparent font-mono text-sm font-semibold text-text-bright focus:outline-none" />
                  <div className="mt-1 truncate font-mono text-[10px] text-text-dim">{item.path}</div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button type="button" className="min-h-11 border border-primary/40 px-3 font-mono text-[10px] uppercase text-primary" onClick={() => navigate(item.path)}>Open</button>
                  <button type="button" className="min-h-11 border border-border px-3 font-mono text-[10px] uppercase text-text-normal" onClick={() => void copyLink(item.path)}>Copy link</button>
                  <button type="button" className="min-h-11 border border-border px-3 font-mono text-[10px] uppercase text-text-normal" onClick={() => { createSavedInvestigation(`${item.name} copy`, item.path); setNotice("Investigation duplicated"); refresh(); }}>Copy</button>
                  <button type="button" className="min-h-11 border border-danger/35 px-3 font-mono text-[10px] uppercase text-danger" onClick={() => { if (!window.confirm(`Delete ${item.name}?`)) return; deleteSavedInvestigation(item.id); setNotice("Investigation deleted"); refresh(); }}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
