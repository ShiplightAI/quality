"use client";

import { ExternalLink, X } from "lucide-react";
import { ActionIcon } from "@mantine/core";

type MarkdownBlock =
  | { readonly type: "heading"; readonly level: number; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "code"; readonly language: string; readonly code: string }
  | { readonly type: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly type: "quote"; readonly text: string }
  | { readonly type: "rule" }
  | { readonly type: "table"; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] };

interface MarkdownOverlayProps {
  readonly title: string;
  readonly artifactPath: string;
  readonly content?: string;
  readonly error?: string;
  readonly isLoading: boolean;
  readonly sizeBytes?: number;
  onClose(): void;
}

function isSafeHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:");
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (token.startsWith("`")) {
      nodes.push(<code key={`code:${index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={`strong:${index}`}>{token.slice(2, -2)}</strong>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = link?.[1] ?? token;
      const href = link?.[2] ?? "";
      nodes.push(
        isSafeHref(href) ? (
          <a href={href} key={`link:${index}`} rel="noreferrer" target="_blank">
            {label}
          </a>
        ) : (
          <span key={`link:${index}`}>{label}</span>
        )
      );
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function tableCells(line: string): readonly string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isBlockStart(line: string, nextLine?: string): boolean {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^(```|~~~)/.test(line) ||
    /^-{3,}$/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    (line.includes("|") && nextLine !== undefined && isTableSeparator(nextLine))
  );
}

function parseMarkdown(markdown: string): readonly MarkdownBlock[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^(```|~~~)\s*(.*)$/);
    if (fence !== null) {
      const marker = fence[1]!;
      const language = fence[2]?.trim() ?? "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").startsWith(marker)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading !== null) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length,
        text: heading[2]!.trim()
      });
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (line.includes("|") && nextLine !== undefined && isTableSeparator(nextLine)) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push([...tableCells(lines[index] ?? "")]);
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered !== null || ordered !== null) {
      const orderedList = ordered !== null;
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index] ?? "";
        const match = orderedList
          ? current.match(/^\s*\d+[.)]\s+(.+)$/)
          : current.match(/^\s*[-*+]\s+(.+)$/);

        if (match === null) {
          break;
        }

        items.push(match[1]!.trim());
        index += 1;
      }

      blocks.push({ type: "list", ordered: orderedList, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "quote", text: quoteLines.join(" ") });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      const next = lines[index + 1];

      if (current.trim() === "" || (paragraphLines.length > 0 && isBlockStart(current, next))) {
        break;
      }

      paragraphLines.push(current.trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderBlock(block: MarkdownBlock, index: number): React.ReactElement {
  if (block.type === "heading") {
    if (block.level === 1) {
      return <h1 key={`heading:${index}`}>{renderInline(block.text)}</h1>;
    }

    if (block.level === 2) {
      return <h2 key={`heading:${index}`}>{renderInline(block.text)}</h2>;
    }

    if (block.level === 3) {
      return <h3 key={`heading:${index}`}>{renderInline(block.text)}</h3>;
    }

    if (block.level === 4) {
      return <h4 key={`heading:${index}`}>{renderInline(block.text)}</h4>;
    }

    if (block.level === 5) {
      return <h5 key={`heading:${index}`}>{renderInline(block.text)}</h5>;
    }

    return <h6 key={`heading:${index}`}>{renderInline(block.text)}</h6>;
  }

  if (block.type === "paragraph") {
    return <p key={`paragraph:${index}`}>{renderInline(block.text)}</p>;
  }

  if (block.type === "code") {
    return (
      <pre key={`code:${index}`}>
        <code>{block.code}</code>
      </pre>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag key={`list:${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}:${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "quote") {
    return <blockquote key={`quote:${index}`}>{renderInline(block.text)}</blockquote>;
  }

  if (block.type === "rule") {
    return <hr key={`rule:${index}`} />;
  }

  return (
    <div className="markdown-table-wrap" key={`table:${index}`}>
      <table>
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => (
              <th key={`${header}:${headerIndex}`}>{renderInline(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`row:${rowIndex}`}>
              {block.headers.map((_, cellIndex) => (
                <td key={`cell:${rowIndex}:${cellIndex}`}>{renderInline(row[cellIndex] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownOverlay({
  title,
  artifactPath,
  content,
  error,
  isLoading,
  sizeBytes,
  onClose
}: MarkdownOverlayProps): React.ReactElement {
  const blocks = content === undefined ? [] : parseMarkdown(content);

  return (
    <div className="markdown-overlay" role="presentation">
      <div className="markdown-backdrop" onClick={onClose} />
      <section
        aria-label="Markdown file viewer"
        aria-modal="true"
        className="markdown-modal"
        role="dialog"
      >
        <header className="markdown-modal-header">
          <div>
            <p className="eyebrow">Markdown viewer</p>
            <h2>{title}</h2>
            <code>{artifactPath}</code>
          </div>
          <ActionIcon aria-label="Close Markdown viewer" variant="subtle" color="gray" onClick={onClose}>
            <X aria-hidden size={18} />
          </ActionIcon>
        </header>

        <div className="markdown-modal-meta">
          <span>read-only</span>
          <span>local artifact</span>
          {sizeBytes !== undefined ? <span>{sizeBytes.toLocaleString()} bytes</span> : null}
          <span>
            <ExternalLink aria-hidden="true" size={14} />
            links open externally
          </span>
        </div>

        <div className="markdown-modal-body">
          {isLoading ? <p className="empty-inline">Loading Markdown artifact...</p> : null}
          {error !== undefined ? <p className="markdown-error">{error}</p> : null}
          {!isLoading && error === undefined && blocks.length === 0 ? (
            <p className="empty-inline">This Markdown artifact is empty.</p>
          ) : null}
          {!isLoading && error === undefined && blocks.length > 0 ? (
            <article className="markdown-document">
              {blocks.map((block, index) => renderBlock(block, index))}
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
