import type { APIRoute } from "astro";

/** robots.txt(sitemap の URL は astro.config.mjs の site 設定から生成) */
export const GET: APIRoute = ({ site }) => {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("sitemap-index.xml", site)}
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
