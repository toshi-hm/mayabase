import { describe, expect, test } from "bun:test";
import { type MyPageVideoCandidate, parseMyPageCandidates, selectMyPageCards } from "./myPage";

const candidate = (id: string): MyPageVideoCandidate => ({
  id,
  title: `title-${id}`,
  publishedAt: "2026-01-01T00:00:00Z",
  isShort: false,
});

describe("parseMyPageCandidates", () => {
  test("配列でない場合は空配列を返す", () => {
    expect(parseMyPageCandidates(null)).toEqual([]);
    expect(parseMyPageCandidates({ id: "a" })).toEqual([]);
  });

  test("形式が正しい要素のみを残す", () => {
    const valid = candidate("a");
    const result = parseMyPageCandidates([
      valid,
      { ...valid, id: "b", isShort: null },
      { ...valid, id: 123 },
      { ...valid, title: undefined },
      "not-an-object",
      null,
    ]);
    expect(result).toEqual([valid, { ...valid, id: "b", isShort: null }]);
  });
});

describe("selectMyPageCards", () => {
  const candidateById = new Map(["a", "b", "c"].map((id) => [id, candidate(id)] as const));

  test("指定した順序で、実在する候補だけを選ぶ", () => {
    const result = selectMyPageCards(candidateById, ["c", "missing", "a"]);
    expect(result.map((c) => c.id)).toEqual(["c", "a"]);
  });

  test("limit件を超えたら打ち切る", () => {
    const result = selectMyPageCards(candidateById, ["a", "b", "c"], 2);
    expect(result.map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("不正なlimitは例外を投げる", () => {
    expect(() => selectMyPageCards(candidateById, ["a"], 0)).toThrow(RangeError);
    expect(() => selectMyPageCards(candidateById, ["a"], 1.5)).toThrow(RangeError);
  });

  test("該当する候補が無ければ空配列を返す", () => {
    expect(selectMyPageCards(candidateById, ["missing"])).toEqual([]);
  });
});
