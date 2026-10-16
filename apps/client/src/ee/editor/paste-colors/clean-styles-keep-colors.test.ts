// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepFormattingOnly } from "./clean-styles-keep-colors";

describe("keepFormattingOnly", () => {
  it("translates Word inline styles", () => {
    const out = keepFormattingOnly(
      `<p style='text-align:center;margin:0'><span style='color:#C00000;background:#FFF2CC;font-weight:700;font-style:italic;text-decoration:underline line-through'>x</span></p>` +
        `<table><tr><td style='background:#DDEBF7;width:50px'>c</td></tr></table><span style='color:windowtext'>k</span>`,
    );
    expect(out).toContain("text-align: center");
    expect(out).toContain('data-color="rgb(255, 242, 204)"');
    expect(out).toMatch(/color: rgb\(192, 0, 0\)/);
    for (const t of ["strong", "em", "<u>", "<s>"]) expect(out).toContain(t);
    expect(out).toMatch(/<td style="background-color: rgb\(221, 235, 247\)/);
    expect(out).not.toContain("width");
    expect(out).not.toContain("windowtext");
  });

  it("keeps alignment from attr, style and containers", () => {
    const out = keepFormattingOnly(
      `<p align=right>a</p><p style='text-align:justify'>b</p><p style='text-align:left'>c</p>` +
        `<table><tr><td style='text-align:center'><p>d</p></td></tr></table>`,
    );
    for (const a of ["right", "justify", "left", "center"])
      expect(out).toContain(`text-align: ${a}`);
  });

  it("rebuilds Word lists with nesting, numbering and bullets", () => {
    const li = (lvl: number, m: string, t: string) =>
      `<p class=MsoListParagraph style='margin-left:.5in;mso-list:l0 level${lvl} lfo1'><span style='mso-list:Ignore'>${m}<span>&nbsp;&nbsp;</span></span>${t}</p>`;
    const out = keepFormattingOnly(
      li(1, "1.", "one") + li(2, "a.", "sub") + li(1, "2.", "two") +
        `<p>plain</p>` + li(1, "·", "dot") + li(1, "·", "dot2"),
    );
    expect(out).toMatch(/<ol><li><p[^>]*>one<\/p><ol type="a"><li><p[^>]*>sub<\/p><\/li><\/ol><\/li><li><p[^>]*>two<\/p><\/li><\/ol>/);
    expect(out).toMatch(/<ul><li><p[^>]*>dot<\/p><\/li><li><p[^>]*>dot2<\/p><\/li><\/ul>/);
    expect(out).not.toContain("mso-list");
  });

  it("round-trips the editor's own copied HTML", () => {
    const out = keepFormattingOnly(
      `<p data-pm-slice="1 1 []" style="text-align: center"><span style="color: rgb(224, 49, 49)">r</span></p>` +
        `<table><tbody><tr><td><p style="text-align: right"><span style="color: #00f">c</span></p></td></tr></tbody></table>`,
    );
    expect(out).toContain("text-align: center");
    expect(out).toContain("text-align: right");
    expect(out).toContain("color: rgb(224, 49, 49)");
    expect(out).toContain("color: rgb(0, 0, 255)");
  });
});
