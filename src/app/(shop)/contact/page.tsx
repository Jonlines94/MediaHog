import { Policy } from "@/components/Policy";
import { publicDb } from "@/lib/public-db";

export const metadata = { title: "Contact" };
export const revalidate = 600;

export default async function Contact() {
  const { data } = await publicDb().from("settings").select("value").eq("key", "shop").maybeSingle();
  const s = (data?.value ?? {}) as { contact_email?: string; contact_phone?: string; address?: string };
  return (
    <Policy title="Contact">
      <p>Questions about a record, an order or delivery? Get in touch and we&apos;ll reply as soon as we can.</p>
      <address className="not-italic">
        {s.contact_email && <p>Email: <a className="underline underline-offset-4" href={`mailto:${s.contact_email}`}>{s.contact_email}</a></p>}
        {s.contact_phone && <p>Phone: {s.contact_phone}</p>}
        {s.address && <p className="whitespace-pre-line">{s.address}</p>}
      </address>
    </Policy>
  );
}
