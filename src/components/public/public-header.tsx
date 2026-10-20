"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { List, X, SignIn, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/requirements", label: "Requirements" },
  { href: "/benefits", label: "Benefits" },
  { href: "/limitations", label: "Limitations" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-200",
        scrolled
          ? "border-b border-border/80 bg-background/90 shadow-sm backdrop-blur-md"
          : "border-b border-border/40 bg-background/70 backdrop-blur-sm"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
          aria-label="Vetechno FB Auto Post - Home"
        >
          <Logo className="[&>span]:text-base sm:[&>span]:text-lg" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2" aria-label="Main Navigation">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs xl:text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-surface text-primary font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right CTA Area: ThemeToggle + Login */}
        <div className="hidden sm:flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            id="nav-login-button"
          >
            <SignIn size={16} weight="bold" />
            <span>Login</span>
          </Link>
        </div>

        {/* Mobile controls */}
        <div className="flex sm:hidden items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-surface-2"
          >
            {mobileMenuOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-surface px-4 py-5 shadow-xl sm:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="mb-4">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
              onClick={() => setMobileMenuOpen(false)}
            >
              <SignIn size={16} weight="bold" />
              <span>Login to Dashboard</span>
              <ArrowRight size={14} weight="bold" />
            </Link>
          </div>

          <nav className="flex flex-col space-y-1" aria-label="Mobile Navigation">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{link.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
