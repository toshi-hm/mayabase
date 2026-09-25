import { describe, expect, test } from "bun:test";
import topicRequestsJson from "../data/topic-requests.json";
import { MAX_TOPIC_REQUESTS, parseTopicRequestsData } from "./topicRequests";

describe("parseTopicRequestsData", () => {
  test("コミット済み候補を読み込める", () => {
    const parsed = parseTopicRequestsData(topicRequestsJson);
    expect(parsed.topics.length).toBeGreaterThan(0);
  });

  test("slugの重複と不正形式を拒否する", () => {
    const topic = { slug: "same-topic", title: "A", description: "B" };
    expect(() => parseTopicRequestsData({ topics: [topic, topic] })).toThrow("重複");
    expect(() => parseTopicRequestsData({ topics: [{ ...topic, slug: "日本語" }] })).toThrow(
      "slug",
    );
  });

  test("候補数と表示文言の上限を検証する", () => {
    const topic = { slug: "topic", title: "A", description: "B" };
    expect(() =>
      parseTopicRequestsData({
        topics: Array.from({ length: MAX_TOPIC_REQUESTS + 1 }, (_, index) => ({
          ...topic,
          slug: `topic-${index}`,
        })),
      }),
    ).toThrow("件以内");
    expect(() => parseTopicRequestsData({ topics: [{ ...topic, title: "" }] })).toThrow("title");
  });
});
