import { textMatchesKeyword } from "./format";

/** FAQ の補足リンク(回答の下に表示する) */
export interface FaqLink {
  label: string;
  /** サイト内パス("/" 始まり)または https の外部 URL */
  url: string;
}

/** Q&A 1 件分のデータ。faq.json で手動管理する */
export interface FaqItem {
  question: string;
  /** プレーンテキストの回答(FAQPage JSON-LD の Answer.text にも使う) */
  answer: string;
  link?: FaqLink;
  /** 明示的に関連付ける動画ID(任意)。 */
  videoIds?: string[];
  /** タイトル・概要欄・カテゴリへの自動マッチに使うキーワード(任意)。 */
  keywords?: string[];
  /**
   * 問い合わせ用メールアドレス(スクレイピング対策として "@" を "☆" に置き換えた形式)。
   * 静的 HTML には生アドレスを埋め込まず、クライアントサイドでコピーボタン用に復元する。
   */
  email?: string;
}

/** FAQ のカテゴリ(見出し + Q&A のまとまり) */
export interface FaqCategory {
  title: string;
  items: FaqItem[];
}

/** faq.json 全体の構造 */
export interface FaqData {
  categories: FaqCategory[];
}

/**
 * サイト内パスかどうか。プロトコル相対 URL(//host)は外部オリジンに解決されるため
 * サイト内パスとして扱わない(表示側の内部/外部リンク分岐にも使う)。
 */
export function isInternalPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/** "☆" でマスクされたメールアドレスを実際のアドレスに復元する(スクレイピング対策) */
export function deobfuscateEmail(obfuscated: string): string {
  return obfuscated.replace("☆", "@");
}

/**
 * FAQ のキーワード検索(faq.astro のクライアントスクリプトから使用)。
 * question / answer / query はいずれも呼び出し側で小文字化済みの前提。
 * `textMatchesKeyword`(format.ts、動画ライブラリの検索と共通)を使い、英数字のみの
 * キーワードは単語境界で照合する(例: "AI" が "gmail" 等に誤マッチしないように)。
 */
export function faqTextMatches(question: string, answer: string, query: string): boolean {
  return textMatchesKeyword(question, query) || textMatchesKeyword(answer, query);
}

function parseLink(raw: unknown, path: string): FaqLink {
  const link = raw as Partial<Record<keyof FaqLink, unknown>>;
  if (typeof link.label !== "string" || link.label.length === 0) {
    throw new Error(`faq.json: ${path}.label が不正です`);
  }
  // サイト内パスか https のみ許可(javascript: スキームやプロトコル相対 URL の混入を防ぐ)
  if (
    typeof link.url !== "string" ||
    !(isInternalPath(link.url) || link.url.startsWith("https://"))
  ) {
    throw new Error(`faq.json: ${path}.url は "/"(// を除く)か https:// で始まる必要があります`);
  }
  return { label: link.label, url: link.url };
}

/**
 * faq.json の内容を検証しつつパースする。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseFaqData(data: unknown): FaqData {
  if (typeof data !== "object" || data === null) {
    throw new Error("faq.json: オブジェクトではありません");
  }
  const { categories } = data as { categories?: unknown };
  if (!Array.isArray(categories)) {
    throw new Error("faq.json: categories は配列である必要があります");
  }
  const parsed: FaqCategory[] = categories.map((rawCategory, i) => {
    const category = rawCategory as Partial<Record<keyof FaqCategory, unknown>>;
    if (typeof category.title !== "string" || category.title.length === 0) {
      throw new Error(`faq.json: categories[${i}].title が不正です`);
    }
    if (!Array.isArray(category.items) || category.items.length === 0) {
      throw new Error(`faq.json: categories[${i}].items は 1 件以上の配列である必要があります`);
    }
    const items: FaqItem[] = category.items.map((rawItem, j) => {
      const item = rawItem as Partial<Record<keyof FaqItem, unknown>>;
      const path = `categories[${i}].items[${j}]`;
      if (typeof item.question !== "string" || item.question.length === 0) {
        throw new Error(`faq.json: ${path}.question が不正です`);
      }
      if (typeof item.answer !== "string" || item.answer.length === 0) {
        throw new Error(`faq.json: ${path}.answer が不正です`);
      }
      if (
        item.email !== undefined &&
        (typeof item.email !== "string" || !item.email.includes("☆") || item.email.includes("@"))
      ) {
        throw new Error(
          `faq.json: ${path}.email は "☆" で "@" をマスクした形式(例: xxx☆example.com)である必要があります`,
        );
      }
      if (
        item.videoIds !== undefined &&
        (!Array.isArray(item.videoIds) ||
          item.videoIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(id)))
      ) {
        throw new Error(`faq.json: ${path}.videoIds は動画IDの配列である必要があります`);
      }
      if (
        item.keywords !== undefined &&
        (!Array.isArray(item.keywords) ||
          item.keywords.some(
            (keyword) => typeof keyword !== "string" || keyword.trim().length === 0,
          ))
      ) {
        throw new Error(`faq.json: ${path}.keywords は空でない文字列の配列である必要があります`);
      }
      return {
        question: item.question,
        answer: item.answer,
        ...(item.link !== undefined ? { link: parseLink(item.link, `${path}.link`) } : {}),
        ...(item.videoIds !== undefined ? { videoIds: item.videoIds as string[] } : {}),
        ...(item.keywords !== undefined ? { keywords: item.keywords as string[] } : {}),
        ...(item.email !== undefined ? { email: item.email as string } : {}),
      };
    });
    return { title: category.title, items };
  });
  return { categories: parsed };
}
