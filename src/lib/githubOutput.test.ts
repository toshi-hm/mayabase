import { describe, expect, test } from "bun:test";
import { formatGitHubMultilineOutput } from "./githubOutput";

describe("formatGitHubMultilineOutput", () => {
  test("固定文字列を含む要約でも衝突しないdelimiterを生成する", () => {
    const output = formatGitHubMultilineOutput(
      { has_broken: true, broken_count: 1 },
      "summary",
      "本文 CHECK_LINKS_SUMMARY_EOF を含む要約",
      "CHECK_LINKS_SUMMARY",
    );

    const lines = output.split("\n");
    const delimiter = lines[2]?.replace("summary<<", "");
    expect(delimiter).toMatch(/^CHECK_LINKS_SUMMARY_[0-9a-f-]{36}$/);
    expect(lines.at(-2)).toBe(delimiter);
    expect(output).toContain("has_broken=true\nbroken_count=1\nsummary<<");
  });
});
