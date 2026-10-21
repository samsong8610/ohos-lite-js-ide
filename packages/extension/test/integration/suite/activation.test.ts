/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

const EXT_ID = 'ohos-lite-js-ide.ohos-lite-js-ide';

async function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return pred();
}

describe(`activation (${process.env.OHJS_EXPECT})`, () => {
  it('extension is installed', () => {
    assert.ok(vscode.extensions.getExtension(EXT_ID), 'extension not found');
  });

  if (process.env.OHJS_EXPECT === 'active') {
    it('activates in an OpenHarmony JS project and detects it', async () => {
      const ext = vscode.extensions.getExtension<{ isProject: boolean }>(EXT_ID)!;
      assert.ok(await waitFor(() => ext.isActive, 15000), 'extension did not activate');
      assert.strictEqual(ext.exports.isProject, true);
      const profile = (ext.exports as { deviceProfile?: { id: string; display: { width: number } } })
        .deviceProfile;
      assert.strictEqual(profile?.id, '2k0300-1024x768');
      assert.strictEqual(profile?.display.width, 1024);
    });

    it('ohjs.device.refresh lists targets from mock-hdc', async () => {
      await vscode.workspace
        .getConfiguration('ohjs.tools')
        .update('hdcPath', process.env.OHJS_MOCK_HDC, vscode.ConfigurationTarget.Global);
      const targets =
        await vscode.commands.executeCommand<Array<{ key: string; connType: string }>>('ohjs.device.refresh');
      assert.deepStrictEqual(
        targets.map((t) => `${t.key}/${t.connType}`),
        ['7001005458323933328a01ab/USB'],
      );
    });
  } else {
    it('does not activate in a non-OpenHarmony workspace', async () => {
      const ext = vscode.extensions.getExtension(EXT_ID)!;
      await new Promise((r) => setTimeout(r, 3000));
      assert.strictEqual(ext.isActive, false);
    });
  }
});
