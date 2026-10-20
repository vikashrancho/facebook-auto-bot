import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ShieldCheck, ArrowSquareOut, SignIn } from "@phosphor-icons/react/dist/ssr";

export function PublicFooter() {
  const currentYear = 2026;

  return (
    <footer className="border-t border-border bg-surface text-foreground transition-colors" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">
                Vetechno FB Auto Post
              </span>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              A centralized social media content workflow combining ChatGPT-assisted post preparation,
              image hosting, draft queue review, and reliable Facebook publishing management.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 font-medium text-foreground">
                <ShieldCheck size={14} className="text-emerald-500" />
                Human-in-the-Loop Review
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 font-medium text-foreground">
                Multi-Page Ready
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Product & Workflow
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/benefits" className="text-muted-foreground hover:text-foreground transition">
                  Benefits & Features
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-foreground transition">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust, Requirements & Access */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Guidance & Access
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/requirements" className="text-muted-foreground hover:text-foreground transition">
                  Prerequisites & Setup
                </Link>
              </li>
              <li>
                <Link href="/limitations" className="text-muted-foreground hover:text-foreground transition">
                  Limitations & Notice
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition">
                  Privacy Policy
                </Link>
              </li>
              <li className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <SignIn size={14} weight="bold" />
                  <span>Admin Login</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer & Copyright */}
        <div className="mt-12 border-t border-border/60 pt-8 space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            <strong>Trademark & Association Disclaimer:</strong> Vetechno FB Auto Post is an independent software tool developed by Vetechno. Meta, Facebook, and Instagram are trademarks of Meta Platforms, Inc. ChatGPT, DALL-E, and OpenAI are trademarks of OpenAI, Inc. This application is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. or OpenAI, Inc.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground pt-2">
            <p>© {currentYear} Vetechno. All rights reserved.</p>
            <p>Designed for organized, transparent social media publishing.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
