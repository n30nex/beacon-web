import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryStatePanel } from "../../src/components/QueryStatePanel";
import { ApiError } from "../../src/api/client";
import { queryStateForEmpty, queryStateForError } from "../../src/lib/query-state";

describe("QueryStatePanel", () => {
  it("maps rate-limit API errors to clear retryable copy", () => {
    const onRetry = vi.fn();
    render(
      <QueryStatePanel
        {...queryStateForError(new ApiError(429, "rate_limited", "too fast"), "analytics")}
        onAction={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Rate limit reached");
    expect(screen.getByRole("alert")).toHaveTextContent("429 RATE_LIMITED");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty states as polite status messages without action chrome", () => {
    render(<QueryStatePanel {...queryStateForEmpty("routes", "Try a wider region.")} />);

    expect(screen.getByRole("status")).toHaveTextContent("No routes yet");
    expect(screen.getByRole("status")).toHaveTextContent("Try a wider region.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
