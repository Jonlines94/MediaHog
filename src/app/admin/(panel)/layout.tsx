import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { Pig } from "@/components/Pig";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await (await sessionClient()).auth.signOut();
  redirect("/admin/login");
}

const NAV = [
  ["/admin", "Dashboard"], ["/admin/inventory", "Inventory"], ["/admin/import", "CSV import"], ["/admin/flags", "Stock flags"],
  ["/admin/orders", "Orders"], ["/admin/settings", "Settings"],
] as const;

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();   // every page in this group is protected here
  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[14rem_1fr]">
      <aside className="bg-ink px-4 py-5 text-paper md:min-h-screen">
        <div className="flex items-center gap-2"><Pig className="h-9 w-9" /><span className="text-lg font-extrabold">Admin</span></div>
        <nav aria-label="Admin" className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium hover:bg-white/10">{label}</Link>
          ))}
          <Link href="/" className="whitespace-nowrap rounded-sm px-3 py-2 text-sm text-paper/70 hover:bg-white/10">View shop</Link>
        </nav>
        <form action={signOut} className="mt-6 hidden md:block">
          <p className="truncate text-xs text-paper/60">{admin.email}</p>
          <button className="mt-1 text-sm underline underline-offset-4">Sign out</button>
        </form>
      </aside>
      <div className="min-w-0 p-5 md:p-8">{children}</div>
    </div>
  );
}
