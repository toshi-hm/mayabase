/** パンくず 1 項目分。視覚的な UI と BreadcrumbList JSON-LD の両方で共用する */
export interface BreadcrumbItem {
  /** 表示ラベル */
  name: string;
  /** サイト内パス("/" 始まり)。ホームは "/" */
  href: string;
}

/**
 * BreadcrumbList JSON-LD の itemListElement を組み立てる。
 * 視覚的な UI(Breadcrumb.astro)と同じ items を渡すことで、
 * 構造化データと画面表示の不一致を防ぐ。
 */
export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[], siteUrl: string) {
  return items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: new URL(item.href, siteUrl).toString(),
  }));
}
