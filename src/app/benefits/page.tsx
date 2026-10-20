import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  FolderSimple,
  LinkSimple,
  Eye,
  Queue,
  Compass,
  ClockAfternoon,
  CheckCircle,
  CurrencyDollarSimple,
  FlagBanner,
  SignIn,
  ArrowRight,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Benefits & Features — Vetechno FB Auto Post",
  description:
    "Explore the practical benefits of Vetechno FB Auto Post: centralized draft queues, persistent image hosting, multi-page targeting, and human approval safeguards.",
};

const BENEFITS = [
  {
    icon: FolderSimple,
    title: "Organized Content Repository",
    description:
      "All drafts, captions, hashtags, and images are stored in a centralized database rather than scattered across individual chat logs or desktop folders.",
  },
  {
    icon: LinkSimple,
    title: "Persistent Image Association",
    description:
      "Generated DALL-E images are automatically imported and hosted in Supabase Storage with permanent HTTPS URLs, preventing broken image links at publish time.",
  },
  {
    icon: Eye,
    title: "Full Pre-Publishing Visual Review",
    description:
      "Inspect the exact image, title, formatted caption, and destination Page in your Queue before scheduling or approving. No blind auto-posting.",
  },
  {
    icon: Queue,
    title: "Clear Multi-State Queue",
    description:
      "Track content transparently across distinct states: Unpublished Draft, Scheduled for Later, Successfully Posted, or Cancelled.",
  },
  {
    icon: FlagBanner,
    title: "Multi-Facebook-Page Management",
    description:
      "Manage and target multiple Facebook Pages from a single dashboard. Easily route different topics to distinct Page destinations with dedicated tokens.",
  },
  {
    icon: CurrencyDollarSimple,
    title: "$0 External AI API Cost",
    description:
      "Utilize your existing ChatGPT Plus or Team subscription via the configured Custom GPT. No extra billing for OpenAI, Gemini, or third-party image generation APIs.",
  },
  {
    icon: ClockAfternoon,
    title: "Time-Zone Aware Scheduling",
    description:
      "Schedule approved posts using the built-in Content Calendar. Posts are calculated accurately according to your configured local timezone.",
  },
  {
    icon: ShieldCheck,
    title: "Cryptographic Content Integrity",
    description:
      "Approvals are cryptographically bound to the exact caption, hashtags, image URL, and target Page. Modifying content invalidates stale approvals.",
  },
];

export default function BenefitsPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <span>Practical Advantages</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Built to Make Content Management Simpler
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Discover how Vetechno FB Auto Post eliminates repetitive administrative friction and gives you
            a clean, reliable publishing pipeline.
          </p>
        </div>
      </section>

      {/* Main Benefits Grid */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="rounded-2xl border border-border bg-surface p-6 space-y-3 transition hover:border-primary/40 hover:shadow-xs"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={22} weight="bold" />
                  </div>
                  <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                    {b.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {b.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Workflow Comparison */}
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-6">
            <h2 className="font-heading text-xl font-bold text-foreground text-center">
              Workflow Comparison
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
              <div className="rounded-xl border border-border/70 bg-background p-5 space-y-3">
                <span className="font-bold text-muted-foreground uppercase tracking-wider text-xs">
                  Traditional Manual Approach
                </span>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-destructive font-bold">✕</span>
                    <span>Brainstorming in chat, then copy-pasting captions into text files.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive font-bold">✕</span>
                    <span>Downloading images to local folders and re-uploading to Meta.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive font-bold">✕</span>
                    <span>Accidental duplicate posting when managing multiple Pages.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive font-bold">✕</span>
                    <span>No single queue to track which draft has been scheduled or approved.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                <span className="font-bold text-primary uppercase tracking-wider text-xs">
                  With Vetechno FB Auto Post
                </span>
                <ul className="space-y-2 text-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="text-primary shrink-0 mt-0.5" />
                    <span>Topic requests seamlessly received and drafted by your Custom GPT.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="text-primary shrink-0 mt-0.5" />
                    <span>Images hosted in Supabase Storage with original quality preserved.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="text-primary shrink-0 mt-0.5" />
                    <span>Multi-Page routing to target different feeds from one dashboard.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={16} weight="fill" className="text-primary shrink-0 mt-0.5" />
                    <span>Explicit human review before publication with cryptographic hash binding.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-surface py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 space-y-4">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            Ready to Organize Your Content?
          </h2>
          <p className="text-sm text-muted-foreground">
            Log in to your dashboard to review pending drafts and manage your publishing queue.
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
