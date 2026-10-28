import { describe, expect, test } from "bun:test";
import campaignsJson from "../data/campaigns.json";
import {
  type CampaignEntry,
  getCampaignNotice,
  getCampaignStatus,
  parseCampaignsData,
  toJstDate,
} from "./campaigns";

const entry: CampaignEntry = {
  videoId: "a",
  label: "ACME 10%OFF",
  discountCode: "CODE",
  startsAt: "2026-09-19",
  expiresAt: "2026-10-18",
};

describe("parseCampaignsData", () => {
  test("正常なデータをパースする", () => {
    expect(parseCampaignsData({ campaigns: [entry] }).campaigns).toHaveLength(1);
    expect(parseCampaignsData({ campaigns: [] }).campaigns).toEqual([]);
  });
  test("同梱の campaigns.json が検証を通る", () => {
    expect(parseCampaignsData(campaignsJson).campaigns.length).toBeGreaterThan(0);
  });
  test("不正データは throw する", () => {
    expect(() => parseCampaignsData(null)).toThrow();
    expect(() => parseCampaignsData({})).toThrow();
    expect(() => parseCampaignsData({ campaigns: [null] })).toThrow();
    expect(() => parseCampaignsData({ campaigns: [{ ...entry, label: "" }] })).toThrow("label");
  });
  test("不正な日付は throw する", () => {
    expect(() =>
      parseCampaignsData({ campaigns: [{ ...entry, expiresAt: "2026-02-30" }] }),
    ).toThrow("expiresAt");
    expect(() => parseCampaignsData({ campaigns: [{ ...entry, startsAt: "2026/09/19" }] })).toThrow(
      "startsAt",
    );
    expect(() => parseCampaignsData({ campaigns: [{ ...entry, startsAt: "2026-10-19" }] })).toThrow(
      "以前",
    );
  });
  test("videoId 重複は throw する", () => {
    expect(() => parseCampaignsData({ campaigns: [entry, entry] })).toThrow("重複");
  });
});

describe("getCampaignStatus (JST日付境界)", () => {
  test("開始前", () => {
    expect(getCampaignStatus(entry, new Date("2026-09-18T14:59:59Z"))).toBe("upcoming");
  });
  test("開始日 0:00 JST から有効", () => {
    expect(getCampaignStatus(entry, new Date("2026-09-18T15:00:00Z"))).toBe("active");
  });
  test("終了日 23:59 JST まで有効", () => {
    expect(getCampaignStatus(entry, new Date("2026-10-18T14:59:59Z"))).toBe("active");
  });
  test("終了日翌日 0:00 JST で期限切れ", () => {
    expect(getCampaignStatus(entry, new Date("2026-10-18T15:00:00Z"))).toBe("expired");
  });
  test("toJstDate は UTC 日付をまたぐ", () => {
    expect(toJstDate(new Date("2026-10-18T15:00:00Z"))).toBe("2026-10-19");
  });
});

describe("getCampaignNotice", () => {
  const now = (iso: string) => new Date(iso);
  test("登録のない動画は null", () => {
    expect(getCampaignNotice("zzz", [entry], now("2026-10-01T00:00:00Z"))).toBeNull();
    expect(getCampaignNotice("a", [], now("2026-10-01T00:00:00Z"))).toBeNull();
  });
  test("有効期間内は有効期限を明示する", () => {
    const n = getCampaignNotice("a", [entry], now("2026-10-01T00:00:00Z"));
    expect(n?.status).toBe("active");
    expect(n?.message).toContain("2026/10/18");
  });
  test("期限切れは終了を明示する", () => {
    const n = getCampaignNotice("a", [entry], now("2026-10-28T00:00:00Z"));
    expect(n?.status).toBe("expired");
    expect(n?.message).toContain("2026/10/18で終了しました");
  });
  test("開始前は開始日を案内する", () => {
    const n = getCampaignNotice("a", [entry], now("2026-09-01T00:00:00Z"));
    expect(n?.status).toBe("upcoming");
    expect(n?.message).toContain("2026/09/19");
  });
});
