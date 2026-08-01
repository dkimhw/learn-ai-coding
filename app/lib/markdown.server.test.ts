import { describe, it, expect } from "vitest";
import { renderCommentMarkdown } from "./markdown.server";

// The comment render path is the one place untrusted input reaches an HTML
// pipeline, so the allowlist gets asserted directly.

describe("renderCommentMarkdown", () => {
  it("renders ordinary markdown", async () => {
    const html = await renderCommentMarkdown("Hello **world**");
    expect(html).toContain("<strong>world</strong>");
  });

  it("highlights fenced code blocks with Shiki", async () => {
    const html = await renderCommentMarkdown(
      "```ts\nconst x: number = 1;\n```"
    );
    expect(html).toContain("<pre");
    expect(html).toContain("shiki");
    expect(html).toContain("const");
  });

  it("strips script tags", async () => {
    const html = await renderCommentMarkdown(
      "before <script>alert('xss')</script> after"
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
  });

  it("strips event handler attributes", async () => {
    const html = await renderCommentMarkdown(
      `<p onmouseover="alert(1)">hover</p>`
    );
    expect(html).not.toContain("onmouseover");
    expect(html).toContain("hover");
  });

  it("strips javascript: URLs", async () => {
    const html = await renderCommentMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("strips images", async () => {
    const html = await renderCommentMarkdown(
      "![pixel](https://tracker.example.com/p.gif)"
    );
    expect(html).not.toContain("<img");
  });

  it("strips iframes", async () => {
    const html = await renderCommentMarkdown(
      `<iframe src="https://evil.example.com"></iframe>`
    );
    expect(html).not.toContain("<iframe");
  });

  it("keeps safe links but makes them open safely", async () => {
    const html = await renderCommentMarkdown("[docs](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });

  it("escapes rather than executes HTML inside a code fence", async () => {
    const html = await renderCommentMarkdown(
      "```html\n<script>alert(1)</script>\n```"
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("script");
  });
});
