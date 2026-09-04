import { describe, expect, test } from "bun:test";
import { computeScrollFadeEdges } from "./scrollFade";

describe("computeScrollFadeEdges", () => {
  test("全項目が収まりスクロール不要な場合は両端とも非表示", () => {
    expect(computeScrollFadeEdges(0, 300, 400)).toEqual({ showStart: false, showEnd: false });
  });

  test("先頭(スクロール位置0)では終端のフェードのみ表示する", () => {
    expect(computeScrollFadeEdges(0, 800, 400)).toEqual({ showStart: false, showEnd: true });
  });

  test("末尾までスクロールした場合は始端のフェードのみ表示する", () => {
    expect(computeScrollFadeEdges(400, 800, 400)).toEqual({ showStart: true, showEnd: false });
  });

  test("中間位置では両端のフェードを表示する", () => {
    expect(computeScrollFadeEdges(200, 800, 400)).toEqual({ showStart: true, showEnd: true });
  });

  test("端数の丸め誤差はしきい値内であれば端とみなす", () => {
    expect(computeScrollFadeEdges(1, 800, 400)).toEqual({ showStart: false, showEnd: true });
    expect(computeScrollFadeEdges(399, 800, 400)).toEqual({ showStart: true, showEnd: false });
  });
});
