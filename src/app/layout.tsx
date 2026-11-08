import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://mediahog.co.uk"),
  title: { default: "MediaHog | Vinyl. Music. Obsession.", template: "%s | MediaHog" },
  description: "An independent record shop. Thousands of vinyl records, graded honestly and shipped from the UK.",
};
export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
