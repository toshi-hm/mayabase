/**
 * 修飾キー押下・中クリック等、「新しいタブ/ウィンドウで開く」という標準のリンク操作を
 * 期待したクリックかどうかを判定する。ShareButton.astro(#479)で採用された判定基準を
 * 他のクリック委譲(WatchedController.astro / ContinueWatchingController.astro 等)でも
 * 再利用できるよう切り出したもの。
 */
export function isAugmentedClick(
  event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
): boolean {
  return event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
}
