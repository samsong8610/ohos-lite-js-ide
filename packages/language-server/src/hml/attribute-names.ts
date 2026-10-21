/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type AttributeKind =
  | { kind: 'event'; event: string; prefix: EventPrefix; modifiers: string[] }
  | { kind: 'plain'; name: string };

/** Event binding prefixes of the HML syntax (ARCHITECTURE §7.2): onclick, @click, on:click, grab:click. */
export type EventPrefix = 'on' | '@' | 'on:' | 'grab:';

/** Prefix order matters: `on:` before `on`. */
const PREFIXES: EventPrefix[] = ['on:', 'grab:', '@', 'on'];

/**
 * Classifies an attribute name. `on` followed directly by a name is an event only when the rest
 * is non-empty (so a hypothetical attribute literally called `on` stays plain).
 */
export function classifyAttribute(name: string): AttributeKind {
  for (const p of PREFIXES) {
    if (name.startsWith(p) && name.length > p.length) {
      const [event, ...modifiers] = name.slice(p.length).split('.');
      return { kind: 'event', event: event!, prefix: p, modifiers };
    }
  }
  return { kind: 'plain', name };
}

/** Event modifiers the lite framework accepts. */
export const EVENT_MODIFIERS = ['bubble'] as const;
