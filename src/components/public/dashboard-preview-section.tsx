"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  House,
  Sparkle,
  FileText,
  Queue,
  Calendar as CalendarIcon,
  ClockCounterClockwise,
  FlagBanner,
  Gear,
  SignOut,
  Sun,
  ArrowsClockwise,
  Plus,
  CaretDown,
  CaretLeft,
  CaretRight,
  Faders,
  ArrowsOut,
  X,
  SignIn,
  Info,
  CheckCircle,
  WarningCircle,
  ShieldCheck,
  Clock,
  ChartLineUp,
  MegaphoneSimple,
  CalendarCheck,
} from "@phosphor-icons/react";

export function DashboardPreviewSection() {
  const [activeTab, setActiveTab] = useState<"overview" | "calendar">("overview");
  const [isEnlarged, setIsEnlarged] = useState(false);

  // Close full preview modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsEnlarged(false);
    };
    if (isEnlarged) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isEnlarged]);

  return (
    <section className="relative overflow-hidden border-t border-border bg-gradient-to-b from-background via-surface/40 to-background py-16 sm:py-24">
      {/* Soft atmospheric ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 left-1/2 -z-10 h-[32rem] w-[54rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--color-primary), rgba(24, 119, 242, 0.12) 50%, transparent 80%)",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Heading & Supporting Description */}
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Interactive Application Preview</span>
          </div>

          <h2 className="font-heading text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
            See Your Social Media Dashboard in Action
          </h2>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Get a clear view of your publishing activity, content queue, and scheduled posts—all from one
            organized workspace.
          </p>
        </div>

        {/* Tab Switcher & Controls */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-2xl bg-surface border border-border p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                activeTab === "overview"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              }`}
            >
              <House size={16} weight={activeTab === "overview" ? "fill" : "regular"} />
              <span>Dashboard Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("calendar")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                activeTab === "calendar"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              }`}
            >
              <CalendarIcon size={16} weight={activeTab === "calendar" ? "fill" : "regular"} />
              <span>Content Calendar</span>
            </button>
          </div>

          {/* Privacy badge and Enlarge button */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Info size={13} className="text-primary" />
              <span>Demo Preview · Sample Data</span>
            </span>

            <button
              type="button"
              onClick={() => setIsEnlarged(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-2 transition cursor-pointer"
              title="Click to enlarge preview"
            >
              <ArrowsOut size={14} />
              <span className="hidden sm:inline">Enlarge Preview</span>
            </button>
          </div>
        </div>

        {/* Dashboard Mockup Container */}
        <div className="mt-6 rounded-2xl border border-border/90 bg-[#0B0C0E] shadow-2xl shadow-primary/5 overflow-hidden">
          {/* Top Window chrome / browser header */}
          <div className="flex items-center justify-between border-b border-[#1E2128] bg-[#121418] px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#E05252]" />
              <span className="h-3 w-3 rounded-full bg-[#E5A93C]" />
              <span className="h-3 w-3 rounded-full bg-[#46B16A]" />
              <span className="ml-3 font-mono text-[11px] text-muted-foreground hidden sm:inline">
                fbautopost.vetechno.in/dashboard{activeTab === "calendar" ? "/calendar" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                PROTOTYPE VIEW
              </span>
            </div>
          </div>

          {/* Render Active Mockup */}
          <div className="overflow-x-auto">
            <div className="min-w-[760px] lg:min-w-0">
              {activeTab === "overview" ? <OverviewMockup /> : <CalendarMockup />}
            </div>
          </div>
        </div>

        {/* Section 5: Login Call to Action directly following the previews */}
        <div className="mt-14 sm:mt-16 rounded-3xl border border-border bg-surface p-8 sm:p-12 text-center shadow-lg relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 left-1/2 -z-10 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="mx-auto max-w-2xl space-y-4">
            <h3 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Ready to Organize Your Content Workflow?
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Log in to access your dashboard, review content drafts, and manage your supported publishing
              workflow.
            </p>
            <div className="pt-2 flex justify-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SignIn size={18} weight="bold" />
                <span>Login to Your Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Enlarged Modal Overlay */}
      {isEnlarged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
          <div className="relative w-full max-w-6xl rounded-2xl border border-border bg-[#0B0C0E] shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1E2128] bg-[#121418] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground">
                  {activeTab === "overview" ? "Dashboard Overview Preview" : "Content Calendar Preview"}
                </span>
                <span className="rounded-full border border-border/80 bg-surface px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Demo Preview · Sample Data
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEnlarged(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition cursor-pointer"
                title="Close enlarged preview (Esc)"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-x-auto p-2 sm:p-4 bg-[#0B0C0E]">
              <div className="min-w-[900px]">
                {activeTab === "overview" ? <OverviewMockup /> : <CalendarMockup />}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------
// PREVIEW A: DASHBOARD OVERVIEW MOCKUP
// -------------------------------------------------------------
function OverviewMockup() {
  return (
    <div className="flex bg-[#0D0E12] text-foreground font-sans min-h-[580px]">
      {/* Left Sidebar Mockup */}
      <aside className="w-56 shrink-0 border-r border-[#1E2128] bg-[#121418] p-4 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Logo brand */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H7v-3h3V9.5C10 6.46 11.82 5 14.54 5c1.3 0 2.66.23 2.66.23v2.93h-1.5c-1.5 0-1.97.93-1.97 1.89V12h3.3l-.53 3h-2.77v6.8c4.56-.93 8-4.96 8-9.8 0-5.52-4.48-10-10-10z" />
              </svg>
            </div>
            <span className="font-heading text-sm font-bold tracking-tight text-white">
              Vetechno FB Auto Post
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1 text-xs font-medium">
            <div className="flex items-center gap-3 rounded-xl bg-[#1D212A] text-primary px-3 py-2 font-semibold shadow-inner">
              <House size={16} weight="fill" />
              <span>Overview</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Sparkle size={16} />
              <span>Generate</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <FileText size={16} />
              <span>Templates</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Queue size={16} />
              <span>Queue</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <CalendarIcon size={16} />
              <span>Calendar</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <ClockCounterClockwise size={16} />
              <span>History</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <FlagBanner size={16} />
              <span>Pages</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Gear size={16} />
              <span>Settings</span>
            </div>
          </nav>
        </div>

        <div className="text-[10px] text-zinc-500 px-2">
          <span>Demo Environment</span>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <main className="flex-1 p-6 space-y-6 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2">
          <h1 className="text-xl font-bold tracking-tight text-white">Overview</h1>
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-1.5 text-zinc-400 hover:text-white">
              <Sun size={17} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
              <SignOut size={16} />
              <span>Sign out</span>
            </div>
          </div>
        </div>

        {/* 1. Four Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total posts published */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-zinc-400">Total posted</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">128</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <MegaphoneSimple size={20} weight="bold" />
            </div>
          </div>

          {/* Card 2: Posts published this week */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-zinc-400">Posted this week</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">14</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <CalendarCheck size={20} weight="bold" />
            </div>
          </div>

          {/* Card 3: Posts in queue */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-zinc-400">In queue</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">6</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Clock size={20} weight="bold" />
            </div>
          </div>

          {/* Card 4: Failed posts */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[11px] font-medium text-zinc-400">Failed</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-white">1</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <ChartLineUp size={20} weight="bold" />
            </div>
          </div>
        </div>

        {/* 2. Middle Row: Activity Chart + Quick Generate Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Activity Chart (Left Column, ~65%) */}
          <div className="lg:col-span-8 rounded-2xl border border-[#1E2128] bg-[#14161C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Posts published — last 14 days</h2>
              <span className="text-[11px] text-zinc-400">Illustrative Activity</span>
            </div>

            {/* Illustrative Curve (SVG Area Chart matching reference screenshot) */}
            <div className="relative h-44 w-full pt-2">
              <svg viewBox="0 0 600 160" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal grid lines */}
                <line x1="0" y1="130" x2="600" y2="130" stroke="#1E2128" strokeWidth="1" />
                <line x1="0" y1="80" x2="600" y2="80" stroke="#1E2128" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="30" x2="600" y2="30" stroke="#1E2128" strokeWidth="1" strokeDasharray="3 3" />

                {/* Filled Area */}
                <path
                  d="M 0,130 
                     L 50,130 
                     Q 75,90 90,95 
                     T 130,130 
                     L 350,130 
                     Q 380,100 400,95 
                     Q 430,90 450,30 
                     Q 470,20 490,70 
                     Q 530,110 600,120 
                     L 600,130 Z"
                  fill="url(#chartGradient)"
                />

                {/* Smooth Curve Stroke */}
                <path
                  d="M 0,130 
                     L 50,130 
                     Q 75,90 90,95 
                     T 130,130 
                     L 350,130 
                     Q 380,100 400,95 
                     Q 430,90 450,30 
                     Q 470,20 490,70 
                     Q 530,110 600,120"
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Peak point indicator */}
                <circle cx="450" cy="30" r="4" fill="#60A5FA" stroke="#1D4ED8" strokeWidth="2" />
              </svg>

              {/* X-axis date labels */}
              <div className="mt-1 flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>Oct 8</span>
                <span>Oct 9</span>
                <span>Oct 10</span>
                <span>Oct 11</span>
                <span>Oct 12</span>
                <span>Oct 13</span>
                <span>Oct 14</span>
                <span>Oct 15</span>
                <span>Oct 16</span>
                <span>Oct 17</span>
                <span className="text-blue-400 font-bold">Oct 18</span>
                <span>Oct 19</span>
                <span>Oct 20</span>
              </div>
            </div>
          </div>

          {/* Quick Generate Panel (Right Column, ~35%) */}
          <div className="lg:col-span-4 rounded-2xl border border-[#1E2128] bg-[#14161C] p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-white">Quick generate</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Pick a topic and let the bot write the copy and source the image.
              </p>
            </div>

            <div className="py-2">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-primary/25 cursor-default"
              >
                <Sparkle size={15} weight="fill" />
                <span>Generate a post</span>
              </button>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-[#1E2128] text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Facebook</span>
                <span className="text-emerald-400 font-medium">Sample Connected User</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Page</span>
                <span className="text-white font-medium">Sample Facebook Page</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Autopilot</span>
                <span className="text-zinc-400 font-medium">Off</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Recent Activity List */}
        <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Recent activity</h2>
            <span className="text-xs font-semibold text-primary">View all</span>
          </div>

          <div className="divide-y divide-[#1E2128]">
            {/* Row 1 */}
            <div className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-900 flex items-center justify-center text-white shrink-0 font-bold text-[10px]">
                  FB
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    How Modern Teams Scale Content Efficiently | October 2026
                  </p>
                  <p className="text-[11px] text-zinc-400">Sample Facebook Page</p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Posted</span>
                </span>
                <span className="text-zinc-500 text-[11px]">Oct 20</span>
              </div>
            </div>

            {/* Row 2 */}
            <div className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-700 to-pink-900 flex items-center justify-center text-white shrink-0 font-bold text-[10px]">
                  AI
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    5 Practical Visual Strategies for Higher Social Engagement
                  </p>
                  <p className="text-[11px] text-zinc-400">Sample Facebook Page</p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Posted</span>
                </span>
                <span className="text-zinc-500 text-[11px]">Oct 19</span>
              </div>
            </div>

            {/* Row 3 */}
            <div className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-amber-700 to-orange-900 flex items-center justify-center text-white shrink-0 font-bold text-[10px]">
                  Q
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    Automating Routine Publishing While Preserving Human Oversight
                  </p>
                  <p className="text-[11px] text-zinc-400">Sample Facebook Page</p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium text-blue-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span>Queued</span>
                </span>
                <span className="text-zinc-500 text-[11px]">Oct 18</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// PREVIEW B: CONTENT CALENDAR MOCKUP
// -------------------------------------------------------------
function CalendarMockup() {
  return (
    <div className="flex bg-[#0D0E12] text-foreground font-sans min-h-[580px]">
      {/* Left Sidebar Mockup */}
      <aside className="w-56 shrink-0 border-r border-[#1E2128] bg-[#121418] p-4 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Logo brand */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H7v-3h3V9.5C10 6.46 11.82 5 14.54 5c1.3 0 2.66.23 2.66.23v2.93h-1.5c-1.5 0-1.97.93-1.97 1.89V12h3.3l-.53 3h-2.77v6.8c4.56-.93 8-4.96 8-9.8 0-5.52-4.48-10-10-10z" />
              </svg>
            </div>
            <span className="font-heading text-sm font-bold tracking-tight text-white">
              Vetechno FB Auto Post
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1 text-xs font-medium">
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <House size={16} />
              <span>Overview</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Sparkle size={16} />
              <span>Generate</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <FileText size={16} />
              <span>Templates</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Queue size={16} />
              <span>Queue</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[#1D212A] text-primary px-3 py-2 font-semibold shadow-inner">
              <CalendarIcon size={16} weight="fill" />
              <span>Calendar</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <ClockCounterClockwise size={16} />
              <span>History</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <FlagBanner size={16} />
              <span>Pages</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl text-zinc-400 px-3 py-2 hover:text-white transition">
              <Gear size={16} />
              <span>Settings</span>
            </div>
          </nav>
        </div>

        <div className="text-[10px] text-zinc-500 px-2">
          <span>Demo Environment</span>
        </div>
      </aside>

      {/* Main Calendar View Area */}
      <main className="flex-1 p-6 space-y-5 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-1">
          <h1 className="text-xl font-bold tracking-tight text-white">Content Calendar</h1>
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-1.5 text-zinc-400 hover:text-white">
              <Sun size={17} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
              <SignOut size={16} />
              <span>Sign out</span>
            </div>
          </div>
        </div>

        {/* 1. Calendar Navigation & Action Controls Bar */}
        <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white tracking-tight">Oct 18 – 24, 2026</span>
              <CaretDown size={14} className="text-zinc-400" />
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">India Standard Time (Asia/Kolkata)</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-[#232730] bg-[#1A1D24] flex items-center justify-center text-zinc-300"
            >
              <ArrowsClockwise size={14} />
            </button>

            <div className="inline-flex items-center rounded-lg border border-[#232730] bg-[#1A1D24] text-xs font-medium text-zinc-300">
              <span className="px-2 py-1.5 hover:text-white">
                <CaretLeft size={13} />
              </span>
              <span className="px-2 py-1.5 border-x border-[#232730] text-white font-semibold">Today</span>
              <span className="px-2 py-1.5 hover:text-white">
                <CaretRight size={13} />
              </span>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg border border-[#232730] bg-[#1A1D24] px-3 py-1.5 text-xs font-medium text-white">
              <span>Week</span>
              <CaretDown size={12} className="text-zinc-400" />
            </div>

            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-[#232730] bg-[#1A1D24] flex items-center justify-center text-zinc-300"
            >
              <Faders size={14} />
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-primary/25"
            >
              <Plus size={14} weight="bold" />
              <span>Schedule Post</span>
            </button>
          </div>
        </div>

        {/* 2. Calendar 5 Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Scheduled Today */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Scheduled Today</p>
              <p className="text-xl font-bold text-white mt-0.5">2</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <CalendarCheck size={16} />
            </div>
          </div>

          {/* Scheduled This Week */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Scheduled This Week</p>
              <p className="text-xl font-bold text-white mt-0.5">8</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>

          {/* Awaiting Approval */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Awaiting Approval</p>
              <p className="text-xl font-bold text-white mt-0.5">3</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <ShieldCheck size={16} />
            </div>
          </div>

          {/* Published */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Published</p>
              <p className="text-xl font-bold text-white mt-0.5">42</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <CheckCircle size={16} />
            </div>
          </div>

          {/* Needs Attention */}
          <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] p-3.5 flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Needs Attention</p>
              <p className="text-xl font-bold text-white mt-0.5">1</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center">
              <WarningCircle size={16} />
            </div>
          </div>
        </div>

        {/* 3. Calendar Week Grid */}
        <div className="rounded-2xl border border-[#1E2128] bg-[#14161C] overflow-hidden text-xs">
          {/* Header Row: Days of the week */}
          <div className="grid grid-cols-8 border-b border-[#1E2128] bg-[#16181E] text-center font-medium py-2.5">
            <div className="text-zinc-500 font-normal">Time</div>
            <div className="text-zinc-400">Sun 18</div>
            <div className="text-zinc-400">Mon 19</div>
            {/* Current day highlighted with solid blue pill matching screenshot */}
            <div className="flex justify-center">
              <span className="inline-block rounded-lg bg-primary px-3 py-0.5 font-bold text-white shadow-xs">
                Tue 20
              </span>
            </div>
            <div className="text-zinc-400">Wed 21</div>
            <div className="text-zinc-400">Thu 22</div>
            <div className="text-zinc-400">Fri 23</div>
            <div className="text-zinc-400">Sat 24</div>
          </div>

          {/* Grid Slots */}
          <div className="divide-y divide-[#1A1D24]">
            {/* Slot: 9 am */}
            <div className="grid grid-cols-8 min-h-[58px]">
              <div className="p-2 text-zinc-500 font-mono text-[11px] border-r border-[#1E2128]">
                9 am
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              {/* Event on Tue 20 */}
              <div className="border-r border-[#1E2128]/40 p-1 bg-primary/5">
                <div className="rounded-lg border border-primary/40 bg-[#1A2234] p-1.5 shadow-xs text-[10px]">
                  <p className="font-bold text-white truncate">Scaling Content in 2026</p>
                  <div className="mt-0.5 flex items-center justify-between text-zinc-400">
                    <span>9:30 AM</span>
                    <span className="text-emerald-400 font-semibold">Published</span>
                  </div>
                </div>
              </div>
              <div className="border-r border-[#1E2128]/40" />
              {/* Event on Thu 22 */}
              <div className="border-r border-[#1E2128]/40 p-1">
                <div className="rounded-lg border border-blue-500/30 bg-[#161D2C] p-1.5 shadow-xs text-[10px]">
                  <p className="font-bold text-white truncate">Productivity Habits</p>
                  <div className="mt-0.5 flex items-center justify-between text-zinc-400">
                    <span>9:00 AM</span>
                    <span className="text-blue-400 font-semibold">Scheduled</span>
                  </div>
                </div>
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div />
            </div>

            {/* Slot: 11 am */}
            <div className="grid grid-cols-8 min-h-[58px]">
              <div className="p-2 text-zinc-500 font-mono text-[11px] border-r border-[#1E2128]">
                11 am
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40 bg-primary/5" />
              {/* Event on Wed 21 */}
              <div className="border-r border-[#1E2128]/40 p-1">
                <div className="rounded-lg border border-amber-500/30 bg-[#241F1A] p-1.5 shadow-xs text-[10px]">
                  <p className="font-bold text-white truncate">Engagement Strategies</p>
                  <div className="mt-0.5 flex items-center justify-between text-zinc-400">
                    <span>11:15 AM</span>
                    <span className="text-amber-400 font-semibold">Approval Req</span>
                  </div>
                </div>
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              <div />
            </div>

            {/* Slot: 2 pm */}
            <div className="grid grid-cols-8 min-h-[58px]">
              <div className="p-2 text-zinc-500 font-mono text-[11px] border-r border-[#1E2128]">
                2 pm
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              {/* Scheduled post on Tue 20 at 2pm */}
              <div className="border-r border-[#1E2128]/40 p-1 bg-primary/5">
                <div className="rounded-lg border border-blue-500/40 bg-[#161E30] p-1.5 shadow-xs text-[10px]">
                  <p className="font-bold text-white truncate">Market Insights Weekly</p>
                  <div className="mt-0.5 flex items-center justify-between text-zinc-400">
                    <span>2:00 PM</span>
                    <span className="text-blue-400 font-semibold">Scheduled</span>
                  </div>
                </div>
              </div>
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              <div className="border-r border-[#1E2128]/40" />
              <div />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
