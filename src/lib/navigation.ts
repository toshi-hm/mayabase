/**
 * ナビゲーション項目の href が現在ページと一致する(=現在地とみなす)か判定する。
 * `/videos/{id}/` や `/videos/category/{category}/` のようなネストしたルートも
 * `href` 配下であれば現在地として扱う。ホーム("/")のみ完全一致とする
 * (そうしないと全ページが "/" にマッチしてしまうため)。
 */
export function isNavCurrent(currentPath: string, href: string): boolean {
  const normalizedCurrent = currentPath.replace(/\/+$/, "") || "/";
  const normalizedHref = href.replace(/\/+$/, "") || "/";

  if (normalizedHref === "/") {
    return normalizedCurrent === "/";
  }

  return normalizedCurrent === normalizedHref || normalizedCurrent.startsWith(`${normalizedHref}/`);
}
