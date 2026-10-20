"use client";

import { useState } from "react";
import {
  FlagBanner,
  Sparkle,
  ShieldCheck,
  CalendarCheck,
  Clock,
  Info,
} from "@phosphor-icons/react/dist/ssr";

export function InteractiveDashboardMockup() {
  const [activeTab, setActiveTab] = useState<"queue" | "request" | "pages">("queue");

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl border border-border/80 bg-surface shadow-2xl shadow-primary/5 overflow-hidden transition-all duration-200">
      {/* Top Application Mockup Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border bg-surface-2/70 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-3 w-3 rounded-full bg-rose-500/80" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">
            fbautopost.vetechno.in/dashboard
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Info size={11} className="text-primary" />
            Illustrative Demo
          </span>
        </div>

        {/* Mock Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1 border border-border/60 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              activeTab === "queue"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Draft Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("request")}
            className={`rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              activeTab === "request"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ChatGPT Bridge
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pages")}
            className={`rounded-lg px-3 py-1 font-medium transition cursor-pointer ${
              activeTab === "pages"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Facebook Pages
          </button>
        </div>
      </div>

      {/* Main Mockup Body */}
      <div className="p-4 sm:p-6 lg:p-8 bg-background/50">
        {activeTab === "queue" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Context Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border/60">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Post Review Queue</h3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    1 Pending Draft
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Target Destination: <strong className="text-foreground">Acme Digital Agency</strong> (Sample Page ID: 100000000000001)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={14} weight="bold" />
                  Hash Verified
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground">
                  <Clock size={13} />
                  Created via Custom GPT
                </span>
              </div>
            </div>

            {/* Post Draft Card Representation */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Simulated Image with Real Styling */}
                <div className="md:col-span-5 relative aspect-square rounded-xl overflow-hidden border border-border bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 flex flex-col justify-between text-white shadow-inner">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-200">
                    <span className="bg-indigo-600/60 backdrop-blur-xs px-2 py-0.5 rounded">Strategy & Growth</span>
                    <span className="text-slate-300">Sample Visual</span>
                  </div>

                  <div className="space-y-1.5 my-auto text-center py-2">
                    <p className="text-xs tracking-wider uppercase text-cyan-400 font-bold">Distributed Team Dynamics</p>
                    <p className="text-lg font-extrabold leading-tight tracking-tight">Focus on Outcomes, Not Just Hours</p>
                    <div className="pt-2 flex justify-center items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                        ✓ Asynchronous Communication First
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-white/10">
                    <span>Vetechno FB Auto Post</span>
                    <span className="font-mono text-emerald-300">Supabase Hosted ✓</span>
                  </div>
                </div>

                {/* Simulated Metadata and Caption */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Post ID: demo_draft_01
                      </span>
                      <span className="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                        Unpublished Draft
                      </span>
                    </div>

                    <h4 className="mt-2 text-base font-bold text-foreground">
                      Focus on Outcomes, Not Hours at the Desk
                    </h4>

                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground bg-surface-2/40 rounded-lg p-3 border border-border/40">
                      High-performing distributed teams prioritize clarity of objectives, deep focus blocks, and asynchronous documentation over endless check-in calls. What single workflow habit has helped your remote team stay most productive?
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">#Leadership</span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">#RemoteWork</span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">#TeamCulture</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarCheck size={14} className="text-primary" />
                      <span>Ready for human review</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground border border-border">
                        Review in Queue
                      </span>
                      <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs">
                        Approve Post
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "request" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkle size={18} className="text-primary" />
                  <h4 className="text-sm font-bold text-foreground">ChatGPT Bridge Request (Sample)</h4>
                </div>
                <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-semibold">
                  Status: draft_created
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <span className="text-muted-foreground block text-[11px]">Input Topic</span>
                  <span className="font-semibold text-foreground mt-0.5 block">
                    5 Proven Strategies for Remote Team Productivity
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <span className="text-muted-foreground block text-[11px]">Selected Destination Page</span>
                  <span className="font-semibold text-foreground mt-0.5 block">
                    Acme Digital Agency (Demo Page ID: 100000000000001)
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface-2/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Bridge Workflow:</strong> You prepare the topic in the application dashboard, click <em>Open Custom GPT</em>, and the configured assistant writes the post and invokes <code className="font-mono text-primary font-semibold">importChatGPTImage</code> & <code className="font-mono text-primary font-semibold">createChatGPTPost</code> to return the draft directly into your Queue.
              </div>
            </div>
          </div>
        )}

        {activeTab === "pages" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <FlagBanner size={18} className="text-primary" />
                  <h4 className="text-sm font-bold text-foreground">Connected Facebook Pages (Illustrative)</h4>
                </div>
                <span className="text-xs text-muted-foreground">Multi-Page Destination Support</span>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Acme Digital Agency</p>
                    <p className="text-[11px] text-muted-foreground">Sample ID: 100000000000001</p>
                  </div>
                  <span className="rounded bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">Active</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/40 p-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Acme Tech Insights</p>
                    <p className="text-[11px] text-muted-foreground">Sample ID: 100000000000002</p>
                  </div>
                  <span className="rounded bg-surface-2 text-foreground text-[10px] font-medium px-2 py-0.5">Connected</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/40 p-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Acme Creative Studio</p>
                    <p className="text-[11px] text-muted-foreground">Sample ID: 100000000000003</p>
                  </div>
                  <span className="rounded bg-surface-2 text-foreground text-[10px] font-medium px-2 py-0.5">Connected</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/40 p-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Acme Community Hub</p>
                    <p className="text-[11px] text-muted-foreground">Multi-destination ready</p>
                  </div>
                  <span className="rounded bg-surface-2 text-foreground text-[10px] font-medium px-2 py-0.5">Connected</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="border-t border-border bg-surface px-4 py-2.5 sm:px-6 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Verified Technical Stack: Next.js + Supabase + Facebook Graph API</span>
        <span className="font-medium text-primary">Illustrative Sample Interface</span>
      </div>
    </div>
  );
}
