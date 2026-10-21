import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../dist/markdown.js';

// Exercise the real renderer without installing a browser or DOM dependency.
// HTML parsing is deliberately unavailable: user content must remain text nodes.
class TextNode {
  constructor(value) { this.nodeType = 3; this.textContent = String(value); }
}
class Element {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = []; }
  append(...nodes) { this.childNodes.push(...nodes.map(node => typeof node === 'string' ? new TextNode(node) : node)); }
  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(new TextNode(value)); }
  set innerHTML(_) { throw new Error('Markdown must not use innerHTML'); }
}
const descendants = node => [node, ...node.childNodes?.flatMap(descendants) ?? []];
function render(source, verify) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const container = new Element('section');
  globalThis.document = {createElement: tag => new Element(tag), createTextNode: value => new TextNode(value)};
  try { renderMarkdown(container, source); verify(container); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
}

test('shared Markdown renderer retains the supported blocks and inline formatting', () => {
  render('# One\r\n## Two\r\n### Three\n\nText **bold** and *italic* with `inline`\nnext line\n\n> quote\n> continuation\n\n- first\n* second\n\n3. third\n4. fourth\n\n---\n\n```js\n<img>\ncode\n```', container => {
    assert.deepEqual(container.childNodes.map(node => node.tagName), ['H1', 'H2', 'H3', 'P', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'PRE']);
    const nodes = descendants(container);
    assert.equal(nodes.find(node => node.tagName === 'STRONG').textContent, 'bold');
    assert.equal(nodes.find(node => node.tagName === 'EM').textContent, 'italic');
    assert.equal(nodes.filter(node => node.tagName === 'BR').length, 2);
    assert.equal(nodes.find(node => node.tagName === 'OL').start, 3);
    assert.equal(nodes.filter(node => node.tagName === 'LI').length, 4);
    assert.equal(nodes.find(node => node.tagName === 'PRE').textContent, '<img>\ncode');
  });
});

test('raw HTML and unsafe links stay text; image syntax never creates a remote image', () => {
  const source = '<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [data](data:text/html,bad) [relative](/x) [ok](HTTPS://example.test/path?q=1) ![remote](https://images.test/pic.jpg)';
  render(source, container => {
    const elements = descendants(container).filter(node => node.nodeType === 1);
    assert(elements.every(node => ['SECTION', 'P', 'BR', 'A'].includes(node.tagName)));
    assert(container.textContent.includes('<img src=x onerror=alert(1)>'));
    assert(container.textContent.includes('<script>alert(1)</script>'));
    assert(container.textContent.includes('[bad](javascript:alert(1))'));
    assert(container.textContent.includes('[data](data:text/html,bad)'));
    assert(container.textContent.includes('[relative](/x)'));
    const links = elements.filter(node => node.tagName === 'A');
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.match(link.href, /^https?:\/\//);
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
    }
  });
});

test('repeated renders clear old content; nullish or whitespace input has no built-in UI copy', () => {
  render('old', container => {
    renderMarkdown(container, '**new**');
    assert.equal(container.textContent, 'new');
    assert.equal(container.childNodes.length, 1);
    for (const empty of [null, undefined, '', ' \r\n\t']) {
      renderMarkdown(container, empty);
      assert.equal(container.childNodes.length, 0);
    }
    renderMarkdown(container, 123);
    assert.equal(container.textContent, '123');
    renderMarkdown(container, false);
    assert.equal(container.textContent, 'false');
  });
});

test('blank lines and a following code fence end a paragraph', () => {
  render('first paragraph\n\nsecond paragraph\n```\n<raw code>\n```', container => {
    assert.deepEqual(container.childNodes.map(node => node.tagName), ['P', 'P', 'PRE']);
    assert.deepEqual(container.childNodes.map(node => node.textContent), ['first paragraph', 'second paragraph', '<raw code>']);
  });
});

test('unterminated fenced code keeps hostile content inert', () => {
  render('```\n<script>bad()</script>\n![remote](https://images.test/x)', container => {
    assert.equal(container.childNodes.length, 1);
    assert.equal(container.childNodes[0].tagName, 'PRE');
    assert.equal(container.textContent, '<script>bad()</script>\n![remote](https://images.test/x)');
    assert.deepEqual(descendants(container).filter(node => node.nodeType === 1).map(node => node.tagName), ['SECTION', 'PRE', 'CODE']);
  });
});
