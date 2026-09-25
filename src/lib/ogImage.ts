const WIDTH = 1200;
const HEIGHT = 630;
const MAX_TITLE_LINES = 3;
const TITLE_CHARS_PER_LINE = 18;

export interface OgImageOptions {
  title: string;
  subtitle?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapOgTitle(title: string): string[] {
  const normalized = title.trim();
  if (normalized.length === 0) return [""];
  const characters = Array.from(normalized);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += TITLE_CHARS_PER_LINE) {
    lines.push(characters.slice(index, index + TITLE_CHARS_PER_LINE).join(""));
    if (lines.length === MAX_TITLE_LINES) break;
  }
  if (characters.length > MAX_TITLE_LINES * TITLE_CHARS_PER_LINE) {
    const last = lines[MAX_TITLE_LINES - 1] ?? "";
    lines[MAX_TITLE_LINES - 1] = `${last.slice(0, -1)}…`;
  }
  return lines;
}

export function buildOgImageSvg({ title, subtitle }: OgImageOptions): string {
  const titleLines = wrapOgTitle(title).map(escapeXml);
  const escapedSubtitle = subtitle ? escapeXml(subtitle.trim()) : "";
  const titleStartY = titleLines.length === 1 ? 310 : titleLines.length === 2 ? 275 : 240;
  const titleMarkup = titleLines
    .map((line, index) => `<text x="96" y="${titleStartY + index * 82}" class="title">${line}</text>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(title)}</title>
  <desc id="description">${escapedSubtitle || "MayaBase のページ共有画像"}</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2430" />
      <stop offset="100%" stop-color="#1c5b5b" />
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6bd60" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#f28482" stop-opacity="0.15" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#background)" />
  <circle cx="1040" cy="80" r="260" fill="url(#glow)" opacity="0.7" />
  <circle cx="1100" cy="570" r="180" fill="#7bdff2" opacity="0.12" />
  <path d="M0 520C220 420 350 590 620 500S1010 400 1200 470V630H0Z" fill="#07151d" opacity="0.62" />
  <text x="96" y="112" fill="#f6bd60" font-family="Arial, 'Noto Sans JP', sans-serif" font-size="28" font-weight="700" letter-spacing="4">MAYABASE</text>
  ${titleMarkup}
  ${escapedSubtitle ? `<text x="96" y="515" class="subtitle">${escapedSubtitle}</text>` : ""}
  <text x="96" y="570" fill="#d9f2f2" font-family="Arial, 'Noto Sans JP', sans-serif" font-size="22">ITで日常をより便利に</text>
  <style>
    .title { fill: #ffffff; font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 68px; font-weight: 700; }
    .subtitle { fill: #d9f2f2; font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 25px; }
  </style>
</svg>`;
}
