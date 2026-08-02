import type { Axes } from "./types";
import { AXIS_IDS } from "./types";

/**
 * 顔写真の代わりになるもの。
 *
 * 診断の6軸から決定的に図形を生成する。同じ診断結果なら必ず同じ形になり、
 * ユーザーが差し替えることはできない。「盛る」余地をなくすのが目的。
 */

const SIZE = 120;
const CENTER = SIZE / 2;
const MIN_R = 22;
const MAX_R = 54;

export function radii(axes: Axes): number[] {
  return AXIS_IDS.map((id) => MIN_R + (axes[id] / 100) * (MAX_R - MIN_R));
}

/** 文字列から安定した 0..1 の値を作る（回転のばらつき用）。 */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * 6頂点を Catmull-Rom 風に滑らかに閉じたパスにする。
 * 角張った多角形だとレーダーチャートに見えてしまい、
 * 「診断結果の可視化」ではなく「その人の形」に見せたいので丸める。
 */
export function shapePath(axes: Axes, seed = 0): string {
  const r = radii(axes);
  const n = r.length;
  const rot = seed * Math.PI * 2;

  const pts = r.map((radius, i) => {
    const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
    return [CENTER + Math.cos(a) * radius, CENTER + Math.sin(a) * radius] as const;
  });

  // 各辺の中点を通し、頂点を制御点にすると閉じた滑らかな輪郭になる
  const mid = (i: number) => {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
  };

  const start = mid(n - 1);
  let d = `M ${start[0].toFixed(2)} ${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const m = mid(i);
    d += ` Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)}`;
  }
  return d + " Z";
}

/**
 * 色。軸の組み合わせから色相を決める。
 * 彩度と明度は固定して、どの形も同じ「格」に見えるようにする
 * （派手な色を選べる仕組みにすると、それが優劣になってしまう）。
 */
export function shapeColors(axes: Axes): { from: string; to: string } {
  const hue = Math.round(
    (axes.novelty * 1.4 + axes.pace * 0.9 + axes.expression * 0.7) % 360,
  );
  const second = (hue + 40) % 360;
  return {
    from: `oklch(0.78 0.13 ${hue})`,
    to: `oklch(0.68 0.15 ${second})`,
  };
}

export const SHAPE_SIZE = SIZE;
