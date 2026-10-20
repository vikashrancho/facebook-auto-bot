import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  ShieldCheck,
  Database,
  FacebookLogo,
  LockKey,
  Trash,
  EnvelopeSimple,
  WarningCircle,
  FileText,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Privacy Policy — Vetechno FB Auto Post",
  description:
    "Privacy policy and data processing disclosures for Vetechno FB Auto Post, including Facebook tokens, post data, and storage practices.",
};

export default function PrivacyPage() {
  const lastUpdated = "October 20, 2026";

  return (
    <MarketingShell>
      {/* Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <FileText size={14} weight="bold" />
            <span>Data Transparency</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Detailed disclosures on the data processed, stored, and communicated by Vetechno FB Auto Post.
          </p>
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12 text-sm text-foreground/90 leading-relaxed">
          {/* Policy Notice Box */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <ShieldCheck size={18} weight="bold" />
              <span>Owner & Operator Transparency Notice</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This document serves as the operational privacy policy draft for the <strong>Vetechno FB Auto Post</strong> application.
              It describes actual data flows, third-party infrastructure, and user controls verified in the software codebase.
              This document should be reviewed by the application owner for local regulatory jurisdiction compliance.
            </p>
          </div>

          {/* Section 1: Overview */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">1. Overview & Scope</h2>
            <p className="text-muted-foreground">
              Vetechno FB Auto Post is a specialized social media management and content drafting tool.
              It enables authorized administrators to prepare Facebook Page posts with ChatGPT assistance,
              host post visual assets, review drafts, and publish directly to connected Facebook Pages.
              This policy explains what information is collected, how it is stored, and your rights over that data.
            </p>
          </div>

          {/* Section 2: Data Collected */}
          <div className="space-y-4">
            <h2 className="font-heading text-xl font-bold text-foreground">2. Information Processed & Stored</h2>
            <p className="text-muted-foreground">
              Based on the technical architecture of Vetechno FB Auto Post, the application processes the following categories of data:
            </p>

            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
                <h3 className="font-semibold text-foreground text-sm">A. Meta / Facebook Account & Page Information</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                  <li><strong>Facebook User Name & User ID:</strong> To identify the authenticated connected account.</li>
                  <li><strong>Facebook Page Metadata:</strong> Page IDs, names, categories, and profile picture URLs.</li>
                  <li><strong>Access Tokens:</strong> Long-lived user access tokens (~60-day lifespan) and Page access tokens required to communicate with the Facebook Graph API. Tokens are stored exclusively on the server in database records and are never exposed to browser clients.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
                <h3 className="font-semibold text-foreground text-sm">B. Post & Content Data</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                  <li><strong>Content Requests:</strong> Topics, desired tone, audience descriptions, image style preferences, and target Page IDs.</li>
                  <li><strong>Post Drafts:</strong> Titles, captions, hashtags, destination Page IDs, and approval timestamps.</li>
                  <li><strong>Image Assets:</strong> Images generated in ChatGPT or provided by the operator, ingested and hosted in a dedicated Supabase Storage bucket (<code className="text-primary text-[11px]">post-images</code>).</li>
                  <li><strong>Publication Records:</strong> Meta Facebook Post IDs, scheduled publication timestamps, and API error logs.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
                <h3 className="font-semibold text-foreground text-sm">C. Authentication & Technical Session Data</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                  <li><strong>Session Cookies:</strong> An HTTP-only signed session cookie (<code className="text-primary text-[11px]">pab_session</code>) to maintain administrative dashboard access.</li>
                  <li><strong>Machine-to-Machine Integration Keys:</strong> Secret Bearer API keys used by Custom GPT Actions to authenticate requests to application endpoints.</li>
                  <li><strong>Diagnostic Logs:</strong> Server request timestamps and HTTP status codes for system health monitoring.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 3: How Data Is Used */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">3. How Information Is Used</h2>
            <p className="text-muted-foreground">
              All stored and processed data is used solely to provide core application functionality:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>To retrieve and display the list of Facebook Pages accessible to the connected account.</li>
              <li>To receive content requests and allow your Custom GPT to stage unpublished drafts.</li>
              <li>To host image files permanently so that publishing to Facebook does not fail from broken URLs.</li>
              <li>To enforce explicit human approval before any post is published or scheduled.</li>
              <li>To execute authorized photo post publications to Facebook Graph API endpoints.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              We do not sell, rent, or monetize your content, page data, or access tokens to any third-party advertisers or data brokers.
            </p>
          </div>

          {/* Section 4: Infrastructure & Third-Party Providers */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">4. Third-Party Service Providers</h2>
            <p className="text-muted-foreground">
              The application utilizes reputable third-party cloud infrastructure to operate:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                <strong className="text-foreground block">Supabase Inc.</strong>
                <span className="text-muted-foreground">Managed PostgreSQL database and S3-compatible Object Storage for image hosting.</span>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                <strong className="text-foreground block">Meta Platforms, Inc.</strong>
                <span className="text-muted-foreground">Facebook Login OAuth, Graph API node queries, and Page photo publishing.</span>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                <strong className="text-foreground block">OpenAI, Inc.</strong>
                <span className="text-muted-foreground">Custom GPT conversational assistant and DALL-E image generation capabilities.</span>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                <strong className="text-foreground block">Vercel Inc.</strong>
                <span className="text-muted-foreground">Serverless application hosting, edge routing, and SSL/TLS termination.</span>
              </div>
            </div>
          </div>

          {/* Section 5: Security Practices */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">5. Security Safeguards</h2>
            <p className="text-muted-foreground">
              The application implements the following verified security practices:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li><strong>HTTPS Encryption:</strong> All data in transit between clients, ChatGPT, Supabase, and Meta is encrypted using TLS.</li>
              <li><strong>Token Isolation:</strong> Facebook Page access tokens and user tokens are stored server-side and never sent to browser client bundles.</li>
              <li><strong>Cryptographic Content Hashes:</strong> Post approvals are cryptographically bound using SHA-256 hashes to prevent tampered payloads from publishing.</li>
              <li><strong>Single-Use Approval Tokens:</strong> Publishing actions require an ephemeral, single-use approval token that expires automatically.</li>
            </ul>
          </div>

          {/* Section 6: Data Retention & User Choices */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">6. Data Retention, Disconnection & Deletion</h2>
            <p className="text-muted-foreground">
              You retain full control over your stored records:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong>Disconnecting Facebook:</strong> Navigating to Settings (<code className="text-primary text-[11px]">/dashboard/settings</code>) and clicking <em>Disconnect Facebook</em> immediately clears all user tokens and Page access tokens from the database.
              </li>
              <li>
                <strong>Individual Page Deactivation:</strong> You can disconnect or reactivate specific Facebook Pages on the Pages dashboard without disconnecting your entire account.
              </li>
              <li>
                <strong>Deleting Posts:</strong> Drafts and scheduled posts can be deleted directly from your dashboard Queue.
              </li>
            </ul>
          </div>

          {/* Section 7: Contact Information */}
          <div className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">7. Contact & Inquiries</h2>
            <p className="text-muted-foreground">
              For privacy-related questions, data deletion requests, or technical inquiries regarding Vetechno FB Auto Post, please contact:
            </p>
            <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-3 text-xs">
              <EnvelopeSimple size={20} className="text-primary shrink-0" />
              <div>
                <span className="font-semibold text-foreground block">Application Administrator</span>
                <span className="text-muted-foreground font-mono">
                  [Contact Email: support@vetechno.in / Insert Owner Contact]
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-surface py-12 text-center">
        <div className="mx-auto max-w-2xl px-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Have questions about operating Vetechno FB Auto Post?
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/how-it-works"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Review How It Works</span>
              <ArrowRight size={12} weight="bold" />
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link
              href="/login"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Login to Dashboard</span>
              <ArrowRight size={12} weight="bold" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
