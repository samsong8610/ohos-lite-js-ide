/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { debugMarkerRemotePath, shellClearDebugMarkers, shellCreateDebugMarker } from './debug-markers';

describe('debug marker cleanup', () => {
  it('clears /data/ohjs/debug.* by default', () => {
    expect(shellClearDebugMarkers()).toBe('rm -f /data/ohjs/debug.*');
  });

  it('creates bundle-specific marker path', () => {
    expect(debugMarkerRemotePath('com.example.app')).toBe('/data/ohjs/debug.com.example.app');
    expect(shellCreateDebugMarker('com.example.app')).toBe(
      'mkdir -p /data/ohjs && touch /data/ohjs/debug.com.example.app',
    );
  });
});
