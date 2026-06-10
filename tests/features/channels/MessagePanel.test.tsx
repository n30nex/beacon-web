import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessagePanel } from "../../../src/features/channels/MessagePanel";
import type { ChannelMessage, ChannelSummary } from "../../../src/features/channels/types";

// live WS messages have no id — mirror that runtime shape in the page data
const restMsg: ChannelMessage = {
  id: 1,
  packetHash: "ph-rest",
  channelHash: "ch1",
  senderName: "alice",
  content: "from rest",
  sentAt: 1000,
};

const liveMsgA = {
  packetHash: "ph-live-a",
  channelHash: "ch1",
  senderName: "bob",
  content: "live one",
  sentAt: 2000,
} as ChannelMessage;

const liveMsgB = {
  packetHash: "ph-live-b",
  channelHash: "ch1",
  senderName: "carol",
  content: "live two",
  sentAt: 3000,
} as ChannelMessage;

vi.mock("../../../src/api/client", () => ({
  getChannelMessagesPage: vi.fn(() =>
    Promise.resolve({ items: [restMsg, liveMsgA, liveMsgB], nextCursor: null, hasMore: false }),
  ),
}));

const channel: ChannelSummary = {
  id: 1,
  name: "Public",
  channelHash: "ch1",
  lastSeen: 3000,
  isHashtag: false,
  keyKnown: true,
};

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("MessagePanel row keys", () => {
  it("keys rows without React key warnings when live messages lack an id", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
      </QueryClientProvider>,
    );

    await screen.findByText("live two");
    expect(screen.getByText("from rest")).toBeInTheDocument();
    expect(screen.getByText("live one")).toBeInTheDocument();

    const keyWarnings = errorSpy.mock.calls.filter((args) => String(args[0]).includes("key"));
    expect(keyWarnings).toEqual([]);

    errorSpy.mockRestore();
  });
});
