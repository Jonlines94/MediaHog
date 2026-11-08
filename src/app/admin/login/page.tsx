import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/server";
import { Pig } from "@/components/Pig";

export const metadata = { title: "Admin sign in", robots: { index: false } };

async function signIn(formData: FormData) {
  "use server";
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect("/admin/login?error=invalid");
  redirect("/admin");
}

export default async function Login({ searchParams }: PageProps<"/admin/login">) {
  const { error } = await searchParams;
  const message = error === "invalid" ? "That email and password don't match. Try again."
    : error === "not-admin" ? "This account doesn't have admin access." : null;
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <form action={signIn} className="w-full max-w-sm rounded-sm bg-paper p-8">
        <Pig className="mb-4 h-14 w-14" />
        <h1 className="text-2xl font-extrabold tracking-tight">MediaHog admin</h1>
        {message && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3 text-sm">{message}</p>}
        <label className="mt-6 block text-sm font-medium" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="mt-1 w-full border border-line bg-white px-3 py-2.5" />
        <label className="mt-4 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="mt-1 w-full border border-line bg-white px-3 py-2.5" />
        <button className="mt-6 w-full bg-orange px-4 py-3 font-bold text-ink hover:bg-orange-dark">Sign in</button>
      </form>
    </main>
  );
}
