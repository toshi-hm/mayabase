import { describe, expect, test } from "bun:test";
import { manifest } from "../src/pages/manifest.json";

const maskableIconPath = `${import.meta.dir}/../public/icons/icon-maskable.svg`;

describe("maskable icon", () => {
  test("manifestにmaskable SVGとany PNGを登録する", async () => {
    const maskableIcons = manifest.icons.filter((icon) =>
      icon.purpose?.split(/\s+/).includes("maskable"),
    );

    expect(maskableIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-maskable.svg", purpose: "maskable" }),
      ]),
    );
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-512.png", purpose: "any" }),
      ]),
    );
  });

  test("SVGは不透明背景と安全領域の縮小配置を持つ", async () => {
    const svg = await Bun.file(maskableIconPath).text();

    expect(svg).toContain("<title>MayaBase</title>");
    expect(svg).toContain('<rect width="64" height="64" fill="#fdfcf9"/>');
    expect(svg).toMatch(/transform="translate\(9\.6 9\.6\) scale\(0\.7\)"/);
  });

  test("background_color/theme_colorはライト/ダークの両方に対応する(#536)", () => {
    for (const field of [manifest.background_color, manifest.theme_color]) {
      expect(field).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ media: "(prefers-color-scheme: light)" }),
          expect.objectContaining({ media: "(prefers-color-scheme: dark)" }),
        ]),
      );
    }
  });
});
