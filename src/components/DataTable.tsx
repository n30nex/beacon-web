import { memo, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./SkeletonRows";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useTick } from "../hooks/useTick";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string; // extra classes applied to the <td>
  sortValue?: (row: T) => string | number | null | undefined; // column is sortable when present
}

type SortDirection = "asc" | "desc";

// Memoized rows: a single WS patch changes one row's object ref, and selection touches two rows, so
// only those re-render instead of the whole (un-virtualized) table. `tickVersion` is passed but not
// read — it opts every row into the shared 10s refresh (recency-derived cells like the observer
// status dot / "last heard" tooltips) without coupling that refresh to unrelated parent re-renders.
interface RowProps<T> {
  columns: Column<T>[];
  row: T;
  rowKeyStr: string;
  isSelected: boolean;
  onSelect: (key: string | null) => void;
  rowAriaLabel?: (row: T) => string;
  tickVersion: number;
}

function TableRowInner<T>({ columns, row, rowKeyStr, isSelected, onSelect, rowAriaLabel }: RowProps<T>) {
  const nextSelection = isSelected ? null : rowKeyStr;
  const selectRow = () => onSelect(nextSelection);
  return (
    <tr
      aria-label={rowAriaLabel?.(row) ?? `Select row ${rowKeyStr}`}
      aria-selected={isSelected}
      className={`border-b border-border/40 border-l-2 cursor-pointer transition-colors ${
        isSelected
          ? "bg-primary/12 border-l-primary shadow-[inset_0_0_18px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]"
          : "border-l-transparent hover:bg-primary/7 hover:border-l-primary/50 focus-visible:bg-primary/10 focus-visible:border-l-primary"
      }`}
      onClick={selectRow}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectRow();
      }}
      tabIndex={0}
    >
      {columns.map((col) => (
        <td key={col.header} className={`px-4 py-2 ${col.className ?? ""}`}>{col.cell(row)}</td>
      ))}
    </tr>
  );
}
const TableRow = memo(TableRowInner) as typeof TableRowInner;

function CardRowInner<T>({ row, rowKeyStr, isSelected, onSelect, renderCard, rowAriaLabel }: RowProps<T> & { renderCard: (row: T) => ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rowAriaLabel?.(row) ?? `Select row ${rowKeyStr}`}
      aria-pressed={isSelected}
      className={`w-full text-left px-3 py-2.5 border-l-2 cursor-pointer transition-colors ${
        isSelected
          ? "bg-primary/12 border-l-primary shadow-[inset_0_0_18px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]"
          : "border-l-transparent hover:bg-primary/7 hover:border-l-primary/50"
      }`}
      onClick={() => onSelect(isSelected ? null : rowKeyStr)}
    >
      {renderCard(row)}
    </button>
  );
}
const CardRow = memo(CardRowInner) as typeof CardRowInner;

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  isLoading?: boolean;
  emptyLabel: string;
  defaultSort?: { header: string; direction?: SortDirection };
  rowAriaLabel?: (row: T) => string;
  // called when the scroll position nears the bottom, for on-demand paging (omit = no infinite scroll)
  onEndReached?: () => void;
  // when set, rows render as stacked cards below the md breakpoint instead of a table; sort UI lives
  // in <thead>, so cards keep the defaultSort
  renderCard?: (row: T) => ReactNode;
}

// fire onEndReached once the viewport is within this many px of the list's end
const END_REACHED_THRESHOLD_PX = 200;

// selectable, sticky-header list table shared by the entity tabs (observers, nodes, …)

export function DataTable<T>({ columns, rows, rowKey, selectedKey, onSelect, isLoading, emptyLabel, defaultSort, rowAriaLabel, onEndReached, renderCard }: DataTableProps<T>) {
  const asCards = useIsMobile() && !!renderCard;
  const tickVersion = useTick(); // shared 10s ticker; threaded to rows so time-derived cells stay live
  const [sort, setSort] = useState<{ header: string; direction: SortDirection }>(() => ({
    header: defaultSort?.header ?? "",
    direction: defaultSort?.direction ?? "asc",
  }));

  function toggleSort(header: string) {
    setSort((prev) =>
      prev.header === header
        ? { header, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { header, direction: "asc" },
    );
  }

  const sortedRows = useMemo(() => {
    if (!rows) return rows;
    const col = columns.find((c) => c.header === sort.header && c.sortValue);
    if (!col?.sortValue) return rows;
    const getValue = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1; // empties sink to the bottom
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, columns, sort]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!onEndReached) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < END_REACHED_THRESHOLD_PX) onEndReached();
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SkeletonRows />
      </div>
    );
  }

  if (asCards) {
    return (
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {sortedRows && sortedRows.length > 0 ? (
          <div className="flex flex-col divide-y divide-border/60">
            {sortedRows.map((row) => {
              const key = rowKey(row);
              return (
                <CardRow
                  key={key}
                  columns={columns}
                  row={row}
                  rowKeyStr={key}
                  isSelected={key === selectedKey}
                  onSelect={onSelect}
                  rowAriaLabel={rowAriaLabel}
                  tickVersion={tickVersion}
                  renderCard={renderCard!}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState title={emptyLabel} />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-auto" onScroll={handleScroll}>
      {sortedRows && sortedRows.length > 0 ? (
        <table className="w-full text-xs font-mono">
          <thead className="crt-panel sticky top-0 bg-bg-surface z-10">
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              {columns.map((col) => {
                if (!col.sortValue) {
                  return <th key={col.header} scope="col" className="text-left px-4 py-2 font-medium">{col.header}</th>;
                }
                const active = sort.header === col.header;
                const nextDirection = active && sort.direction === "asc" ? "descending" : "ascending";
                return (
                  <th
                    key={col.header}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="text-left px-4 py-2 font-medium"
                    scope="col"
                  >
                    <button
                      type="button"
                      aria-label={`Sort by ${col.header} ${nextDirection}`}
                      onClick={() => toggleSort(col.header)}
                      className="flex min-h-9 items-center gap-1 cursor-pointer hover:text-text-normal transition-colors"
                    >
                      {col.header}
                      <span className={active ? "text-text-normal" : "text-text-dim/40"}>
                        {active ? (sort.direction === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const key = rowKey(row);
              return (
                <TableRow
                  key={key}
                  columns={columns}
                  row={row}
                  rowKeyStr={key}
                  isSelected={key === selectedKey}
                  onSelect={onSelect}
                  rowAriaLabel={rowAriaLabel}
                  tickVersion={tickVersion}
                />
              );
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState title={emptyLabel} />
      )}
    </div>
  );
}
