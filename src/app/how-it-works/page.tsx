import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  SignIn,
  Sparkle,
  Image as ImageIcon,
  Queue,
  CalendarCheck,
  ShieldCheck,
  ArrowRight,
  ArrowsLeftRight,
  CheckCircle,
  Database,
  CloudArrowUp,
  Cpu,
  LockKey,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "How It Works — Vetechno FB Auto Post",
  description:
    "Explore the step-by-step workflow of Vetechno FB Auto Post, from ChatGPT content drafting to human review and Facebook publishing.",
};

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Log in & Connect Facebook",
    actor: "User Action in Dashboard",
    description:
      "Log in to your admin dashboard and connect your Facebook account via Meta's official OAuth flow. Select the Facebook Pages you manage. Each Page receives a verified, secure posting token stored in your database.",
    tag: "One-Time Setup",
  },
  {
    step: "02",
    title: "Prepare a Content Request",
    actor: "ChatGPT Action · Custom GPT",
    description:
      "Enter a topic (e.g. 'Why compound interest beats day trading'), select your preferred tone, image style, and target Facebook Page. The application generates a unique Request ID and stores the request details in Supabase.",
    tag: "User Input",
  },
  {
    step: "03",
    title: "Open the Custom GPT",
    actor: "User Action in ChatGPT",
    description:
      "Click 'Open Custom GPT' on the Generate screen to launch your configured 'Vetechno FB Auto Post' assistant in ChatGPT. Give it the Request ID (e.g. 'Process my queued request [ID]').",
    tag: "User Interaction",
  },
  {
    step: "04",
    title: "ChatGPT Generates Caption & Visual",
    actor: "ChatGPT Native Capabilities",
    description:
      "The Custom GPT executes the secure Action `getChatGPTContentRequest` to fetch your topic and constraints. It crafts an engaging title, caption, and hashtags, then generates a custom visual using ChatGPT's built-in DALL-E engine.",
    tag: "AI Assistance",
  },
  {
    step: "05",
    title: "Image Ingestion & Storage Hosting",
    actor: "Custom GPT Action · Machine-to-Machine",
    description:
      "The GPT calls the `importChatGPTImage` endpoint, uploading the generated image bytes directly to Supabase Storage. The server validates image headers and returns a permanent, verified public HTTPS URL.",
    tag: "Automated Action",
  },
  {
    step: "06",
    title: "Unpublished Draft Creation",
    actor: "Custom GPT Action · Machine-to-Machine",
    description:
      "The GPT calls `createChatGPTPost`, linking the title, caption, hashtags, hosted image URL, and target Page ID. The post is staged in your database with status 'draft' and a cryptographic content hash.",
    tag: "Automated Action",
  },
  {
    step: "07",
    title: "Human Inspection & Verification",
    actor: "Dashboard · /dashboard/queue",
    description:
      "The draft appears in your dashboard Queue. You inspect the exact rendered image, read the caption, review hashtags, and check the destination Page. Nothing is published without your approval.",
    tag: "Human Review",
  },
  {
    step: "08",
    title: "Publish or Schedule to Facebook",
    actor: "Dashboard or Scheduled Cron",
    description:
      "Click 'Publish Now' to immediately dispatch the photo post via Facebook Graph API, or schedule it for a future date/time. Once published, the application records the official Facebook Post ID and canonical URL.",
    tag: "Final Delivery",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <span>End-to-End Workflow</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            How Vetechno FB Auto Post Works
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            A clear, visual architecture connecting your ChatGPT creative sessions with a robust,
            human-supervised Facebook publishing dashboard.
          </p>
        </div>
      </section>

      {/* Architecture Diagram Section */}
      <section className="py-16 bg-background border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="font-heading text-2xl font-bold text-foreground">
              Architecture & Communication Flow
            </h2>
            <p className="text-sm text-muted-foreground">
              How the application, your Custom GPT, Supabase, and Meta communicate securely.
            </p>
          </div>

          {/* Clean Flow Card */}
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div className="rounded-xl border border-border bg-surface-2/50 p-5 space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Database size={20} weight="bold" />
                </div>
                <h3 className="font-bold text-sm text-foreground">1. Application Backend</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Next.js App Router on Vercel backed by Supabase PostgreSQL and Storage buckets for persistent images.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-2/50 p-5 space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Cpu size={20} weight="bold" />
                </div>
                <h3 className="font-bold text-sm text-foreground">2. Custom GPT Bridge</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  OpenAI Custom GPT ("Vetechno FB Auto Post") communicates via authenticated OpenAPI Actions using Bearer keys.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-2/50 p-5 space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CloudArrowUp size={20} weight="bold" />
                </div>
                <h3 className="font-bold text-sm text-foreground">3. Facebook Graph API</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Publishes verified photo posts directly to connected Page feeds using long-lived per-Page access tokens.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
              <ShieldCheck size={20} className="text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Human-in-the-Loop Safeguard</p>
                <p className="leading-relaxed">
                  The Custom GPT is strictly limited to staging drafts. The application backend requires human approval and cryptographic content-hash verification before a post can be published or scheduled.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step by Step Breakdown */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
              Step-by-Step User Journey
            </h2>
            <p className="text-sm text-muted-foreground">
              Every stage from concept formulation to live Facebook confirmation.
            </p>
          </div>

          <div className="space-y-4">
            {WORKFLOW_STEPS.map((s, idx) => (
              <div
                key={s.step}
                className="rounded-2xl border border-border bg-background p-6 transition hover:border-primary/40 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary font-mono">
                      {s.step}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-foreground">{s.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {s.actor}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      {s.tag}
                    </span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-0 sm:pl-11">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-background py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 space-y-4">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            Experience the Workflow
          </h2>
          <p className="text-sm text-muted-foreground">
            Log in to your workspace to prepare content requests and review staged drafts.
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
