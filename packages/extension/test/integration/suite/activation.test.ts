/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

const EXT_ID = 'samsong8610.ohos-lite-js-ide';

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
      const ms = (ext.exports as unknown as { activationMs: number }).activationMs;
      console.log(`      activate() took ${ms.toFixed(1)} ms`);
      // 500 ms locally (NFR-PERF-001); CI budget from runTest / activation-budget.ts (1000 ms, 2000 ms on Windows)
      const budget = Number(process.env.OHJS_ACTIVATION_BUDGET_MS) || 500;
      assert.ok(
        ms < budget,
        `activation took ${ms} ms (budget ${budget} ms; NFR-PERF-001 ≤ 500 ms on device, CI uses higher)`,
      );
    });

    it('language server: SDK from .ohjs/project.json, HML diagnostics and completion', async () => {
      const ext = vscode.extensions.getExtension<{
        languageServer?: Promise<{ version: string; ok: boolean }>;
      }>(EXT_ID)!;
      assert.ok(await waitFor(() => ext.isActive, 15000));
      const st = await ext.exports.languageServer;
      assert.deepStrictEqual({ version: st?.version, ok: st?.ok }, { version: '6.1-lts', ok: true });
      const [uri] = await vscode.workspace.findFiles('**/pages/index/index.hml');
      assert.ok(uri, 'fixture index.hml not found');
      const doc = await vscode.workspace.openTextDocument(uri);
      assert.strictEqual(doc.languageId, 'hml');
      await vscode.window.showTextDocument(doc);
      assert.ok(
        await waitFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ohjs'), 15000),
        'no ohjs diagnostics',
      );
      const diags = vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'ohjs');
      assert.deepStrictEqual(
        diags.map((d) => [String(typeof d.code === 'object' ? d.code.value : d.code), d.range.start.line]),
        [
          ['hml/unknown-component', 4],
          ['hml/expression-rewrite', 5],
          ['hml/es6-in-expression', 5],
        ],
      );
      // completion inside <list> offers only <list-item>
      const pos = new vscode.Position(2, 5);
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        pos,
        '<',
      );
      const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
      assert.ok(labels.includes('list-item'), `list-item missing: ${labels.join(',')}`);
      assert.ok(!labels.includes('text'), 'text must not be offered inside <list>');
      // event handler value: methods of the same-name index.js
      const ev = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        new vscode.Position(0, 33),
      );
      const evLabels = ev.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
      assert.ok(evLabels.includes('tap'), `tap missing: ${evLabels.join(',')}`);
    });

    it('language server: engine-native ES2015 is silent, newer syntax warns (page scripts)', async () => {
      const [uri] = await vscode.workspace.findFiles('**/default/common/util.js');
      assert.ok(uri, 'fixture util.js not found');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      assert.ok(
        await waitFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ohjs'), 15000),
        'no ohjs JS diagnostics',
      );
      const diags = vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'ohjs');
      assert.deepStrictEqual(
        diags.map((d) => [String(typeof d.code === 'object' ? d.code.value : d.code), d.range.start.line]),
        [['js/es6-syntax', 1]],
      );
      assert.strictEqual(diags[0]!.severity, vscode.DiagnosticSeverity.Warning);
      assert.match(diags[0]!.message, /babel/);
    });

    it('language server: three ES6 tiers and ohjs.diagnostics.transpilableSyntax', async () => {
      const code = (d: vscode.Diagnostic) => String(typeof d.code === 'object' ? d.code.value : d.code);
      const [uri] = await vscode.workspace.findFiles('**/default/common/tiers.js');
      assert.ok(uri, 'fixture tiers.js not found');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      const view = () =>
        vscode.languages
          .getDiagnostics(uri)
          .filter((d) => d.source === 'ohjs')
          .map((d) => `${code(d)}:${d.severity}:${d.range.start.line}`);
      const W = vscode.DiagnosticSeverity.Warning;
      const E = vscode.DiagnosticSeverity.Error;
      const expected = [
        `js/es6-syntax:${W}:0`,
        `js/es6-untranspilable:${E}:1`,
        `js/unsupported-builtin:${E}:2`,
      ];
      assert.ok(
        await waitFor(() => view().join() === expected.join(), 15000),
        `tier diagnostics: ${view().join()}`,
      );
      const cfg = vscode.workspace.getConfiguration('ohjs.diagnostics');
      try {
        await cfg.update('transpilableSyntax', 'error', vscode.ConfigurationTarget.Workspace);
        const asError = [`js/es6-syntax:${E}:0`, ...expected.slice(1)];
        assert.ok(await waitFor(() => view().join() === asError.join(), 15000), `error: ${view().join()}`);
        await cfg.update('transpilableSyntax', 'off', vscode.ConfigurationTarget.Workspace);
        assert.ok(
          await waitFor(() => view().join() === expected.slice(1).join(), 15000),
          `off: ${view().join()}`,
        );
      } finally {
        await cfg.update('transpilableSyntax', undefined, vscode.ConfigurationTarget.Workspace);
      }
      assert.ok(await waitFor(() => view().join() === expected.join(), 15000), `reset: ${view().join()}`);
    });

    it('language server: unknown @system module and this. completion (FR-LANG-007)', async () => {
      const code = (d: vscode.Diagnostic) => String(typeof d.code === 'object' ? d.code.value : d.code);
      const [mods] = await vscode.workspace.findFiles('**/default/common/modules.js');
      assert.ok(mods, 'fixture modules.js not found');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(mods));
      assert.ok(
        await waitFor(() => vscode.languages.getDiagnostics(mods).some((d) => d.source === 'ohjs'), 15000),
        'no ohjs module diagnostics',
      );
      assert.deepStrictEqual(
        vscode.languages
          .getDiagnostics(mods)
          .filter((d) => d.source === 'ohjs')
          .map((d) => [code(d), d.range.start.line]),
        [['js/unknown-system-module', 1]],
      );
      const [page] = await vscode.workspace.findFiles('**/pages/index/index.js');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(page!));
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        page!,
        new vscode.Position(5, 9),
        '.',
      );
      const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
      for (const l of ['title', 'tap', 'onInit', '$refs', '$t'])
        assert.ok(labels.includes(l), `${l} missing: ${labels.join(',')}`);
    });

    it('generates .ohjs jsconfig + @system d.ts for the SDK and creates jsconfig.json', async () => {
      const ext = vscode.extensions.getExtension<{ jsTypes?: Promise<string | undefined> }>(EXT_ID)!;
      const outcome = await ext.exports.jsTypes;
      assert.ok(outcome === 'created' || outcome === 'unchanged', `outcome ${outcome}`);
      const root = vscode.workspace.workspaceFolders![0]!.uri;
      const read = async (...p: string[]) =>
        new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, ...p)));
      assert.deepStrictEqual(JSON.parse(await read('jsconfig.json')), {
        extends: './.ohjs/jsconfig.base.json',
      });
      assert.deepStrictEqual(JSON.parse(await read('.ohjs', 'jsconfig.base.json')).compilerOptions.lib, [
        'es5',
      ]);
      const dts = await read('.ohjs', 'types', 'system-modules.d.ts');
      assert.ok(dts.includes('OpenHarmony 6.1-LTS'), 'd.ts not for the project SDK');
      assert.ok(dts.includes("declare module '@system.router'"));
      assert.ok(!dts.includes("'@system.fetch'"));
      assert.ok((await read('.ohjs', 'types', 'ohjs-env.d.ts')).includes('interface OhjsViewModel'));
    });

    it('i18n key jump, enum value completion, JSON Schema for config.json (FR-LANG-004/008)', async () => {
      const [uri] = await vscode.workspace.findFiles('**/pages/index/index.hml');
      const doc = await vscode.workspace.openTextDocument(uri!);
      await vscode.window.showTextDocument(doc);
      const at = doc.positionAt(doc.getText().indexOf('strings.hello') + 3);
      const defs = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        'vscode.executeDefinitionProvider',
        uri,
        at,
      );
      const targets = defs.map((d) => ('targetUri' in d ? d.targetUri : d.uri).path.split('/').pop()).sort();
      assert.deepStrictEqual(targets, ['en-US.json', 'zh-CN.json']);
      // enum values of <input type="">
      const edit = new vscode.WorkspaceEdit();
      const end = doc.positionAt(doc.getText().indexOf('</div>'));
      edit.insert(uri!, end, '<input type=""></input>\n');
      assert.ok(await vscode.workspace.applyEdit(edit));
      const pos = doc.positionAt(doc.getText().indexOf('type=""') + 6);
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        pos,
      );
      const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
      for (const l of ['checkbox', 'radio', 'button'])
        assert.ok(labels.includes(l), `${l} missing: ${labels.join(',')}`);
      await vscode.commands.executeCommand('workbench.action.files.revert');
      // config.json: the contributed JSON Schema (VS Code JSON service) reports a bad moduleType
      const [cfg] = await vscode.workspace.findFiles('**/src/main/config.json');
      const cdoc = await vscode.workspace.openTextDocument(cfg!);
      await vscode.window.showTextDocument(cdoc);
      const o = cdoc.getText().indexOf('"moduleType": "entry"') + '"moduleType": "'.length;
      const e2 = new vscode.WorkspaceEdit();
      e2.replace(cfg!, new vscode.Range(cdoc.positionAt(o), cdoc.positionAt(o + 5)), 'har');
      assert.ok(await vscode.workspace.applyEdit(e2));
      assert.ok(
        await waitFor(
          () =>
            vscode.languages
              .getDiagnostics(cfg!)
              .some((d) => d.source !== 'ohjs' && /entry|feature/.test(d.message)),
          20000,
        ),
        `no JSON schema diagnostic: ${JSON.stringify(vscode.languages.getDiagnostics(cfg!).map((d) => d.message))}`,
      );
      await vscode.commands.executeCommand('workbench.action.files.revert');
    });

    it('language server: config.json deviceType edit is diagnosed', async () => {
      const [uri] = await vscode.workspace.findFiles('**/src/main/config.json');
      const doc = await vscode.workspace.openTextDocument(uri!);
      await vscode.window.showTextDocument(doc);
      const at = doc.getText().indexOf('"smartVision"');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri!, new vscode.Range(doc.positionAt(at + 1), doc.positionAt(at + 2)), 'S');
      assert.ok(await vscode.workspace.applyEdit(edit));
      const code = (d: vscode.Diagnostic) => String(typeof d.code === 'object' ? d.code.value : d.code);
      assert.ok(
        await waitFor(
          () => vscode.languages.getDiagnostics(uri!).some((d) => code(d) === 'prj/device-type'),
          15000,
        ),
        'no prj/device-type diagnostic',
      );
      await vscode.commands.executeCommand('workbench.action.files.revert');
    });

    it('language server: CSS pseudo-class validation', async () => {
      const [uri] = await vscode.workspace.findFiles('**/pages/index/index.css');
      assert.ok(uri, 'fixture index.css not found');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      assert.ok(
        await waitFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ohjs'), 15000),
        'no ohjs CSS diagnostics',
      );
      const diags = vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'ohjs');
      assert.deepStrictEqual(
        diags.map((d) => [String(typeof d.code === 'object' ? d.code.value : d.code), d.range.start.line]),
        [['css/unsupported-pseudo', 3]],
      );
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
