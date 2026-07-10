import { marked } from 'marked';
import type { Artifact } from '@/lib/api';

export function bindArtifactPreviewHeight(
  frame: HTMLIFrameElement | null,
  setHeight: (height: number) => void,
) {
  const doc = frame?.contentDocument;
  if (!doc) {
    return null;
  }
  const root = doc.documentElement;
  const body = doc.body;
  let raf = 0;

  const measure = () => {
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => {
      const bodyHeight = body
        ? Math.max(body.scrollHeight, body.offsetHeight, body.getBoundingClientRect().height)
        : 0;
      const rootHeight = root
        ? Math.max(root.scrollHeight, root.offsetHeight, root.getBoundingClientRect().height)
        : 0;
      setHeight(Math.max(360, Math.ceil(bodyHeight || rootHeight || 360)));
    });
  };

  measure();
  window.setTimeout(measure, 80);
  window.setTimeout(measure, 300);

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  if (resizeObserver) {
    if (root) {
      resizeObserver.observe(root);
    }
    if (body) {
      resizeObserver.observe(body);
    }
  }

  const mutationObserver = body ? new MutationObserver(measure) : null;
  mutationObserver?.observe(body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  body?.addEventListener('toggle', measure, true);
  frame?.contentWindow?.addEventListener('resize', measure);

  return () => {
    window.cancelAnimationFrame(raf);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    body?.removeEventListener('toggle', measure, true);
    frame?.contentWindow?.removeEventListener('resize', measure);
  };
}

export function buildArtifactPreviewDoc(artifact: Artifact, content: string) {
  if (isHTMLArtifact(artifact, content)) {
    return normalizeHTMLArtifact(content);
  }
  if (isMarkdownArtifact(artifact, content)) {
    return renderMarkdownArtifact(content);
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
        color: #1f2937;
        font: 14px/1.55 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      }
      body { padding: 24px; }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body><pre>${escapeHTML(content)}</pre></body>
</html>`;
}

function isHTMLArtifact(artifact: Artifact, content: string) {
  const name = artifact.name.toLowerCase();
  const type = artifact.type.toLowerCase();
  return (
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    type.includes('html') ||
    /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(content)
  );
}

function isMarkdownArtifact(artifact: Artifact, _content: string) {
  const name = artifact.name.toLowerCase();
  const type = artifact.type.toLowerCase();
  return name.endsWith('.md') || name.endsWith('.markdown') || type.includes('markdown');
}

function renderMarkdownArtifact(content: string) {
  const html = marked.parse(content, { async: false }) as string;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>
      html, body { margin: 0; min-height: 100%; background: #ffffff; color: #1f2937; font: 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { padding: 24px; max-width: 980px; margin: 0 auto; }
      h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 12px; line-height: 1.3; }
      p { margin: 0 0 12px; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.9em; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 4px solid #e5e7eb; margin: 0 0 12px; padding-left: 16px; color: #4b5563; }
      ul, ol { margin: 0 0 12px; padding-left: 24px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
      th { background: #f9fafb; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

function normalizeHTMLArtifact(content: string) {
  const trimmed = content.trimStart();
  const hasDocument = /^\s*(<!doctype\s+html|<html[\s>])/i.test(content);
  if (!hasDocument) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>html, body { margin: 0; min-height: 100%; }</style>
  </head>
  <body>${content}</body>
</html>`;
  }
  let doc = trimmed;
  if (!/<base\s/i.test(doc) && /<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
  }
  if (!/<meta\s+charset=/i.test(doc) && /<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">');
  }
  return doc;
}

function escapeHTML(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
