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

function parseLink(raw: unknown, path: string): FaqLink {
  const link = raw as Partial<Record<keyof FaqLink, unknown>>;
  if (typeof link.label !== "string" || link.label.length === 0) {
    throw new Error(`faq.json: ${path}.label が不正です`);
  }
  // サイト内パスか https のみ許可(javascript: 等のスキーム混入を防ぐ)
  if (
    typeof link.url !== "string" ||
    !(link.url.startsWith("/") || link.url.startsWith("https://"))
  ) {
    throw new Error(`faq.json: ${path}.url は "/" か https:// で始まる必要があります`);
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
      return {
        question: item.question,
        answer: item.answer,
        ...(item.link !== undefined ? { link: parseLink(item.link, `${path}.link`) } : {}),
      };
    });
    return { title: category.title, items };
  });
  return { categories: parsed };
}
