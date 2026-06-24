export const PAGE_TABS = ["Home", "Packets", "Map", "Live", "Channels", "Nodes", "Observers", "Routes", "Traces", "Analytics", "System", "Netgraph"] as const;
export const DATA_TABS = ["Packets", "Channels", "Nodes", "Observers"] as const;
export const TOOL_TABS = ["Routes", "Traces"] as const;
export const SYSTEM_TABS = ["Analytics", "System", "Netgraph", ...TOOL_TABS] as const;

export type PageTab = (typeof PAGE_TABS)[number];
export type DataTab = (typeof DATA_TABS)[number];
export type ToolTab = (typeof TOOL_TABS)[number];
export type SystemTab = (typeof SYSTEM_TABS)[number];

export const DEFAULT_TAB: PageTab = "Home";

export interface NavigationState {
  tab: PageTab;
}

function includes<const T extends readonly string[]>(items: T, value: string | null | undefined): value is T[number] {
  return typeof value === "string" && items.includes(value);
}

export function isPageTab(value: string | null | undefined): value is PageTab {
  return includes(PAGE_TABS, value);
}

export function isDataTab(value: string | null | undefined): value is DataTab {
  return includes(DATA_TABS, value);
}

export function isToolTab(value: string | null | undefined): value is ToolTab {
  return includes(TOOL_TABS, value);
}

export function isSystemTab(value: string | null | undefined): value is SystemTab {
  return includes(SYSTEM_TABS, value);
}

export function resolveNavigation(tabParam: string | null, moduleParam: string | null): NavigationState {
  if (tabParam === "Atlas") return { tab: "Home" };
  if (tabParam === "Stats") return { tab: "Analytics" };
  if (tabParam === "Runtime") return { tab: "System" };
  if (tabParam === "Investigate") {
    if (moduleParam === "Routes" || moduleParam === "Traces") return { tab: moduleParam };
    if (isDataTab(moduleParam)) return { tab: moduleParam };
    return { tab: "Packets" };
  }
  if (tabParam === "Ops") {
    if (moduleParam === "Runtime") return { tab: "System" };
    return { tab: "Analytics" };
  }
  if (isPageTab(tabParam)) return { tab: tabParam };

  return { tab: DEFAULT_TAB };
}

export function navigationFromParams(params: URLSearchParams): NavigationState {
  return resolveNavigation(params.get("tab"), params.get("module"));
}

export function applyNavigationParams(params: URLSearchParams, navigation: NavigationState): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("tab", navigation.tab);
  next.delete("module");
  return next;
}

export function canonicalizeNavigationParams(params: URLSearchParams): URLSearchParams {
  return applyNavigationParams(params, navigationFromParams(params));
}

export function navigationForTarget(target: string): NavigationState {
  if (target === "Atlas") return { tab: "Home" };
  if (target === "Stats") return { tab: "Analytics" };
  if (target === "Runtime") return { tab: "System" };
  if (target === "Data") return { tab: "Packets" };
  if (target === "Tools") return { tab: "Routes" };
  if (isPageTab(target)) return { tab: target };
  return { tab: DEFAULT_TAB };
}

export function moduleLabel(navigation: NavigationState): string {
  return navigation.tab;
}
