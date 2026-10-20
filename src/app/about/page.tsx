import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  Target,
  Users,
  LightbulbFilament,
  ShieldCheck,
  SignIn,
  ArrowRight,
  FlagBanner,
  Sparkle,
  Queue,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "About Us — Vetechno FB Auto Post",
  description:
    "Learn about Vetechno FB Auto Post, our mission to simplify social media content creation with ChatGPT, and our human-in-the-loop publishing philosophy.",
};

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* Hero Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <span>About The Product</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Built to Bridge Ideas and Publishing
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Vetechno FB Auto Post was designed to solve a practical problem: turning creative AI ideas into organized, reviewed, and published Facebook Page posts without manual chaos.
          </p>
        </div>
      </section>

      {/* Core Mission & Problem */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Target size={22} weight="bold" />
              </div>
              <h2 className="font-heading text-xl font-bold text-foreground">Our Core Mission</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vetechno FB Auto Post helps you organize your social media content workflow by connecting your
                ChatGPT-assisted content creation process with a centralized dashboard for image-hosted drafts
                and supported Facebook publishing operations.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Prepare a content request in the application, process it through your configured Custom GPT,
                and send the completed post back into your dashboard for review. Once the image and caption
                are verified, you can use the supported application workflow to manage publication.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <LightbulbFilament size={22} weight="bold" />
              </div>
              <h2 className="font-heading text-xl font-bold text-foreground">The Problem We Solve</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Creating social media content with conversational AI often involves copy-pasting text,
                downloading images to desktop folders, re-uploading them to Meta Business Suite, and losing
                track of which draft targets which Page.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vetechno FB Auto Post creates a direct bridge: your Custom GPT stages drafts, hosts images,
                and routes them directly to your application Queue for review and scheduling.
              </p>
            </div>
          </div>

          {/* Who It Is Built For */}
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h2 className="font-heading text-2xl font-bold text-foreground">Who Uses Vetechno FB Auto Post?</h2>
              <p className="text-sm text-muted-foreground">
                Tailored for creators and managers who value consistency, clarity, and control.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <div className="text-primary font-bold text-sm">Small Business Owners</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keep company Facebook Pages active with educational and engaging updates without spending hours formatting posts.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <div className="text-primary font-bold text-sm">Content Creators</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Brainstorm topics with ChatGPT, generate thematic visual concepts, and review ready drafts in a visual Queue.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <div className="text-primary font-bold text-sm">Digital Marketers</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Maintain brand consistency, coordinate hashtag strategies, and manage scheduled releases across multiple Pages.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <div className="text-primary font-bold text-sm">Facebook Page Managers</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Oversee multiple Page destinations from one dashboard with separate, verified publishing tokens.
                </p>
              </div>
            </div>
          </div>

          {/* Human in the loop commitment */}
          <div className="rounded-2xl border border-border bg-surface-2/40 p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={28} className="text-emerald-500 shrink-0" />
              <div>
                <h3 className="font-heading text-lg font-bold text-foreground">
                  Our Human-in-the-Loop Philosophy
                </h3>
                <p className="text-xs text-muted-foreground">
                  Why we intentionally avoid blind, unreviewed automatic posting.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We do not believe in autonomous bots that write and blast unvetted AI content to social media.
              Every post staged through Vetechno FB Auto Post enters your dashboard as an unapproved draft.
              You inspect the caption, verify image appropriateness, and explicitly schedule or approve publication.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-surface py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 space-y-4">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            Access Your Workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign in to your application dashboard to review drafts, manage pages, or prepare new requests.
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
