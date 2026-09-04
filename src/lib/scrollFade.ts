/**
 * 横スクロール領域の「続きがある」ことを示すフェードヒントを、どちら側(始端/終端)に
 * 表示すべきか判定する。スクロールバーが非表示になりがちなモバイル端末でも、
 * まだスクロールできる方向を視覚的に伝えるために使う(#329)。
 *
 * @param scrollLeft 現在のスクロール位置(要素の `scrollLeft`)
 * @param scrollWidth スクロール可能な全幅(要素の `scrollWidth`)
 * @param clientWidth 表示領域の幅(要素の `clientWidth`)
 * @param threshold 端とみなす許容誤差(px)。ブラウザによる端数丸めを吸収する
 */
export function computeScrollFadeEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  threshold = 4,
): { showStart: boolean; showEnd: boolean } {
  // スクロール自体が発生しない(全項目が収まっている)場合は両端とも非表示
  const isScrollable = scrollWidth - clientWidth > threshold;
  if (!isScrollable) {
    return { showStart: false, showEnd: false };
  }

  const maxScrollLeft = scrollWidth - clientWidth;
  return {
    showStart: scrollLeft > threshold,
    showEnd: scrollLeft < maxScrollLeft - threshold,
  };
}
