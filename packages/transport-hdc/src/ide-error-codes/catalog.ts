/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import doc from '../vendor/ide-error-codes.json';
import type { IdeErrorChannel, IdeErrorCodesDocument } from './types';

/** developtools_hdc git ref vendored in docs/ (see README § IDE contract). */
export const IDE_ERROR_CODES_HDC_REF = '5327930b';

export const ideErrorCodes: IdeErrorCodesDocument = doc as IdeErrorCodesDocument;

export const IDE_ERROR_CODES_VERSION = ideErrorCodes.version;

export function ideErrorChannelSpec(channel: IdeErrorChannel) {
  return ideErrorCodes.channels[channel];
}
