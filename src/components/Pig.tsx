/** The MediaHog mascot: a pig's face wearing headphones. Original artwork. */
export function Pig({ face = "#fbf8f2", accent = "#ff5a00", ink = "#000000", className, title }: {
  face?: string; accent?: string; ink?: string; className?: string; title?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {/* floppy ears tucked under the headphone band */}
      <path d="M17 25 Q12 11 25 12 Q32 14 31 22 Z" fill={face} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M47 25 Q52 11 39 12 Q32 14 33 22 Z" fill={face} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
      {/* head */}
      <ellipse cx="32" cy="37" rx="21" ry="19" fill={face} stroke={ink} strokeWidth="1.6" />
      {/* headphone band and cups */}
      <path d="M9.5 35 C9.5 4, 54.5 4, 54.5 35" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" />
      <rect x="4" y="29" width="10" height="17" rx="5" fill={accent} stroke={ink} strokeWidth="1.6" />
      <rect x="50" y="29" width="10" height="17" rx="5" fill={accent} stroke={ink} strokeWidth="1.6" />
      {/* face */}
      <circle cx="23.5" cy="32" r="2.4" fill={ink} />
      <circle cx="40.5" cy="32" r="2.4" fill={ink} />
      <ellipse cx="32" cy="44" rx="11.5" ry="8" fill={accent} stroke={ink} strokeWidth="1.6" />
      <ellipse cx="27.8" cy="44" rx="1.9" ry="3" fill={ink} />
      <ellipse cx="36.2" cy="44" rx="1.9" ry="3" fill={ink} />
    </svg>
  );
}
