const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(mode, { applyScroll = true } = {}) {
  class MarkdownView {}
  class TFile {}
  const context = {
    module: { exports: {} },
    console: { error() {} },
    require(id) {
      if (id === '@codemirror/view') return { EditorView: {} };
      assert.equal(id, 'obsidian');
      return {
        MarkdownView,
        TFile,
        ItemView: class {},
        Plugin: class {},
        PluginSettingTab: class {},
        Setting: class {},
        Notice: class {},
        editorInfoField: {},
        setIcon() {},
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), context);
  const plugin = new context.module.exports();

  const file = new TFile();
  file.path = 'Sample.md';

  const calls = { applyScroll: [], cursor: [], scrollIntoView: [], focus: 0 };
  const editor = {
    getValue: () => 'Text',
    setCursor: pos => calls.cursor.push(pos),
    scrollIntoView: range => calls.scrollIntoView.push(range),
    focus: () => { calls.focus++; },
  };
  const previewMode = applyScroll
    ? { applyScroll: line => calls.applyScroll.push(line) }
    : {};
  const view = Object.assign(new MarkdownView(), {
    file,
    editor,
    previewMode,
    contentEl: {
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    getMode: () => mode,
  });
  const leaf = { view };
  plugin.app = {
    vault: { getAbstractFileByPath: requested => (requested === file.path ? file : null) },
    workspace: {
      getLeavesOfType: () => [leaf],
      setActiveLeaf(target) { assert.equal(target, leaf); },
    },
  };

  return { plugin, file, calls };
}

const node = { filePath: 'Sample.md', line: 12, ch: 4 };

test('reading view scrolls the preview instead of the hidden editor', async () => {
  const f = setup('preview');
  await f.plugin.revealNode(node);
  assert.deepEqual(f.calls.applyScroll, [12]);
  assert.deepEqual(f.calls.cursor, []);
  assert.deepEqual(f.calls.scrollIntoView, []);
  assert.equal(f.calls.focus, 0);
});

test('editing view still places the caret and scrolls the editor', async () => {
  const f = setup('source');
  await f.plugin.revealNode(node);
  assert.deepEqual(f.calls.applyScroll, []);
  assert.equal(f.calls.cursor.length, 1);
  assert.equal(f.calls.cursor[0].line, 12);
  assert.equal(f.calls.cursor[0].ch, 4);
  assert.equal(f.calls.scrollIntoView.length, 1);
  assert.equal(f.calls.scrollIntoView[0].from.line, 12);
  assert.equal(f.calls.scrollIntoView[0].to.line, 12);
  assert.equal(f.calls.focus, 1);
});

test('reading view without preview scrolling degrades without touching the editor', async () => {
  const f = setup('preview', { applyScroll: false });
  await f.plugin.revealNode(node);
  assert.deepEqual(f.calls.applyScroll, []);
  assert.deepEqual(f.calls.cursor, []);
  assert.deepEqual(f.calls.scrollIntoView, []);
  assert.equal(f.calls.focus, 0);
});

test('a stale node path reports a notice and leaves the view alone', async () => {
  const f = setup('preview');
  await f.plugin.revealNode({ ...node, filePath: 'Missing.md' });
  assert.deepEqual(f.calls.applyScroll, []);
  assert.equal(f.calls.focus, 0);
});
