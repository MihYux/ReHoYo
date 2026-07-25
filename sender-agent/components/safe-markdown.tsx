import type { ReactNode } from "react";
import styles from "./safe-markdown.module.css";

function inlineMarkdown(value: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  const parts = value.split(tokenPattern).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableDivider(line: string) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.includes("|") && lines[index + 1]?.includes("|") && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className={styles.tableWrap} key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inlineMarkdown(row[cellIndex] || "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const Heading = `h${Math.min(heading[1].length + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(<Heading key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*[-*]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*\d+[.)]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index];
      if (/^(#{1,4})\s+/.test(next) || /^\s*[-*]\s+/.test(next) || /^\s*\d+[.)]\s+/.test(next)) break;
      if (next.includes("|") && lines[index + 1]?.includes("|") && isTableDivider(lines[index + 1])) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{paragraph.map((part, partIndex) => <span key={partIndex}>{inlineMarkdown(part)}{partIndex < paragraph.length - 1 ? <br /> : null}</span>)}</p>);
  }

  return <div className={styles.markdown} data-agent-markdown="true">{blocks}</div>;
}

