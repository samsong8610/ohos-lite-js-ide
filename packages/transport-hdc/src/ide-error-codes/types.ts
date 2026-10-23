/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Channel keys from vendored ide-error-codes.json (IDE-CONTRACT). */
export type IdeErrorChannel = 'tconn' | 'file' | 'bm' | 'aa' | 'fport' | 'shell';

export interface IdeErrorFailureEntry {
  code: string | null;
  pattern: string;
  when: string;
  ide_hint: string;
}

export interface IdeErrorChannelSpec {
  description: string;
  success_patterns: string[];
  failures: IdeErrorFailureEntry[];
  note?: string;
}

export interface IdeErrorCodesDocument {
  version: string;
  protocol: string;
  hdc_msg_hash: string;
  channels: Record<IdeErrorChannel, IdeErrorChannelSpec>;
}

export interface IdeErrorMatch {
  channel: IdeErrorChannel;
  code: string | null;
  pattern: string;
  ide_hint: string;
  when: string;
}
