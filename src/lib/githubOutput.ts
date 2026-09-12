export type GitHubOutputValue = string | number | boolean;

export function formatGitHubMultilineOutput(
  fields: Record<string, GitHubOutputValue>,
  key: string,
  value: string,
  delimiterPrefix: string,
): string {
  let delimiter = `${delimiterPrefix}_${crypto.randomUUID()}`;
  while (value.includes(delimiter)) {
    delimiter = `${delimiterPrefix}_${crypto.randomUUID()}`;
  }

  return [
    ...Object.entries(fields).map(([field, fieldValue]) => `${field}=${fieldValue}`),
    `${key}<<${delimiter}`,
    value,
    delimiter,
    "",
  ].join("\n");
}
