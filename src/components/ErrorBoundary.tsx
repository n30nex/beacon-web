import { Component, type ReactNode } from "react";
import { QueryStatePanel } from "./QueryStatePanel";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      // React.lazy caches a rejected import, so remounting can't recover a failed chunk load
      // (e.g. a deploy swapped the hashed assets out from under us) — only a real reload can
      const chunkFailure = /dynamically imported module|Loading chunk|error loading/i.test(this.state.error.message);
      return (
        <QueryStatePanel
          actionLabel={chunkFailure ? "Reload app" : "Try again"}
          className="p-8"
          diagnostic={chunkFailure ? "MODULE CHANGED" : this.state.error.name}
          kind="error"
          onAction={() => (chunkFailure ? window.location.reload() : this.setState({ error: null }))}
          subtitle={chunkFailure ? "A fresh deployment replaced a page module. Reload to pick up the current build." : "This view hit a rendering error. Try again, or use another page while the issue is checked."}
          title="View could not render"
          tone="danger"
        />
      );
    }
    return this.props.children;
  }
}
