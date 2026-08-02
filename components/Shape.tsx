import type { Axes } from "@/lib/types";
import { SHAPE_SIZE, seedFrom, shapeColors, shapePath } from "@/lib/shape";

/**
 * 顔写真の代わり。診断結果から決定的に生成される。
 * ユーザーが選ぶことも、差し替えることもできない。
 */
export function Shape({
  axes,
  seedKey = "",
  size = 56,
  className = "",
}: {
  axes: Axes | null;
  seedKey?: string;
  size?: number;
  className?: string;
}) {
  if (!axes) {
    return (
      <div
        className={`shrink-0 rounded-full border border-dashed border-[var(--color-line)] ${className}`}
        style={{ width: size, height: size }}
        aria-label="診断がまだ"
      />
    );
  }

  const seed = seedFrom(seedKey);
  const { from, to } = shapeColors(axes);
  const gradientId = `g-${seedKey || "x"}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SHAPE_SIZE} ${SHAPE_SIZE}`}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="この人のかたち"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path d={shapePath(axes, seed)} fill={`url(#${gradientId})`} />
    </svg>
  );
}
