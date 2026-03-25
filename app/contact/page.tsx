import { MobileBackButton } from "@/components/navigation/MobileBackButton";
import { ContactForm } from "@/components/contact/ContactForm";

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <MobileBackButton fallbackHref="/" className="mb-4" />

      <section className="mb-5 rounded-3xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Support and inquiries</p>
            <p className="mt-1 text-sm text-slate-600">Questions, listing updates, and partnership requests for Poopin.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            hello@poopinapp.com
          </span>
        </div>
      </section>
      <ContactForm />
    </main>
  );
}
