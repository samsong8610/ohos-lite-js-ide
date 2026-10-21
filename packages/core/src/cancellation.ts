/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Structurally compatible with vscode.CancellationToken so callers can pass either. */
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export class CancellationTokenSource {
  private cancelled = false;
  private readonly listeners = new Set<() => void>();
  readonly token: CancellationToken;

  constructor() {
    const isCancelled = (): boolean => this.cancelled;
    const on = (listener: () => void): { dispose(): void } => {
      if (this.cancelled) {
        listener();
        return { dispose: () => undefined };
      }
      this.listeners.add(listener);
      return { dispose: () => void this.listeners.delete(listener) };
    };
    this.token = {
      get isCancellationRequested() {
        return isCancelled();
      },
      onCancellationRequested: on,
    };
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    const ls = [...this.listeners];
    this.listeners.clear();
    for (const l of ls) l();
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export const NoneCancellationToken: CancellationToken = Object.freeze({
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
});
