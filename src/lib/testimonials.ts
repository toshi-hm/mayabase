/** testimonials.json で運営者が手動キュレーションする視聴者の声 */
export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  sourceUrl?: string;
}

export interface TestimonialsData {
  testimonials: Testimonial[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_QUOTE_LENGTH = 1000;
const MAX_AUTHOR_LENGTH = 100;

function isValidSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function parseTestimonialsData(data: unknown): TestimonialsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("testimonials.json: オブジェクトではありません");
  }
  const rawTestimonials = (data as { testimonials?: unknown }).testimonials;
  if (!Array.isArray(rawTestimonials)) {
    throw new Error("testimonials.json: testimonials は配列である必要があります");
  }

  const seenIds = new Set<string>();
  const testimonials = rawTestimonials.map((raw, index): Testimonial => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`testimonials.json: testimonials[${index}] が不正です`);
    }
    const item = raw as Partial<Record<keyof Testimonial, unknown>>;
    if (typeof item.id !== "string" || !ID_PATTERN.test(item.id) || seenIds.has(item.id)) {
      throw new Error(`testimonials.json: testimonials[${index}].id が不正です`);
    }
    seenIds.add(item.id);
    if (
      typeof item.quote !== "string" ||
      item.quote.trim().length === 0 ||
      item.quote.length > MAX_QUOTE_LENGTH
    ) {
      throw new Error(`testimonials.json: testimonials[${index}].quote が不正です`);
    }
    if (
      typeof item.author !== "string" ||
      item.author.trim().length === 0 ||
      item.author.length > MAX_AUTHOR_LENGTH
    ) {
      throw new Error(`testimonials.json: testimonials[${index}].author が不正です`);
    }
    if (item.sourceUrl !== undefined && !isValidSourceUrl(item.sourceUrl)) {
      throw new Error(
        `testimonials.json: testimonials[${index}].sourceUrl は https:// で始まる必要があります`,
      );
    }
    return {
      id: item.id,
      quote: item.quote,
      author: item.author,
      ...(item.sourceUrl !== undefined ? { sourceUrl: item.sourceUrl } : {}),
    };
  });
  return { testimonials };
}
