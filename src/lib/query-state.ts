import { ApiError } from "../api/client";

export type QueryStateKind = "loading" | "empty" | "stale" | "degraded" | "rate-limited" | "error";
export type QueryStateTone = "neutral" | "info" | "warning" | "danger";

export interface QueryStateCopy {
  actionLabel?: string;
  diagnostic?: string;
  kind: QueryStateKind;
  subtitle: string;
  title: string;
  tone: QueryStateTone;
}

function labelForSubject(subject: string): string {
  return subject.trim() || "data";
}

export function queryStateForLoading(subject = "data"): QueryStateCopy {
  const label = labelForSubject(subject);
  return {
    kind: "loading",
    title: `Loading ${label}`,
    subtitle: "Beacon is querying the latest production data.",
    tone: "info",
  };
}

export function queryStateForEmpty(subject = "data", detail?: string): QueryStateCopy {
  const label = labelForSubject(subject);
  return {
    kind: "empty",
    title: `No ${label} yet`,
    subtitle: detail ?? "Widen the region or time window if traffic should be visible.",
    tone: "neutral",
  };
}

export function queryStateForError(error: unknown, subject = "data"): QueryStateCopy {
  const label = labelForSubject(subject);
  if (error instanceof ApiError) {
    const diagnostic = `${error.status} ${error.code}`.toUpperCase();
    if (error.status === 429 || /rate|limit|throttle/i.test(error.code)) {
      return {
        actionLabel: "Retry",
        diagnostic,
        kind: "rate-limited",
        title: "Rate limit reached",
        subtitle: "Beacon is protecting the API from too much traffic. Wait a moment, then retry.",
        tone: "warning",
      };
    }

    if (error.status === 502 || error.status === 503 || error.status === 504 || /degraded|unavailable|timeout/i.test(error.code)) {
      return {
        actionLabel: "Retry",
        diagnostic,
        kind: "degraded",
        title: `${label} temporarily degraded`,
        subtitle: "The API responded, but an upstream dependency is not ready. Runtime health may show which service needs attention.",
        tone: "warning",
      };
    }

    if (error.status === 404) {
      return queryStateForEmpty(label, "Beacon did not find a matching record for this selection.");
    }

    return {
      actionLabel: "Retry",
      diagnostic,
      kind: "error",
      title: `Unable to load ${label}`,
      subtitle: error.message || "The API returned an error before this view could refresh.",
      tone: "danger",
    };
  }

  return {
    actionLabel: "Retry",
    kind: "error",
    title: `Unable to load ${label}`,
    subtitle: error instanceof Error && error.message ? error.message : "The request failed before Beacon could render fresh data.",
    tone: "danger",
  };
}
