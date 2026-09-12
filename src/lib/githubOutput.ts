export type GitHubOutputValue = string | number | boolean;

export function formatGitHubMultilineOutput(
  fields: Record<string, GitHubOutputValue>,
  key: string,
  value: string,
  delimiterPrefix: string,
  createUuid: () => string = () => crypto.randomUUID(),
): string {
  if (/[\r\n]/.test(key) || Object.keys(fields).some((field) => /[\r\n]/.test(field))) {
    throw new Error("GitHub Actions outputのキーに改行を含められません");
  }
  if (Object.values(fields).some((fieldValue) => /[\r\n]/.test(String(fieldValue)))) {
    throw new Error("GitHub Actions outputの単一行値に改行を含められません");
  }

  let delimiter = `${delimiterPrefix}_${createUuid()}`;
  while (value.includes(delimiter)) {
    delimiter = `${delimiterPrefix}_${createUuid()}`;
  }

  return [
    ...Object.entries(fields).map(([field, fieldValue]) => `${field}=${fieldValue}`),
    `${key}<<${delimiter}`,
    value,
    delimiter,
    "",
  ].join("\n");
}
