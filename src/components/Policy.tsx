export function Policy({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="notes mt-6 space-y-4 text-lg [&_h2]:mt-8 [&_h2]:font-sans [&_h2]:text-2xl [&_h2]:font-extrabold [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
    </main>
  );
}
