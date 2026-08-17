import { textMatchesKeyword } from "./format";
import type { Video } from "./youtube";

/**
 * 「二足のわらじ」シリーズの判定キーワード。
 * エンジニア×大学院生としての「二足のわらじ」生活を指す、チャンネルを象徴する継続シリーズ。
 * カテゴリ(ai/gadget/vlog/career)を横断して付与されるタイトルタグのため、
 * `categorizeVideo`(カテゴリ判定)とは独立に判定する(#174)。
 */
const FUTATSU_NO_WARAJI_KEYWORD = "二足のわらじ";

/** 動画のタイトルが「二足のわらじ」シリーズに属するかを判定する */
export function isFutatsuNoWarajiSeries(video: Pick<Video, "title">): boolean {
  return textMatchesKeyword(video.title, FUTATSU_NO_WARAJI_KEYWORD);
}

/** 「二足のわらじ」シリーズアーカイブページの URL(#174) */
export function futatsuNoWarajiSeriesUrl(): string {
  return "/videos/series/futatsu-no-waraji/";
}
