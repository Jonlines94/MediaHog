import { Policy } from "@/components/Policy";
export const metadata = { title: "Returns and refunds" };
export default function Returns() {
  return (
    <Policy title="Returns and refunds">
      <p>Every record is graded honestly and described in its listing. If something isn&apos;t as described, contact us and we&apos;ll put it right with a refund.</p>
      <h2>Changing your mind</h2>
      <p>If you&apos;re in the UK or EU you can cancel an order within 14 days of receiving it, under consumer contract law. Tell us you want to cancel, then send the record back within 14 days of telling us, in the condition you received it. Refunds go back to your original payment method.</p>
      <h2>Damaged in the post</h2>
      <p>Tell us within 7 days of delivery and include a photo of the packaging and the record.</p>
      <p>Contact details are in the page footer.</p>
    </Policy>
  );
}
