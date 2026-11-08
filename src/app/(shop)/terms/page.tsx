import { Policy } from "@/components/Policy";
export const metadata = { title: "Terms of sale" };
export default function Terms() {
  return (
    <Policy title="Terms of sale">
      <p>Each record is a single, second-hand or new item, described as accurately as we can. Prices are in pounds sterling.</p>
      <h2>Your order</h2>
      <p>An order is accepted when payment is confirmed and you receive our confirmation email. Because we also sell on other marketplaces, we hold each record for you for 30 minutes while you pay. In the rare event that a record can&apos;t be supplied, we&apos;ll tell you and refund you in full.</p>
      <h2>Delivery and returns</h2>
      <p>See our delivery and returns pages for charges, timings and your cancellation rights.</p>
    </Policy>
  );
}
