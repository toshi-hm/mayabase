import { describe, expect, test } from "bun:test";

const manifestPath = `${import.meta.dir}/../public/manifest.json`;
const maskableIconPath = `${import.meta.dir}/../public/icons/icon-maskable.svg`;

describe("maskable icon", () => {
  test("manifestにSVGとPNGのmaskableアイコンを登録する", async () => {
    const manifest = JSON.parse(await Bun.file(manifestPath).text()) as {
      icons?: Array<{ src?: string; purpose?: string; sizes?: string }>;
    };
    const maskableIcons = (manifest.icons ?? []).filter((icon) =>
      icon.purpose?.split(/\s+/).includes("maskable"),
    );

    expect(maskableIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-maskable.svg", purpose: "maskable" }),
        expect.objectContaining({ src: "/icons/icon-512.png", purpose: "any maskable" }),
      ]),
    );
  });

  test("SVGは不透明背景と安全領域の縮小配置を持つ", async () => {
    const svg = await Bun.file(maskableIconPath).text();

    expect(svg).toContain('<title>MayaBase</title>');
    expect(svg).toContain('<rect width="64" height="64" fill="#fdfcf9"/>');
    expect(svg).toMatch(/transform="translate\(9\.6 9\.6\) scale\(0\.7\)"/);
  });
});
