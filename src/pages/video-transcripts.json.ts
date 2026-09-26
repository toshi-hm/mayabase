import type { APIRoute } from "astro";
import transcriptsJson from "../data/transcripts.json";
import { parseTranscriptsData } from "../lib/transcripts";

/**
 * 動画の文字起こし(字幕)本文を、動画ライブラリ・カテゴリ別/シリーズ別ページの
 * キーワード検索対象に含めるための遅延取得エンドポイント(#480)。
 *
 * video-descriptions.json.ts(概要欄本文)と同じ方針で、字幕がある動画のみを対象に
 * ビルド時に静的JSONとして書き出し、検索パネルへの入力時にのみ取得する
 * (「動画の中で実際に何を話しているか」というキーワードでも動画を発見できるようにする)。
 */
export const GET: APIRoute = () => {
  const { transcripts } = parseTranscriptsData(transcriptsJson);
  const texts = Object.fromEntries(
    Object.entries(transcripts).map(([videoId, transcript]) => [
      videoId,
      transcript.text.toLowerCase(),
    ]),
  );
  return new Response(JSON.stringify(texts), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
