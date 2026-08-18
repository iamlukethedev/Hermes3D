"use client";

// Error boundary around the WebGL canvas. Renderer startup can fail
// transiently (e.g. the browser briefly runs out of WebGL contexts right
// after a refresh), which previously crashed the whole page to a white
// "Application error" screen. This boundary retries the renderer a couple
// of times with a short delay, and only then asks the user to reload.

import { Component, type ReactNode } from "react";

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1600;

type SceneErrorBoundaryProps = {
  children: ReactNode;
};

type SceneErrorBoundaryState = {
  failed: boolean;
  retries: number;
  mountKey: number;
};

export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { failed: false, retries: 0, mountKey: 0 };

  private retryTimer: number | null = null;

  static getDerivedStateFromError(): Partial<SceneErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[office-3d] renderer crashed, scheduling retry", error);
    if (this.state.retries < MAX_AUTO_RETRIES) {
      this.retryTimer = window.setTimeout(() => {
        this.setState((previous) => ({
          failed: false,
          retries: previous.retries + 1,
          mountKey: previous.mountKey + 1,
        }));
      }, RETRY_DELAY_MS);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
  }

  private handleManualRetry = () => {
    this.setState((previous) => ({
      failed: false,
      retries: 0,
      mountKey: previous.mountKey + 1,
    }));
  };

  render() {
    if (this.state.failed) {
      const retrying = this.state.retries < MAX_AUTO_RETRIES;
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#14100b]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-900/30 bg-black/40 px-8 py-6 text-center">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber-500/80">
              3D renderer interrupted
            </div>
            <div className="max-w-xs text-sm text-amber-100/80">
              {retrying
                ? "The graphics context was lost — restarting the renderer…"
                : "The renderer could not restart on its own."}
            </div>
            {retrying ? (
              <div className="h-1 w-32 overflow-hidden rounded-full bg-amber-900/40">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-400/80" />
              </div>
            ) : (
              <button
                type="button"
                onClick={this.handleManualRetry}
                className="rounded-lg border border-amber-500/40 bg-amber-100/10 px-4 py-1.5 text-sm text-amber-100 transition-colors hover:bg-amber-100/20"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      );
    }

    // Remounting with a fresh key gives three.js a brand-new canvas element,
    // which is required after a failed WebGL context creation.
    return (
      <div key={this.state.mountKey} className="h-full w-full">
        {this.props.children}
      </div>
    );
  }
}
