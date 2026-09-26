import type { Tier } from "@/lib/types";

type P = { size?: number; className?: string };
const base = (size = 14) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const LockIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const TargetIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

export const WavesIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 9c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
    <path d="M3 15c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
  </svg>
);

export const CheckIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const ArrowIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const LookBackIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const SyncIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5" />
    <path d="M5 3v4h4M19 21v-4h-4" />
  </svg>
);

export function TierIcon({ tier, size, className }: P & { tier: Tier }) {
  if (tier === "core") return <LockIcon size={size} className={className} />;
  if (tier === "goal") return <TargetIcon size={size} className={className} />;
  return <WavesIcon size={size} className={className} />;
}

/** Brand mark: three rings, one per memory tier. */
export function TempoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--tempo-core)" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--tempo-goal)" strokeWidth="2.2" strokeDasharray="44 16" strokeLinecap="round" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="var(--tempo-coral)" strokeWidth="2.2" strokeDasharray="16 16" strokeLinecap="round" />
    </svg>
  );
}
