import { useState, type FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { Eyebrow } from "@/components/editorial";

/**
 * The ONE collector-list capture in the app. Posts an email (+ its `source`) to the real
 * owned list at POST /api/collectors, so signups from every surface land in one place and
 * each is attributable to where it converted. Reused wherever collector intent appears:
 *   - homepage (browsing audience)      → variant="section", source="homepage"
 *   - artwork detail (highest intent)   → variant="compact", source="artwork"
 * Elegant + inline by design — no modals or exit-intent (they'd cheapen a fine-art brand).
 */
type Variant = "section" | "compact";

interface CollectorSignupProps {
  /** Where this instance lives — stored with the signup for per-surface measurement. */
  source: string;
  variant?: Variant;
  /** Contextual copy (e.g. on an artwork page); falls back to the collector-list default. */
  heading?: string;
  description?: string;
}

export default function CollectorSignup({ source, variant = "section", heading, description }: CollectorSignupProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setJoining(true);
    try {
      const res = await fetch("/api/collectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      // An already-subscribed email is NOT an error — the API is idempotent and returns 201 with the
      // existing record, so a duplicate lands in the success state below, never a scary message.
      if (!res.ok) {
        // Surface the reason instead of a blanket "something went wrong": a bad address is a 400 with
        // a clear message the visitor can act on; anything else is a genuine server problem to retry.
        if (res.status === 400) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          toast({
            title: "Check your email address",
            description: body?.message ?? "Please enter a valid email address.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Something went wrong",
            description: "We couldn't add you just now. Please try again in a moment, or email animuradyan.artist@gmail.com directly.",
            variant: "destructive",
          });
        }
        return; // do not show the success state, and do not swallow the failure
      }
      setJoined(true);
      setEmail("");
      // Make the signup measurable per surface — GA4 is live on the site (G-J1RN8P4KHY),
      // so Career OS (which reads GA4) can compare homepage vs artwork conversion.
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "collector_signup", { signup_source: source });
      toast({
        title: "Welcome to the collector list",
        description: "You'll receive new paintings and studio updates before public release.",
      });
    } catch {
      // Network-level failure (offline, DNS, request aborted) — reachable neither as ok nor as a
      // status. Report it plainly rather than swallowing it.
      toast({
        title: "Network problem",
        description: "We couldn't reach the server. Please try again, or email animuradyan.artist@gmail.com directly.",
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  const form = (
    <form onSubmit={join} className="mx-auto flex max-w-md flex-col sm:flex-row gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        aria-label="Email address"
        className="flex-1 border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-500"
      />
      <button
        type="submit"
        disabled={joining}
        className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 disabled:opacity-60 transition-colors"
        style={{ backgroundColor: "#26221c" }}
      >
        {joining ? "Joining…" : "Join the List"}
      </button>
    </form>
  );

  // Consent/expectation microcopy for marketing-email collection — sets what they'll
  // receive and that they can leave. Actual unsubscribe is handled by the email tool
  // Ani sends from (every send carries a one-click unsubscribe).
  const consent = (
    <p className="mx-auto mt-3 max-w-md text-[11px] leading-relaxed text-stone-400">
      You'll only hear about new work and the occasional studio note — never spam. Unsubscribe any time.
    </p>
  );
  const formWithConsent = (
    <>
      {form}
      {consent}
    </>
  );

  const confirmation = (
    <p className="mx-auto max-w-md text-sm text-stone-600">
      You're on the list — you'll hear from Ani before the next release.
    </p>
  );

  if (variant === "compact") {
    return (
      <section className="border-t border-stone-200 mt-14 pt-12 text-center">
        <Eyebrow>First Access</Eyebrow>
        <h3 className="font-playfair text-2xl md:text-3xl text-stone-900 mt-2 mb-3">
          {heading ?? "First choice on new originals"}
        </h3>
        <p className="mx-auto max-w-md text-sm text-stone-600 mb-6">
          {description ?? "Every original is one of a kind. Join the collector list to see new work first — and be first to acquire it — before it's shown publicly."}
        </p>
        {joined ? confirmation : formWithConsent}
      </section>
    );
  }

  return (
    <section className="bg-[#ece7dc] py-20 md:py-28 px-6 text-center">
      <Eyebrow>Private Previews</Eyebrow>
      <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
        {heading ?? "Join the Collector List"}
      </h2>
      <p className="mx-auto max-w-md text-sm text-stone-600 mb-8">
        {description ?? "Each painting is a one-of-a-kind original — only one collector can own it. Join the list to see new work first and have the first chance to acquire it, before it's shown publicly. Plus the occasional note from the studio."}
      </p>
      {joined ? confirmation : form}
    </section>
  );
}
