import Image from "next/image";
import { Pig } from "./Pig";

/** Square cover with a record peeking out. Shows the MediaHog placeholder when there is no artwork. */
export function Sleeve({ src, alt, sizes = "(min-width:1024px) 20vw, 45vw", priority = false }: {
  src?: string | null; alt: string; sizes?: string; priority?: boolean;
}) {
  return (
    <div className="sleeve relative aspect-square">
      <div className="disc absolute inset-[3%] z-0 rounded-full bg-ink" aria-hidden>
        <div className="absolute inset-[8%] rounded-full border border-white/10" />
        <div className="absolute inset-[18%] rounded-full border border-white/10" />
        <div className="absolute inset-[34%] rounded-full bg-orange" />
        <div className="absolute inset-[48%] rounded-full bg-ink" />
      </div>
      <div className="relative z-10 h-full w-full overflow-hidden bg-groove shadow-[0_1px_0_rgba(0,0,0,.08),0_10px_24px_-14px_rgba(0,0,0,.55)]">
        {src ? (
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" role="img" aria-label={`${alt} (cover not photographed yet)`}>
            <div className="relative aspect-square w-[70%] rounded-full bg-ink ring-1 ring-white/10">
              <div className="absolute inset-[10%] rounded-full border border-white/10" />
              <div className="absolute inset-[22%] rounded-full border border-white/10" />
              <div className="absolute inset-[30%] flex items-center justify-center rounded-full bg-orange">
                <Pig className="h-[88%] w-[88%]" face="#fbf8f2" accent="#000000" ink="#000000" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
