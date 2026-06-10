import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { matchesFilters, usePacketFilters } from "../../../src/features/packets/usePacketFilters";
import { EMPTY_FILTERS } from "../../../src/features/packets/types";
import type { PayloadTypeValue } from "../../../src/types/enums";
import type { PacketSummary } from "../../../src/types/api";

function pkt(over: Partial<PacketSummary>): PacketSummary {
  return {
    packetHash: "abcd1234",
    payloadType: 2,
    payloadTypeName: "TEXT_MESSAGE",
    routeType: 0,
    routeTypeName: "FLOOD",
    firstHeardAt: 0,
    lastHeardAt: 0,
    observationCount: 1,
    ...over,
  };
}

describe("matchesFilters — scope", () => {
  it("ignores scope when no scope filter is set", () => {
    expect(matchesFilters(pkt({ scope: "#bc" }), EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(pkt({ scope: undefined }), EMPTY_FILTERS)).toBe(true);
  });

  it("keeps only packets whose scope is selected", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc"] };
    expect(matchesFilters(pkt({ scope: "#bc" }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#west" }), filters)).toBe(false);
    expect(matchesFilters(pkt({ scope: undefined }), filters)).toBe(false); // untagged is excluded
  });

  it("matches any of several selected scopes", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc", "#west"] };
    expect(matchesFilters(pkt({ scope: "#west" }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#east" }), filters)).toBe(false);
  });

  it("ANDs scope with the payload-type filter", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc"], payloadTypes: [4] as PayloadTypeValue[] };
    expect(matchesFilters(pkt({ scope: "#bc", payloadType: 4 }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#bc", payloadType: 2 }), filters)).toBe(false); // wrong type
    expect(matchesFilters(pkt({ scope: "#west", payloadType: 4 }), filters)).toBe(false); // wrong scope
  });
});

function routerAt(url: string) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
}

describe("usePacketFilters — sf param", () => {
  it("accepts sf=hash", () => {
    const { result } = renderHook(() => usePacketFilters(), { wrapper: routerAt("/?sf=hash") });
    expect(result.current.filters.searchField).toBe("hash");
  });

  it("falls back to hash for unimplemented sf values", () => {
    // path/payload search isn't implemented — accepting them would silently match everything
    for (const sf of ["path", "payload", "bogus"]) {
      const { result } = renderHook(() => usePacketFilters(), { wrapper: routerAt(`/?sf=${sf}&q=ab`) });
      expect(result.current.filters.searchField).toBe("hash");
    }
  });
});
