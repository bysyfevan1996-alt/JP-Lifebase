// dist/markdown.js
export function renderMarkdown(container, source) {
  // Normalize input; user content is added only as DOM text nodes.
  const src = String(source ?? '');

  // DOM safe clearing
  container.replaceChildren();
  if (!src.trim()) return;

  // Process content
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;

  // Helper for inline elements
  function appendInline(parent, text, depth = 0) {
    if (depth > 3) {
      parent.append(document.createTextNode(text));
      return;
    }
    const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
    let previous = 0;
    let match;
    while ((match = pattern.exec(text))) {
      parent.append(document.createTextNode(text.slice(previous, match.index)));
      let node;
      if (match[1] !== undefined || match[2] !== undefined) {
        node = document.createElement(match[1] !== undefined ? 'strong' : 'em');
        appendInline(node, match[1] ?? match[2], depth + 1);
      } else if (match[3] !== undefined) {
        node = document.createElement('code');
        node.textContent = match[3];
      } else {
        let url;
        try { url = new URL(match[5]); } catch { /* Literal text for invalid URLs */ }
        if (url && (url.protocol === 'https:' || url.protocol === 'http:')) {
          node = document.createElement('a');
          node.href = url.href;
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          node.textContent = match[4];
        } else node = document.createTextNode(match[0]);
      }
      parent.append(node);
      previous = pattern.lastIndex;
    }
    parent.append(document.createTextNode(text.slice(previous)));
  }

  const isBlock = (line) => /^\s*$|^```|^#{1,3}\s|^>\s?|^\s*[-*]\s|^\s*\d+\.\s|^\s*---+\s*$/.test(line);

  // Main rendering logic
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (/^```/.test(line)) {
      index += 1;
      const codeLines = [];
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index++]);
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      pre.append(code);
      container.append(pre);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2]);
      container.append(element);
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      container.append(document.createElement('hr'));
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = document.createElement('blockquote');
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        if (quote.childNodes.length) quote.append(document.createElement('br'));
        appendInline(quote, lines[index++].replace(/^>\s?/, ''));
      }
      container.append(quote);
      continue;
    }

    const list = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
    if (list) {
      const ordered = Boolean(list[2]);
      const listElement = document.createElement(ordered ? 'ol' : 'ul');
      if (ordered) listElement.start = Number(list[2]) || 1;
      const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      let item;
      while (index < lines.length && (item = lines[index].match(pattern))) {
        const li = document.createElement('li');
        appendInline(li, item[1]);
        listElement.append(li);
        index += 1;
      }
      container.append(listElement);
      continue;
    }

    const paragraph = document.createElement('p');
    appendInline(paragraph, lines[index++]);
    while (index < lines.length && !isBlock(lines[index])) {
      paragraph.append(document.createElement('br'));
      appendInline(paragraph, lines[index++]);
    }
    container.append(paragraph);
  }

}
