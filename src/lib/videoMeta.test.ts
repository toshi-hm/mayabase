import { describe, expect, test } from "bun:test";
import { dedupeMetaDescriptions } from "./videoMeta";

describe("dedupeMetaDescriptions", () => {
  test("一意な description はそのまま返す", () => {
    const map = dedupeMetaDescriptions([
      { id: "a", title: "A", description: "説明A" },
      { id: "b", title: "B", description: "説明B" },
    ]);
    expect(map.get("a")).toBe("説明A");
    expect(map.get("b")).toBe("説明B");
  });

  test("重複した description にはタイトルを前置して差別化する", () => {
    const map = dedupeMetaDescriptions([
      { id: "a", title: "動画A #pr", description: "提供: X" },
      { id: "b", title: "動画B", description: "提供: X" },
      { id: "c", title: "動画C", description: "別の説明" },
    ]);
    expect(map.get("a")).toBe("動画A｜提供: X");
    expect(map.get("b")).toBe("動画B｜提供: X");
    expect(map.get("c")).toBe("別の説明");
  });

  test("前置後も maxLength を超えない", () => {
    const long = "あ".repeat(140);
    const map = dedupeMetaDescriptions(
      [
        { id: "a", title: "タイトル", description: long },
        { id: "b", title: "タイトル2", description: long },
      ],
      140,
    );
    expect([...(map.get("a") ?? "")].length).toBeLessThanOrEqual(141);
  });
});
