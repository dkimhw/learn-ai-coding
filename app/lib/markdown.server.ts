import DOMPurify from "isomorphic-dompurify";
import { marked, Renderer } from "marked";
import { type Highlighter, createHighlighter } from "shiki";

let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ["github-dark"],
      langs: ["typescript", "javascript", "json", "bash", "html", "css", "tsx", "jsx", "sql", "yaml", "markdown", "text", "plaintext"],
    });
  }
  return highlighter;
}

/** Shiki-highlighted code blocks, shared by both render paths. */
function createCodeRenderer(hl: Highlighter): Renderer {
  const renderer = new Renderer();
  renderer.code = ({ text, lang }) => {
    const language = lang || "text";
    try {
      return hl.codeToHtml(text, {
        lang: language,
        theme: "github-dark",
      });
    } catch {
      // Fall back to plain <pre><code> if the language isn't loaded
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre><code>${escaped}</code></pre>`;
    }
  };
  return renderer;
}

/**
 * Renders instructor-authored lesson content. Deliberately permissive: raw HTML
 * in a lesson passes straight through, which is fine for trusted authors.
 *
 * Do NOT use this for anything a student can write — use renderCommentMarkdown.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const hl = await getHighlighter();

  return marked.parse(markdown, { renderer: createCodeRenderer(hl) }) as string;
}

// Tight allowlist for untrusted comment markup. `span`/`pre`/`code` plus the
// `style` attribute are what Shiki's highlighted output needs; everything else
// is the ordinary prose subset. No images (no tracking pixels), no raw HTML
// beyond these tags, and DOMPurify strips event handlers regardless.
const COMMENT_ALLOWED_TAGS = [
  "p", "br", "hr",
  "strong", "em", "b", "i", "del", "s", "sup", "sub",
  "code", "pre", "span",
  "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a",
  "table", "thead", "tbody", "tr", "th", "td",
];

const COMMENT_ALLOWED_ATTR = ["href", "title", "class", "style", "lang", "align"];

// Comment links point off-site. Open them in a new tab and sever the opener
// reference. Registered once — renderCommentMarkdown is the only sanitize caller.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

/**
 * Renders untrusted (student- and instructor-authored) comment markdown.
 *
 * Comments are stored raw and sanitized here, at render time — tightening this
 * allowlist later retroactively protects existing comments, and nothing is lost
 * on write. Shares the Shiki highlighter with renderMarkdown but adds the
 * sanitizer pass that renderMarkdown deliberately lacks.
 */
export async function renderCommentMarkdown(markdown: string): Promise<string> {
  const hl = await getHighlighter();

  const html = marked.parse(markdown, {
    renderer: createCodeRenderer(hl),
  }) as string;

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: COMMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: COMMENT_ALLOWED_ATTR,
    // http/https/mailto only — no javascript:, data:, or vbscript: URLs.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Links in comments point off-site; open them safely.
    ADD_ATTR: ["target", "rel"],
  });
}
