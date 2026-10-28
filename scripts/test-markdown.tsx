import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../web/node_modules/react-dom/server.js";
import { Markdown } from "../web/src/markdown";

describe("Chat Markdown renderer", () => {
  test("renders the exact inline-markdown shape that previously exhausted memory", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"### D2-3 check\n\n**bold** and *italic* and `inline code`"} />
    );
    assert.match(html, /<strong[^>]*>bold<\/strong>/);
    assert.match(html, /<em[^>]*>italic<\/em>/);
    assert.match(html, /<code[^>]*>inline code<\/code>/);
  });

  test("renders multiple recursive inline tokens exactly once", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"**one** then **two** and [safe](https://example.com)"} />
    );
    assert.equal((html.match(/<strong/g) ?? []).length, 2);
    assert.equal((html.match(/<a /g) ?? []).length, 1);
  });
});
