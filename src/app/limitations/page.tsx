import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  WarningCircle,
  Cpu,
  FacebookLogo,
  ShieldCheck,
  CalendarCheck,
  Image as ImageIcon,
  SignIn,
  ArrowRight,
  Info,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Limitations & Important Notice — Vetechno FB Auto Post",
  description:
    "Review important operational boundaries, platform dependencies, and honest limitations of Vetechno FB Auto Post.",
};

const LIMITATIONS = [
  {
    icon: Cpu,
    title: "Interactive ChatGPT Workflow",
    tag: "Operational Requirement",
    description:
      "Content generation happens interactively by opening your configured Custom GPT ('Vetechno FB Auto Post'). The web application does not run an autonomous background bot that generates AI content without your participation. You provide the topic and launch the assistant.",
  },
  {
    icon: FacebookLogo,
    title: "Meta Platform & Permission Dependencies",
    tag: "Third-Party Platform",
    description:
      "Facebook publishing strictly depends on Meta Graph API availability, correct Page role assignments, and valid OAuth tokens. Long-lived user access tokens expire after approximately 60 days, requiring periodic reconnection in Settings.",
  },
  {
    icon: ShieldCheck,
    title: "Mandatory Content Verification",
    tag: "Content Responsibility",
    description:
      "AI-generated text and DALL-E images must be reviewed by the operator before publication. For educational, technical, or financial topics (e.g., investing, DCA, compounding), you must verify factual accuracy, avoid unrealistic claims, and provide appropriate disclaimers.",
  },
  {
    icon: ImageIcon,
    title: "Image Ingestion & Network Availability",
    tag: "File & Storage Limits",
    description:
      "Importing images from ChatGPT into Supabase Storage depends on OpenAI file download links and network connectivity. The platform enforces a maximum file size of 10MB per image and supports standard raster formats (PNG, JPEG, WebP).",
  },
  {
    icon: CalendarCheck,
    title: "Draft vs. Scheduled vs. Published Distinction",
    tag: "Status Semantics",
    description:
      "A post staged by ChatGPT enters the Queue strictly as an 'Unpublished Draft'. Creating a draft does not schedule or publish it. Scheduling requires selecting an upcoming time, and publishing requires explicit operator approval.",
  },
  {
    icon: WarningCircle,
    title: "API Rate Limits & Service Outages",
    tag: "External Constraints",
    description:
      "Publishing operations are subject to Facebook Graph API rate limits. During Meta platform degradation or maintenance windows, publishing attempts may fail safely and will require manual retry.",
  },
];

export default function LimitationsPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Info size={14} weight="bold" />
            <span>Operational Disclosures</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Know What to Expect
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            We believe in honest, transparent software. Here is a clear summary of how Vetechno FB Auto Post
            operates, its platform dependencies, and what requires human oversight.
          </p>
        </div>
      </section>

      {/* Limitations Grid */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LIMITATIONS.map((lim) => {
              const Icon = lim.icon;
              return (
                <div
                  key={lim.title}
                  className="rounded-2xl border border-border bg-surface p-6 space-y-3 transition hover:border-amber-500/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-foreground">
                      <Icon size={20} weight="bold" />
                    </div>
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {lim.tag}
                    </span>
                  </div>

                  <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                    {lim.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {lim.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Educational / Financial Disclaimer Callout */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8 space-y-3">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 font-bold text-sm">
              <WarningCircle size={20} weight="fill" />
              <span>Special Notice Regarding Financial & Regulated Topics</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              If you operate Pages covering investment, stock markets, trading, healthcare, or legal guidance,
              ChatGPT-generated drafts must be carefully reviewed for regulatory compliance and factual accuracy.
              Vetechno FB Auto Post provides the technical pipeline for staging and publishing, but the registered
              Page administrator retains 100% legal responsibility for all published content.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-surface py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 space-y-4">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            Clear, Controlled Publishing
          </h2>
          <p className="text-sm text-muted-foreground">
            Log in to your workspace to manage your queue with full visibility and control.
          </p>
          <div className="pt-2 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover transition"
            >
              <SignIn size={16} weight="bold" />
              <span>Login to Dashboard</span>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
