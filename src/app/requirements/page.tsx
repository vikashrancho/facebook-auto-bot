import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/public/marketing-shell";
import {
  CheckSquare,
  LockKey,
  FacebookLogo,
  Sparkle,
  Globe,
  WarningCircle,
  ShieldCheck,
  SignIn,
  ArrowRight,
  Info,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Prerequisites & Requirements — Vetechno FB Auto Post",
  description:
    "Review the setup prerequisites and technical requirements needed to use Vetechno FB Auto Post and connect with Facebook and ChatGPT.",
};

export default function RequirementsPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-surface-2/40 to-background border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <span>Prerequisites & Setup</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            What You'll Need to Get Started
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Review the account, permission, and software prerequisites required to operate
            Vetechno FB Auto Post and link with Meta and ChatGPT.
          </p>
        </div>
      </section>

      {/* Main Checklist & Breakdown */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Actionable Checklist */}
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckSquare size={22} weight="bold" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">Prerequisites Checklist</h2>
                <p className="text-xs text-muted-foreground">Everything required before publishing your first post</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-4">
                <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground block font-semibold">1. Application Admin Login</strong>
                  <span className="text-muted-foreground">Admin password access configured in the application environment.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-4">
                <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground block font-semibold">2. Facebook Page Admin Access</strong>
                  <span className="text-muted-foreground">Task or administrative permissions on the target Meta Facebook Pages.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-4">
                <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground block font-semibold">3. ChatGPT Plus or Team Plan</strong>
                  <span className="text-muted-foreground">An active OpenAI subscription capable of running Custom GPTs with DALL-E.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-4">
                <CheckCircle size={18} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground block font-semibold">4. Custom GPT Actions Configured</strong>
                  <span className="text-muted-foreground">OpenAPI schema imported into Custom GPT with your secret Bearer API key.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Facebook Permissions */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <FacebookLogo size={24} weight="fill" className="text-primary" />
                <h3 className="font-heading text-lg font-bold text-foreground">
                  Facebook Permissions Required
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                During the Meta OAuth login dialog, your Facebook account must authorize the following permissions for publishing to work:
              </p>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground bg-background rounded-xl p-3 border border-border/60">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <code>pages_show_list</code> — To discover Pages you administer
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <code>pages_manage_posts</code> — To publish photo posts to Page feeds
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <code>pages_read_engagement</code> — To confirm post publication status
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                <em>Note:</em> Posting to Facebook Pages you manage directly does not require public Meta App Review.
              </p>
            </div>

            {/* ChatGPT & Custom GPT Setup */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Sparkle size={24} weight="bold" className="text-primary" />
                <h3 className="font-heading text-lg font-bold text-foreground">
                  ChatGPT Custom GPT Setup
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The content drafting workflow operates via an authorized Custom GPT ("Vetechno FB Auto Post"):
              </p>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>OpenAPI Schema URL:</strong> <code className="text-foreground text-[11px]">https://fbautopost.vetechno.in/openapi.json</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Authentication:</strong> API Key (Bearer token matching your configured <code className="text-foreground text-[11px]">INTEGRATION_API_KEY</code>).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Privacy Policy URL:</strong> <code className="text-foreground text-[11px]">https://fbautopost.vetechno.in/privacy</code></span>
                </li>
              </ul>
            </div>

            {/* Technical & Storage Constraints */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Globe size={24} weight="bold" className="text-primary" />
                <h3 className="font-heading text-lg font-bold text-foreground">
                  Storage & Image Constraints
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <li>• <strong>Supported Image Formats:</strong> PNG, JPEG, and WebP.</li>
                <li>• <strong>Maximum File Size:</strong> 10MB per image upload.</li>
                <li>• <strong>Image Hosting:</strong> Re-hosted automatically into Supabase Storage (<code className="text-foreground text-[11px]">post-images</code> bucket) to preserve original bytes.</li>
                <li>• <strong>Browser Compatibility:</strong> Modern standards-compliant browsers (Google Chrome, Microsoft Edge, Safari, Mozilla Firefox).</li>
              </ul>
            </div>

            {/* Common Setup Considerations */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <Info size={24} weight="bold" className="text-amber-500" />
                <h3 className="font-heading text-lg font-bold text-foreground">
                  Common Setup Guidance
                </h3>
              </div>
              <ul className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Missing Page on Connect:</strong> If a New Pages Experience (NPE) or Business Suite Page does not appear in your automatic list, use the <em>Add Page by ID</em> feature in the Pages dashboard.
                </li>
                <li>
                  <strong className="text-foreground">Token Refresh:</strong> Long-lived user tokens last approximately 60 days. Reconnect in Settings if permissions change or expire.
                </li>
                <li>
                  <strong className="text-foreground">Security Warning:</strong> Never share your <code className="text-[11px]">INTEGRATION_API_KEY</code> or Meta App Secret publicly.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-surface py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 space-y-4">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            Ready to Connect?
          </h2>
          <p className="text-sm text-muted-foreground">
            Log in to your dashboard to inspect your connected Facebook Pages and configure preferences.
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
