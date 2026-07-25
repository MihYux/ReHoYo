import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "@/components/safe-markdown";

describe("SafeMarkdown", () => {
  it("renders bold text, lists, tables, code, and safe links", () => {
    render(<SafeMarkdown content={`**核心判断**与\`规则\`

- 第一项
- 第二项

| 区域 | 动作 |
| --- | --- |
| 日本 | 回流 |

[公开来源](https://example.com/source)`} />);

    expect(screen.getByText("核心判断").tagName).toBe("STRONG");
    expect(screen.getByText("规则").tagName).toBe("CODE");
    expect(screen.getByRole("list").children).toHaveLength(2);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "公开来源" })).toHaveAttribute("href", "https://example.com/source");
  });

  it("does not execute raw HTML", () => {
    const { container } = render(<SafeMarkdown content={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });
});
