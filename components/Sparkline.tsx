export default function Sparkline({
  values,
  width = 72,
  height = 22,
  color = "var(--tempo-sage)",
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => (v == null ? null : [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const))
    .filter((p): p is readonly [number, number] => p != null);
  const last = pts.at(-1)!;
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--tempo-coral)" />
    </svg>
  );
}
