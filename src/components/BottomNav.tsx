import { useState, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { NavIcon } from "./NavIcon";
import { DATA_TABS, SYSTEM_TABS, TOOL_TABS, isDataTab, isSystemTab, type PageTab } from "../lib/navigation";

type NavIconName = Parameters<typeof NavIcon>[0]["name"];

const TAB_ICON: Record<PageTab, NavIconName> = {
  Home: "home",
  Packets: "packets",
  Map: "map",
  Live: "live",
  Channels: "channels",
  Nodes: "nodes",
  Observers: "observers",
  Routes: "routes",
  Netgraph: "netgraph",
  Traces: "traces",
  Analytics: "analytics",
  System: "system",
};

function NavButton({
  label,
  icon,
  active,
  onClick,
  ariaHasPopup,
  ariaExpanded,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  ariaHasPopup?: "menu";
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active && !ariaHasPopup ? "page" : undefined}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className={`flex h-14 flex-1 items-center justify-center transition-colors crt-icon ${
        active ? "text-primary" : "text-text-muted hover:text-text-normal"
      }`}
    >
      {icon}
    </button>
  );
}

function SheetItem({ tab, onPick }: { tab: PageTab; onPick: (tab: PageTab) => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-3 px-5 py-3 text-left font-mono text-sm font-semibold uppercase tracking-wider text-text-normal transition-colors hover:bg-primary/8 hover:text-text-bright"
      onClick={() => onPick(tab)}
    >
      <NavIcon name={TAB_ICON[tab]} size={20} />
      {tab}
    </button>
  );
}

function GroupSheet({
  label,
  tabs,
  onPick,
  onClose,
}: {
  label: string;
  tabs: readonly PageTab[];
  onPick: (tab: PageTab) => void;
  onClose: () => void;
}) {
  const hasTools = tabs.some((tab) => TOOL_TABS.includes(tab as (typeof TOOL_TABS)[number]));
  const directTabs = hasTools ? tabs.filter((tab) => !TOOL_TABS.includes(tab as (typeof TOOL_TABS)[number])) : tabs;

  return (
    <BottomSheet onClose={onClose} role="menu" label={label}>
      <div className="pb-2">
        {directTabs.map((tab) => (
          <SheetItem key={tab} tab={tab} onPick={onPick} />
        ))}
        {hasTools && (
          <>
            <div className="mx-5 my-1 border-t border-border-subtle pt-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">
              Tools
            </div>
            {TOOL_TABS.map((tab) => (
              <SheetItem key={tab} tab={tab} onPick={onPick} />
            ))}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

export function BottomNav({ activeTab, onOpenSearch, onTabChange }: { activeTab: string; onOpenSearch?: () => void; onTabChange: (tab: string) => void }) {
  const [openGroup, setOpenGroup] = useState<"Data" | "System" | null>(null);
  const dataActive = isDataTab(activeTab);
  const systemActive = isSystemTab(activeTab);

  const pick = (tab: PageTab) => {
    onTabChange(tab);
    setOpenGroup(null);
  };

  return (
    <>
      <nav className="crt-panel flex md:hidden shrink-0 bg-bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label="Mobile navigation">
        <NavButton label="Home" icon={<NavIcon name="home" />} active={activeTab === "Home"} onClick={() => pick("Home")} />
        <NavButton label="Live" icon={<NavIcon name="live" />} active={activeTab === "Live"} onClick={() => pick("Live")} />
        <NavButton label="Netgraph" icon={<NavIcon name="netgraph" />} active={activeTab === "Netgraph"} onClick={() => pick("Netgraph")} />
        {onOpenSearch && <NavButton label="Search" icon={<NavIcon name="search" />} active={false} onClick={onOpenSearch} />}
        <NavButton
          label="Data"
          icon={<NavIcon name="data" />}
          active={dataActive || openGroup === "Data"}
          onClick={() => setOpenGroup((group) => (group === "Data" ? null : "Data"))}
          ariaHasPopup="menu"
          ariaExpanded={openGroup === "Data"}
        />
        <NavButton
          label="System"
          icon={<NavIcon name="system" />}
          active={systemActive || openGroup === "System"}
          onClick={() => setOpenGroup((group) => (group === "System" ? null : "System"))}
          ariaHasPopup="menu"
          ariaExpanded={openGroup === "System"}
        />
      </nav>

      {openGroup === "Data" && (
        <GroupSheet label="Data" tabs={DATA_TABS} onPick={pick} onClose={() => setOpenGroup(null)} />
      )}
      {openGroup === "System" && (
        <GroupSheet label="System" tabs={SYSTEM_TABS} onPick={pick} onClose={() => setOpenGroup(null)} />
      )}
    </>
  );
}
