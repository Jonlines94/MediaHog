import { Policy } from "@/components/Policy";
export const metadata = { title: "Privacy policy" };
export default function Privacy() {
  return (
    <Policy title="Privacy policy">
      <p>We collect only what we need to take and deliver your order: your name, email address, delivery address and optional phone number.</p>
      <h2>How we use it</h2>
      <ul><li>To process payment, through Stripe, who handle your card details. We never see or store them.</li><li>To pack, post and track your order, and to email your confirmation and dispatch details.</li><li>To keep the records that tax and accounting law require.</li></ul>
      <h2>Who sees it</h2>
      <p>Stripe (payments), our email provider, our database host, and the carrier delivering your parcel. We don&apos;t sell your data or use it for advertising.</p>
      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete the data we hold about you, subject to records we must keep by law. Contact us using the details in the footer.</p>
    </Policy>
  );
}
