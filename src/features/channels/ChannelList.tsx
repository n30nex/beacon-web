import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useWsChannelMessageHandler } from "../../hooks/useWsHandlers";
import { SkeletonRows } from "../../components/SkeletonRows";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChannelFilterBar } from "./ChannelFilterBar";
import { MessagePanel } from "./MessagePanel";
import { filterChannels, type ChannelKeyFilter, type ChannelHashtagFilter } from "./channel-filters";
import type { ChannelMessage, ChannelSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";

interface ChannelListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

export function ChannelList({ wsManager, onAnalyze }: ChannelListProps) {
  const { iatas, regionKey } = useRegion();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState(() => searchParams.get("cq") ?? "");
  const [searchField, setSearchField] = useState(() => searchParams.get("csf") ?? "name");
  const [keyFilter, setKeyFilter] = useState<ChannelKeyFilter>(() => searchParams.get("channelKey") as ChannelKeyFilter ?? "");
  const [hashtagFilter, setHashtagFilter] = useState<ChannelHashtagFilter>(() => searchParams.get("channelHashtag") as ChannelHashtagFilter ?? "");
  const queryClient = useQueryClient();
  const channelIdParam = searchParams.get("channelId");
  const requestedChannelId = channelIdParam && /^\d+$/.test(channelIdParam) ? Number(channelIdParam) : null;

  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of [["cq", search], ["csf", searchField], ["channelKey", keyFilter], ["channelHashtag", hashtagFilter]] as const) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    }, { replace: true });
  }, [hashtagFilter, keyFilter, search, searchField, setSearchParams]);

  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedId(null);
      setHeardCounts({});
      setSearch("");
      setKeyFilter("");
      setHashtagFilter("");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("channelId");
        return next;
      }, { replace: true });
    }
  }, [regionKey, setSearchParams]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setHeardCounts({});
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "Channels");
      next.set("channelId", String(id));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels", regionKey],
    queryFn: () => getChannels({ iatas }),
    staleTime: 60_000,
  });

  // "Public" pinned first, then named channels, then unnamed by most recent
  const sortedChannels = useMemo(
    () =>
      [...(channels ?? [])].sort((a, b) => {
        const aPub = a.name === "Public" ? 1 : 0;
        const bPub = b.name === "Public" ? 1 : 0;
        if (aPub !== bPub) return bPub - aPub;
        if (a.name && !b.name) return -1;
        if (!a.name && b.name) return 1;
        return b.lastSeen - a.lastSeen;
      }),
    [channels],
  );

  const filteredChannels = useMemo(
    () => filterChannels(sortedChannels, { search, searchField, keyFilter, hashtagFilter }),
    [sortedChannels, search, searchField, keyFilter, hashtagFilter],
  );

  // Resolve against the full list so a selected channel keeps showing even when filtered out. URL
  // state wins, then manual selection, then Public, then the newest sorted fallback.
  const selectedChannel = useMemo(() => {
    if (isLoading || sortedChannels.length === 0) return null;
    if (requestedChannelId != null) {
      const requested = sortedChannels.find((ch) => ch.id === requestedChannelId);
      if (requested) return requested;
    }
    if (selectedId != null) {
      const selected = sortedChannels.find((ch) => ch.id === selectedId);
      if (selected) return selected;
    }
    return sortedChannels.find((ch) => ch.name?.trim().toLowerCase() === "public") ?? sortedChannels[0] ?? null;
  }, [isLoading, requestedChannelId, selectedId, sortedChannels]);
  const activeSelectedId = selectedChannel?.id ?? null;

  const handleChannelMessage = useCallback(
    (data: ChannelMessage) => {
      // bump lastSeen, or refetch the list if this is a channel we haven't seen yet
      queryClient.setQueryData<ChannelSummary[]>(["channels", regionKey], (old) => {
        if (!old) return old;
        const idx = old.findIndex((ch) => ch.channelHash === data.channelHash);
        if (idx === -1) {
          queryClient.invalidateQueries({ queryKey: ["channels", regionKey] });
          return old;
        }
        const updated = [...old];
        updated[idx] = { ...updated[idx]!, lastSeen: data.sentAt };
        return updated;
      });

      // use cache directly to avoid stale closure over selectedChannel
      const cached = queryClient.getQueryData<ChannelSummary[]>(["channels", regionKey]);
      const selected = cached?.find((ch) => ch.id === activeSelectedId);
      if (selected && data.channelHash === selected.channelHash) {
        // same message, multiple observer paths — count the reach
        setHeardCounts((prev) => ({
          ...prev,
          [data.packetHash]: (prev[data.packetHash] ?? 0) + 1,
        }));
        // append to the newest InfiniteData page; MessagePanel re-sorts by sentAt, so the page is arbitrary
        queryClient.setQueryData<InfiniteData<CursorPage<ChannelMessage>>>(
          ["channel-messages", activeSelectedId, regionKey],
          (old) => {
            if (!old) return old;
            if (old.pages.some((p) => p.items.some((msg) => msg.packetHash === data.packetHash))) return old;
            const pages = old.pages.map((p, i) => (i === 0 ? { ...p, items: [...p.items, data] } : p));
            return { ...old, pages };
          },
        );
      }
    },
    [queryClient, activeSelectedId, regionKey],
  );

  useWsChannelMessageHandler(wsManager, handleChannelMessage);

  // mobile: opening a thread takes over the whole view, hiding the list and filter bar
  const showList = !isMobile || selectedChannel === null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {showList && (
        <ChannelFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          keyFilter={keyFilter}
          onKeyChange={setKeyFilter}
          hashtagFilter={hashtagFilter}
          onHashtagChange={setHashtagFilter}
        />
      )}
      <div className="flex flex-1 min-h-0">
        {showList && (
          <div className="flex flex-col min-h-0 w-full md:w-56 md:min-w-56 border-r border-border bg-bg-surface">
            {isLoading ? (
              <SkeletonRows rows={8} />
            ) : (
              <ChannelSidebar
                channels={filteredChannels}
                selectedId={activeSelectedId}
                onSelect={handleSelect}
              />
            )}
          </div>
        )}
        {(!isMobile || selectedChannel !== null) && (
          <MessagePanel
            channel={selectedChannel}
            heardCounts={heardCounts}
            iatas={iatas}
            regionKey={regionKey}
            onAnalyze={onAnalyze}
            onBack={isMobile ? () => setSelectedId(null) : undefined}
          />
        )}
      </div>
    </div>
  );
}
