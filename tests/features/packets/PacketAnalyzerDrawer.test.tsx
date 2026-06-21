import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PacketAnalyzerDrawer } from "../../../src/features/packets/PacketAnalyzerDrawer";
import { PayloadType, RouteType } from "../../../src/types/enums";
import type { PacketDetail } from "../../../src/types/api";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

describe("PacketAnalyzerDrawer close", () => {
  it("removes ?hash from the URL and calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=abc123"]}>
        <PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Close analyzer"));

    expect(onClose).toHaveBeenCalledOnce();
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).not.toContain("hash=");
    expect(search).toContain("tab=Packets"); // other params survive
  });
});

const detail: PacketDetail = {
  packetHash: "deadbeef",
  header: {
    raw: "11",
    routeType: RouteType.FLOOD,
    routeTypeName: "FLOOD",
    payloadType: PayloadType.ADVERT,
    payloadTypeName: "Advert",
    payloadVersion: 1,
  },
  rawPayload: "aabbcc",
  parsedPayload: { name: "Beacon Node" },
  decrypted: false,
  firstHeardAt: 1_782_043_199_000,
  lastHeardAt: 1_782_043_200_000,
  firstToLastMs: 1000,
  observationCount: 1,
  observations: [
    {
      id: 42,
      observerId: "observer-1",
      observerName: "Roof",
      iata: "YVR",
      heardAt: 1_782_043_200_000,
      rssi: -91,
      snr: 7,
      pathLength: { raw: "81", hashSize: 1, hopCount: 1 },
      pathBytes: "aa",
      sourceBroker: "mqtt-primary",
      resolvedPath: [],
    },
  ],
};

describe("PacketAnalyzerDrawer handoff actions", () => {
  it("copies packet JSON with selected observation context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=deadbeef"]}>
        <PacketAnalyzerDrawer detail={detail} selectedObservationId={42} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Copy packet JSON"));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const exported = JSON.parse(writeText.mock.calls[0]![0] as string);
    expect(exported.schema).toBe("beacon.packet.v1");
    expect(exported.packetHash).toBe("deadbeef");
    expect(exported.selectedObservationId).toBe(42);
    expect(exported.selectedObservation.observerId).toBe("observer-1");
    expect(exported.reconstructedFrameHex).toContain("aabbcc");
    expect(screen.getByText("Copied JSON")).toBeInTheDocument();
  });
});
