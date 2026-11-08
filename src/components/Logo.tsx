import Link from "next/link";
import { Pig } from "./Pig";

export function Logo({ onDark = true }: { onDark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="MediaHog home">
      <Pig className="h-10 w-10 shrink-0" face={onDark ? "#fbf8f2" : "#fbf8f2"} />
      <span className={`text-[1.7rem] font-extrabold leading-none tracking-tight ${onDark ? "text-paper" : "text-ink"}`}
            style={{ fontVariationSettings: '"wdth" 90' }}>
        MediaHog
      </span>
    </Link>
  );
}
