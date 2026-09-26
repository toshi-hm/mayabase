const TOPIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TOPIC_REQUESTS = 12;

/** 投票済みslugを保持するlocalStorageキー(他機能と同じくコロン区切り+バージョンサフィックス、#537) */
export const TOPIC_REQUEST_VOTES_STORAGE_KEY = "mayabase:topic-request-votes:v1";

export interface TopicRequest {
  slug: string;
  title: string;
  description: string;
}

export interface TopicRequestsData {
  topics: TopicRequest[];
}

export function parseTopicRequestsData(data: unknown): TopicRequestsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("topic-requests.json: オブジェクトではありません");
  }
  const rawTopics = (data as { topics?: unknown }).topics;
  if (!Array.isArray(rawTopics)) {
    throw new Error("topic-requests.json: topics は配列である必要があります");
  }
  if (rawTopics.length > MAX_TOPIC_REQUESTS) {
    throw new Error(
      `topic-requests.json: topics は${MAX_TOPIC_REQUESTS}件以内である必要があります`,
    );
  }

  const slugs = new Set<string>();
  const topics = rawTopics.map((rawTopic, index): TopicRequest => {
    if (typeof rawTopic !== "object" || rawTopic === null) {
      throw new Error(`topic-requests.json: topics[${index}] はオブジェクトである必要があります`);
    }
    const topic = rawTopic as Record<string, unknown>;
    if (
      typeof topic.slug !== "string" ||
      !TOPIC_SLUG_PATTERN.test(topic.slug) ||
      topic.slug.length > 64
    ) {
      throw new Error(`topic-requests.json: topics[${index}].slug が不正です`);
    }
    if (slugs.has(topic.slug)) {
      throw new Error(`topic-requests.json: slug が重複しています(${topic.slug})`);
    }
    slugs.add(topic.slug);
    if (
      typeof topic.title !== "string" ||
      topic.title.trim().length === 0 ||
      topic.title.length > 120 ||
      typeof topic.description !== "string" ||
      topic.description.trim().length === 0 ||
      topic.description.length > 300
    ) {
      throw new Error(`topic-requests.json: topics[${index}] のtitle/descriptionが不正です`);
    }
    return {
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
    };
  });

  return { topics };
}
