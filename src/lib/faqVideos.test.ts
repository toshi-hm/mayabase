import { describe, expect, test } from "bun:test";
import type { FaqItem } from "./faq";
import { findFaqItemsForVideo, resolveFaqVideos } from "./faqVideos";
import type { Video } from "./youtube";

function video(id: string, title: string, description = ""): Video {
  return {
    id,
    title,
    description,
    publishedAt: "2026-01-01T00:00:00Z",
    isShort: false,
    viewCount: null,
    duration: null,
  };
}

describe("faqVideos", () => {
  test("カテゴリリンクから関連動画を解決する", () => {
    const item: FaqItem = {
      question: "キャリア動画",
      answer: "キャリアの質問",
      link: { label: "探す", url: "/videos/category/career/" },
    };
    expect(
      resolveFaqVideos(item, [
        video("career", "大学院を卒業しました"),
        video("gadget", "新しいキーボードを購入"),
      ]).map((entry) => entry.id),
    ).toEqual(["career"]);
  });

  test("キーワードでタイトル・概要欄・カテゴリを横断してマッチする", () => {
    const item: FaqItem = {
      question: "機材",
      answer: "ガジェット",
      keywords: ["ガジェット"],
    };
    expect(
      resolveFaqVideos(item, [
        video("title", "ガジェットを紹介"),
        video("description", "愛用ガジェットのレビュー"),
        video("other", "休日の過ごし方"),
      ]).map((entry) => entry.id),
    ).toEqual(["title", "description"]);
  });

  test("明示IDとキーワードの重複を1件にまとめる", () => {
    const item: FaqItem = {
      question: "動画",
      answer: "動画",
      videoIds: ["one"],
      keywords: ["ガジェット"],
    };
    expect(
      resolveFaqVideos(item, [video("one", "ガジェット紹介")]).map((entry) => entry.id),
    ).toEqual(["one"]);
  });

  test("動画側から同じ判定でFAQを逆引きする", () => {
    const item: FaqItem = {
      question: "レビュー",
      answer: "ガジェット",
      keywords: ["レビュー"],
    };
    expect(findFaqItemsForVideo([item], video("one", "ガジェットのレビュー"))).toEqual([item]);
  });
});
