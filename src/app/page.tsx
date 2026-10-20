import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import { DashboardPreviewSection } from "@/components/public/dashboard-preview-section";
import {
  Sparkle,
  Image as ImageIcon,
  Queue,
  PaperPlaneTilt,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  CalendarCheck,
  FlagBanner,
  Info,
  SignIn,
  Lightning,
  LockKey,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Vetechno FB Auto Post — AI-Assisted Social Media Content & Facebook Publishing",
  description:
    "Turn your ideas into engaging social media posts with ChatGPT. Prepare captions and images, review drafts in a centralized queue, and manage Facebook publishing with confidence.",
};

export default function HomePage() {
  return (
    <MarketingShell>
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28">
        {/* Soft atmospheric ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[36rem] w-[50rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{
            background: "radial-gradient(circle, var(--color-primary), rgba(24, 119, 242, 0.15) 50%, transparent 80%)",
          }}
        />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>Multi-Page Facebook Publishing Management</span>
            </div>

            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.12]">
              Create Better Social Media Posts.{" "}
              <span className="text-primary">Manage Publishing with Confidence.</span>
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              Vetechno FB Auto Post helps you organize your social media content workflow by connecting your
              ChatGPT-assisted content creation process with a centralized dashboard for image-hosted drafts
              and supported Facebook publishing operations.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SignIn size={18} weight="bold" />
                <span>Login to Your Dashboard</span>
              </Link>
              <Link
                href="/how-it-works"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-foreground shadow-xs transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span>See How It Works</span>
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>

            <p className="text-xs text-muted-foreground pt-1">
              Supports ChatGPT Custom GPT integration · Human review before publishing · No third-party AI keys required
            </p>
          </div>
        </div>
      </section>

      {/* 2. DASHBOARD PREVIEW SECTION (Overview & Content Calendar) */}
      <DashboardPreviewSection />

      {/* 2. PRODUCT VALUE PROPOSITION */}
      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Core Capabilities</span>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              Your Social Media Workflow, Organized
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              From content idea to published post, keep your social media workflow organized, visual,
              and completely under your control with human verification safeguards.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1 */}
            <div className="rounded-2xl border border-border bg-background p-6 space-y-4 hover:border-primary/40 transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkle size={24} weight="bold" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                AI-Assisted Content Creation
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Prepare content requests in the application and let the configured ChatGPT Custom GPT write
                topic-aligned captions and generate accompanying DALL-E images in conversation.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-border bg-background p-6 space-y-4 hover:border-primary/40 transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ImageIcon size={24} weight="bold" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Image-Aware Draft Creation
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Images generated in ChatGPT are imported through dedicated Actions directly into Supabase
                Storage, ensuring original image bytes and permanent URLs are linked to your draft.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-border bg-background p-6 space-y-4 hover:border-primary/40 transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Queue size={24} weight="bold" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Content Queue & Review
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Inspect drafts in a unified Queue. Review titles, captions, hashtags, and target Facebook
                Pages with cryptographic content-hash verification before anything is published.
              </p>
            </div>

            {/* Card 4 */}
            <div className="rounded-2xl border border-border bg-background p-6 space-y-4 hover:border-primary/40 transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PaperPlaneTilt size={24} weight="bold" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Publishing Management
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Publish directly to your connected Facebook Page or schedule posts using the built-in Content
                Calendar. Supports multi-page management with explicit per-page tokens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW THE WORKFLOW WORKS (5-STEP SEQUENCE) */}
      <section className="py-16 sm:py-24 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Transparent Process</span>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              How the Content Workflow Works
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Prepare a content request in the application, process it through your configured Custom GPT, and send the completed post back into your dashboard for review. Once the image and caption are verified, you can use the supported application workflow to manage publication.
            </p>
          </div>

          <div className="mt-12 relative">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              {/* Step 1 */}
              <div className="relative rounded-2xl border border-border bg-surface p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">In Dashboard</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">Enter Your Idea</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Prepare a topic, audience, and destination Facebook Page in the Generate section of your dashboard.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-primary font-medium flex items-center gap-1">
                  <span>Creates Content Request</span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative rounded-2xl border border-border bg-surface p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">In Custom GPT</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">Create with ChatGPT</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Open your configured Custom GPT. It retrieves your request, writes the caption, and renders an image with DALL-E.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-primary font-medium flex items-center gap-1">
                  <span>No external API billing</span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative rounded-2xl border border-border bg-surface p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">Via Actions API</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">Send to Application</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    The GPT executes <code className="text-primary text-[11px]">importChatGPTImage</code> to host the image and stages an unpublished draft.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-primary font-medium flex items-center gap-1">
                  <span>Preserves original image</span>
                </div>
              </div>

              {/* Step 4 */}
              <div className="relative rounded-2xl border border-border bg-surface p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      4
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">In Dashboard Queue</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">Review Your Draft</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Inspect the post preview, caption, hashtags, and destination Page in your Queue before any publishing occurs.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <ShieldCheck size={14} />
                  <span>Human confirmation</span>
                </div>
              </div>

              {/* Step 5 */}
              <div className="relative rounded-2xl border border-border bg-surface p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      5
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">To Facebook</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">Schedule or Publish</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Publish instantly with a single click or schedule for an upcoming time slot via the Content Calendar.
                  </p>
                </div>
                <div className="pt-2 text-[11px] text-primary font-medium flex items-center gap-1">
                  <span>Canonical Facebook link</span>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <span>Read detailed architecture and workflow guide</span>
                <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PRACTICAL BENEFITS */}
      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Practical Advantages</span>
              <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                Built to Make Content Management Simpler
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vetechno FB Auto Post is engineered to streamline the daily friction between writing content
                and keeping an active, visual Facebook presence.
              </p>
              <div className="pt-2">
                <Link
                  href="/benefits"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover transition"
                >
                  <span>Explore All Benefits</span>
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0" />
                  <span>Centralized Post Queue</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keep all pending, scheduled, and published posts visible in one place rather than scattered across chats.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0" />
                  <span>Persistent Image Association</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Captions, hashtags, and images stay linked together with verified storage URLs to avoid lost assets.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0" />
                  <span>Multiple Page Destinations</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Target distinct Pages from a single account without having to log in and out of different Meta profiles.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                  <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0" />
                  <span>Human Review Safeguards</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every post enters as an unpublished draft. No automatic publishing occurs without explicit review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. PREREQUISITES & LIMITATIONS DUAL OVERVIEW */}
      <section className="py-16 sm:py-24 bg-background border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Prerequisites Preview */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LockKey size={20} weight="bold" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">What You'll Need</h3>
                  <p className="text-xs text-muted-foreground">Prerequisites to operate the platform</p>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>An authorized admin login to the application dashboard.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Facebook Page admin or task access for the destination Pages.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>ChatGPT Plus or Team subscription to access Custom GPTs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Configured Custom GPT Actions with your Integration API key.</span>
                </li>
              </ul>

              <div className="pt-2">
                <Link
                  href="/requirements"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>View comprehensive prerequisites guide</span>
                  <ArrowRight size={13} weight="bold" />
                </Link>
              </div>
            </div>

            {/* Limitations Preview */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Info size={20} weight="bold" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">Know What to Expect</h3>
                  <p className="text-xs text-muted-foreground">Important operating boundaries</p>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>ChatGPT generation requires opening the configured Custom GPT assistant.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>Facebook publishing depends on Meta API permissions and availability.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>Content should always be reviewed before publication, especially financial topics.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>Draft creation is not publication—posts require scheduling or manual publish.</span>
                </li>
              </ul>

              <div className="pt-2">
                <Link
                  href="/limitations"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>Read full operational disclosures</span>
                  <ArrowRight size={13} weight="bold" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FINAL CALL TO ACTION */}
      <section className="relative overflow-hidden border-t border-border bg-gradient-to-b from-surface via-surface-2/40 to-background py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8 space-y-5">
          <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ready to Manage Your Content Workflow?
          </h2>
          <p className="mx-auto max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Log in to access your existing dashboard and manage your social media content, draft queue,
            and connected Facebook Pages from one centralized place.
          </p>
          <div className="pt-3 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <SignIn size={18} weight="bold" />
              <span>Login to Your Dashboard</span>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
