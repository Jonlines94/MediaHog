import { BasketProvider } from "@/components/BasketProvider";
import { Header } from "@/components/Header";
import { Footer, type ShopSettings } from "@/components/Footer";
import { publicDb } from "@/lib/public-db";

async function getShop(): Promise<ShopSettings> {
  try {
    const { data } = await publicDb().from("settings").select("value").eq("key", "shop").maybeSingle();
    return (data?.value as ShopSettings) ?? {};
  } catch { return {}; }
}

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const shop = await getShop();
  return (
    <BasketProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-orange focus:p-3">Skip to content</a>
      <Header />
      <div id="main" className="flex-1">{children}</div>
      <Footer shop={shop} />
    </BasketProvider>
  );
}
