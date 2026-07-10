import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MapPin, Instagram, Palette } from "lucide-react";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Link } from "wouter";
import { Eyebrow } from "@/components/editorial";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().max(200, "Subject is too long").optional(),
  message: z.string().min(1, "Message is required").max(1000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const EMAIL = "animuradyan.artist@gmail.com";
const inputClass =
  "w-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-500 rounded-none";

export default function ContactPage() {
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Contact Ani Muradyan | Commissions & Inquiries";
    updateCanonicalUrl("/contact");
    updateMetaDescription(
      "Contact Armenian contemporary artist Ani Muradyan for artwork inquiries, commissions, and collaborations. Based in Yerevan, Armenia."
    );
  }, []);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  const contactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => apiRequest("POST", "/api/contact", data),
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "Thank you for reaching out — I'll get back to you soon.",
      });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Couldn't send the message",
        description: `Please try again, or email me directly at ${EMAIL}.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => contactMutation.mutate(data);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Header ─────────────────────────────────────────── */}
      <section className="px-6 pt-20 md:pt-28 pb-8 text-center">
        <Eyebrow>Get in Touch</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Let's Connect</h1>
        <p className="mx-auto max-w-xl text-sm md:text-base text-stone-600">
          For artwork inquiries, commissions, or collaborations — I'd love to hear from you.
        </p>
      </section>

      {/* ── Form + details ─────────────────────────────────── */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Form */}
          <div>
            <Eyebrow>Send a Message</Eyebrow>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                          Name
                        </FormLabel>
                        <FormControl>
                          <input placeholder="Your name" {...field} className={inputClass} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                          Email
                        </FormLabel>
                        <FormControl>
                          <input placeholder="you@example.com" {...field} className={inputClass} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                        Subject <span className="normal-case tracking-normal text-stone-400">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <input placeholder="What's this about?" {...field} className={inputClass} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                        Message
                      </FormLabel>
                      <FormControl>
                        <textarea
                          rows={6}
                          placeholder="Tell me more about your inquiry…"
                          {...field}
                          className={`${inputClass} resize-none`}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <button
                  type="submit"
                  disabled={contactMutation.isPending}
                  className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 disabled:opacity-60 transition-opacity"
                  style={{ backgroundColor: "#26221c" }}
                >
                  {contactMutation.isPending ? "Sending…" : "Send Message"}
                </button>
              </form>
            </Form>
          </div>

          {/* Details */}
          <div className="space-y-12">
            <div>
              <Eyebrow>Reach Out Directly</Eyebrow>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                  <div>
                    <p className="text-[11px] tracking-[0.2em] uppercase text-stone-400">Email</p>
                    <a
                      href={`mailto:${EMAIL}`}
                      className="text-sm text-stone-800 border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors"
                    >
                      {EMAIL}
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                  <div>
                    <p className="text-[11px] tracking-[0.2em] uppercase text-stone-400">Location</p>
                    <p className="text-sm text-stone-800">Yerevan, Armenia</p>
                  </div>
                </li>
              </ul>
            </div>

            <div>
              <Eyebrow>Follow the Work</Eyebrow>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://www.instagram.com/animoria.art/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 text-sm text-stone-700 hover:text-stone-900 transition-colors"
                  >
                    <Instagram className="h-4 w-4 text-stone-500 group-hover:text-stone-800" />
                    <span className="border-b border-transparent group-hover:border-stone-800">
                      Instagram · @animoria.art
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.saatchiart.com/account/profile/1980379"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 text-sm text-stone-700 hover:text-stone-900 transition-colors"
                  >
                    <Palette className="h-4 w-4 text-stone-500 group-hover:text-stone-800" />
                    <span className="border-b border-transparent group-hover:border-stone-800">
                      Saatchi Art · Shop originals
                    </span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.singulart.com/en/artist/ani-muradyan-62448"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 text-sm text-stone-700 hover:text-stone-900 transition-colors"
                  >
                    <Palette className="h-4 w-4 text-stone-500 group-hover:text-stone-800" />
                    <span className="border-b border-transparent group-hover:border-stone-800">
                      Singulart · Verified artist
                    </span>
                  </a>
                </li>
              </ul>
            </div>

            <div className="border-t border-stone-300 pt-8">
              <Eyebrow>Commissions</Eyebrow>
              <p className="max-w-sm text-sm leading-relaxed text-stone-600">
                I accept a limited number of commissions each year — custom sizes, a 4–8 week
                completion window, and progress updates along the way. Reach out to discuss your
                vision and timeline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing note ───────────────────────────────────── */}
      <section className="px-6 pb-24 text-center">
        <p className="text-sm text-stone-500">
          Browse the{" "}
          <Link
            href="/artworks"
            className="border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors"
          >
            original paintings
          </Link>{" "}
          or visit the{" "}
          <Link
            href="/gallery"
            className="border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors"
          >
            exhibition gallery
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
