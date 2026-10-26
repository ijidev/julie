// Small, dependency-free, safe markdown renderer for Julie AiOS chat bubbles.
// Builds React elements only — NEVER uses dangerouslySetInnerHTML with raw input.
// All text passes through React's escaping; links are restricted to http(s)/mailto
// and always open in a new tab with rel="noopener noreferrer".
//
// Supported: #/##/###/#### headings, **bold**, *italic*, `inline code`,
// fenced ``` code blocks, bulleted (-, *) and numbered (1. / 1)) lists,
// [links](url), > blockquotes, | tables |, paragraphs (hard line breaks kept).

import React from "react";

const E = React.createElement;

/** Allow only safe URL schemes; everything else (javascript:, data:, vbscript:,
 *  unparseable) is stripped to plain text. */
function safeUrl(raw: string): string | null {
  const u = raw.trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^mailto:[^\s"'<>]+$/i.test(u)) return u;
  return null;
}

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}.${k++}`;
    if (m[1]) {
      nodes.push(E("code", { key, className: "md-code" }, tok.slice(1, -1)));
    } else if (m[2]) {
      nodes.push(E("strong", { key, className: "md-bold" }, renderInline(tok.slice(2, -2), key)));
    } else if (m[3]) {
      nodes.push(E("em", { key, className: "md-em" }, renderInline(tok.slice(1, -1), key)));
    } else if (m[4]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = lm ? lm[1] : tok;
      const href = lm ? safeUrl(lm[2]) : null;
      if (href) {
        nodes.push(
          E(
            "a",
            { key, className: "md-link", href, target: "_blank", rel: "noopener noreferrer" },
            renderInline(label, key)
          )
        );
      } else {
        nodes.push(label);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableSep = (line: string): boolean =>
  /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

const startsBlock = (line: string): boolean =>
  /^\s*$/.test(line) ||
  /^```/.test(line) ||
  /^#{1,4}\s/.test(line) ||
  /^>\s?/.test(line) ||
  /^\s*[-*]\s+/.test(line) ||
  /^\s*\d+[.)]\s+/.test(line);

export function Markdown({ text }: { text: string }): React.ReactElement {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nk = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // blank line
    if (/^\s*$/.test(line)) { i++; continue; }

    // fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence (or run past end)
      blocks.push(
        E("pre", { key: nk(), className: "md-pre" },
          E("code", { className: fence[1] || undefined }, buf.join("\n")))
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length + 2, 6); // # -> h3 … #### -> h6 (compact in chat)
      const tag = `h${lvl}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(E(tag, { key: nk(), className: "md-heading" }, renderInline(h[2], `h${i}`)));
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        E("blockquote", { key: nk(), className: "md-quote" },
          E("p", null, renderInline(buf.join(" "), `q${i}`)))
      );
      continue;
    }

    // table (header row + separator row)
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i]) && !startsBlock(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        E("div", { key: nk(), className: "md-table-wrap" },
          E("table", { className: "md-table" },
            E("thead", null,
              E("tr", null, header.map((c, j) => E("th", { key: j }, renderInline(c, `th${j}`))))),
            E("tbody", null,
              rows.map((r, ri) =>
                E("tr", { key: ri }, r.map((c, ci) => E("td", { key: ci }, renderInline(c, `td${ri}-${ci}`)))))))
        )
      );
      continue;
    }

    // bulleted list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^\s*[-*]\s+(.*)$/);
        if (!lm) break;
        items.push(E("li", { key: items.length }, renderInline(lm[1], `li${i}`)));
        i++;
      }
      blocks.push(E("ul", { key: nk(), className: "md-list" }, ...items));
      continue;
    }

    // numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!lm) break;
        items.push(E("li", { key: items.length }, renderInline(lm[1], `li${i}`)));
        i++;
      }
      blocks.push(E("ol", { key: nk(), className: "md-list" }, ...items));
      continue;
    }

    // paragraph: run of plain lines; hard breaks preserved via <br/>
    const buf: string[] = [line];
    i++;
    while (i < lines.length && !startsBlock(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i]);
      i++;
    }
    const children: React.ReactNode[] = [];
    buf.forEach((p, pi) => {
      if (pi > 0) children.push(E("br", { key: `br${pi}` }));
      children.push(...renderInline(p, `p${i}-${pi}`));
    });
    blocks.push(E("p", { key: nk(), className: "md-p" }, ...children));
  }

  return E("div", { className: "md" }, ...blocks);
}
