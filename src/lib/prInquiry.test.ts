import { describe, expect, test } from "bun:test";
import {
  buildInquiryMailto,
  buildInquiryTemplate,
  INQUIRY_DISCLAIMER,
  INQUIRY_FLOW,
  INQUIRY_ITEMS,
  INQUIRY_MAIL_SUBJECT,
} from "./prInquiry";

describe("prInquiry", () => {
  test("テンプレートは全項目を1行ずつ含み、見出しから始まる", () => {
    const lines = buildInquiryTemplate().split("\n");
    expect(lines[0]).toBe("【PR・タイアップのご相談】");
    expect(lines).toHaveLength(INQUIRY_ITEMS.length + 1);
    for (const item of INQUIRY_ITEMS) {
      expect(lines).toContain(`■${item}:`);
    }
  });

  test("テンプレートにメールアドレスなど個人情報を含まない", () => {
    expect(buildInquiryTemplate()).not.toMatch(/@|☆/);
  });

  test("フローは相談から公開までの5段階で、項目に重複がない", () => {
    expect(INQUIRY_FLOW.map((s) => s.title)).toEqual([
      "お問い合わせ",
      "内容確認・条件調整",
      "製品使用・検証",
      "制作",
      "公開",
    ]);
    expect(new Set(INQUIRY_ITEMS).size).toBe(INQUIRY_ITEMS.length);
  });

  test("納期・掲載・肯定評価を保証する表現を使わない", () => {
    const all = [INQUIRY_DISCLAIMER, ...INQUIRY_FLOW.map((s) => s.title + s.description)].join("");
    expect(all).not.toMatch(/必ず|確実|保証します|お約束します/);
    expect(INQUIRY_DISCLAIMER).toContain("お約束するものではありません");
  });

  test("mailto URL は宛先・件名・テンプレート本文を含む", () => {
    const url = buildInquiryMailto("a@example.com");
    expect(url.startsWith("mailto:a@example.com?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject")).toBe(INQUIRY_MAIL_SUBJECT);
    expect(params.get("body")).toBe(buildInquiryTemplate());
  });

  test("mailto URL に改行や日本語が正しくエンコードされ、生の改行を含まない", () => {
    const url = buildInquiryMailto("a@example.com");
    expect(url).not.toMatch(/[\n ]/);
    expect(url).toContain("%0A");
  });
});
