/** campaigns.json の1件。運営者が手動でキュレーションする期限付きPR割引コード。日付は JST の YYYY-MM-DD */
export interface CampaignEntry {
  videoId: string;
  label: string;
  discountCode: string;
  /** 開始日(JST・当日を含む) */
  startsAt: string;
  /** 終了日(JST・当日を含む) */
  expiresAt: string;
}

export interface CampaignsData {
  campaigns: CampaignEntry[];
}

export type CampaignStatus = "upcoming" | "active" | "expired";

export interface CampaignNotice {
  status: CampaignStatus;
  message: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const jstDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });

function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** campaigns.json を検証しつつパースする。不正データは具体的なメッセージ付きで throw する */
export function parseCampaignsData(data: unknown): CampaignsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("campaigns.json: オブジェクトではありません");
  }
  const { campaigns } = data as { campaigns?: unknown };
  if (!Array.isArray(campaigns)) {
    throw new Error("campaigns.json: campaigns は配列である必要があります");
  }
  const entries = campaigns.map((raw, i): CampaignEntry => {
    const e = (raw ?? {}) as Partial<Record<keyof CampaignEntry, unknown>>;
    for (const key of ["videoId", "label", "discountCode", "startsAt", "expiresAt"] as const) {
      if (typeof e[key] !== "string" || e[key].length === 0) {
        throw new Error(`campaigns.json: [${i}].${key} は空でない文字列である必要があります`);
      }
    }
    for (const key of ["startsAt", "expiresAt"] as const) {
      if (!isValidDate(e[key] as string)) {
        throw new Error(
          `campaigns.json: [${i}].${key} は実在する YYYY-MM-DD 形式である必要があります`,
        );
      }
    }
    if ((e.startsAt as string) > (e.expiresAt as string)) {
      throw new Error(`campaigns.json: [${i}] startsAt は expiresAt 以前である必要があります`);
    }
    return {
      videoId: e.videoId as string,
      label: e.label as string,
      discountCode: e.discountCode as string,
      startsAt: e.startsAt as string,
      expiresAt: e.expiresAt as string,
    };
  });
  if (new Set(entries.map((e) => e.videoId)).size !== entries.length) {
    throw new Error("campaigns.json: videoId に重複があります");
  }
  return { campaigns: entries };
}

/** 現在時刻の JST 日付(YYYY-MM-DD) */
export function toJstDate(now: Date): string {
  return jstDateFormatter.format(now);
}

/** YYYY-MM-DD → 表示用 YYYY/MM/DD */
function formatDate(date: string): string {
  return date.replaceAll("-", "/");
}

export function getCampaignStatus(entry: CampaignEntry, now: Date): CampaignStatus {
  const today = toJstDate(now);
  if (today < entry.startsAt) return "upcoming";
  if (today > entry.expiresAt) return "expired";
  return "active";
}

/**
 * 動画詳細ページに出す注意書き。キャンペーン情報が無い動画は null。
 * 終了後は割引が継続していると誤解させない文言にする。
 */
export function getCampaignNotice(
  videoId: string,
  entries: readonly CampaignEntry[],
  now: Date,
): CampaignNotice | null {
  const entry = entries.find((e) => e.videoId === videoId);
  if (!entry) return null;
  const status = getCampaignStatus(entry, now);
  const code = entry.discountCode;
  if (status === "expired") {
    return {
      status,
      message: `この動画で紹介している割引コード「${code}」(${entry.label})は${formatDate(entry.expiresAt)}で終了しました。以下の概要欄の割引情報は現在ご利用いただけません。`,
    };
  }
  if (status === "upcoming") {
    return {
      status,
      message: `割引コード「${code}」(${entry.label})は${formatDate(entry.startsAt)}から利用できます(有効期間: ${formatDate(entry.startsAt)} ～ ${formatDate(entry.expiresAt)})。`,
    };
  }
  return {
    status,
    message: `割引コード「${code}」(${entry.label})の有効期限は${formatDate(entry.expiresAt)}までです。`,
  };
}
