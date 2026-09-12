import { describe, expect, test } from "bun:test";
import { formatGitHubMultilineOutput } from "./githubOutput";

describe("formatGitHubMultilineOutput", () => {
  test("要約に衝突するdelimiterを再生成する", () => {
    let calls = 0;
    const output = formatGitHubMultilineOutput(
      { has_broken: true, broken_count: 1 },
      "summary",
      "本文 CHECK_LINKS_SUMMARY_collision を含む要約",
      "CHECK_LINKS_SUMMARY",
      () => (calls++ === 0 ? "collision" : "safe"),
    );

    const lines = output.split("\n");
    expect(lines[2]).toBe("summary<<CHECK_LINKS_SUMMARY_safe");
    expect(lines.at(-2)).toBe("CHECK_LINKS_SUMMARY_safe");
    expect(calls).toBe(2);
  });

  test("単一行フィールドへの改行混入を拒否する", () => {
    expect(() =>
      formatGitHubMultilineOutput(
        { fetched_at: "2026-01-01\nmalicious" },
        "summary",
        "本文",
        "TEST",
      ),
    ).toThrow("単一行値");
  });
});
