/**
 * PDF Manual Generator for Vetechno FB Auto Post
 *
 * Compiles all markdown files in docs/ into a beautifully styled HTML document
 * and invokes headless Microsoft Edge to render docs/Vetechno_FB_Auto_Post_Manual.pdf.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DOCS_DIR = path.resolve("docs");
const OUTPUT_HTML = path.resolve("docs/manual_compiled.html");
const OUTPUT_PDF = path.resolve("docs/Vetechno_FB_Auto_Post_Manual.pdf");
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const CHAPTERS = [
  { file: "01_APPLICATION_OVERVIEW.md", title: "Chapter 1: Application Overview" },
  { file: "02_INSTALLATION_AND_SETUP.md", title: "Chapter 2: Installation & Setup" },
  { file: "03_CUSTOM_GPT_INTEGRATION.md", title: "Chapter 3: Custom GPT Integration" },
  { file: "04_ARCHITECTURE_AND_DIAGRAMS.md", title: "Chapter 4: Architecture & Diagrams" },
  { file: "05_USER_GUIDE.md", title: "Chapter 5: User Operations Guide" },
  { file: "06_TROUBLESHOOTING.md", title: "Chapter 6: Troubleshooting & Error Matrix" },
  { file: "07_SECURITY_AND_PRIVACY.md", title: "Chapter 7: Security & Privacy Guide" },
  { file: "08_LIMITATIONS_AND_ROADMAP.md", title: "Chapter 8: Limitations & Roadmap" },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const htmlOut: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableHeaderParsed = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        if (inList) { htmlOut.push("</ul>"); inList = false; }
        if (inTable) { htmlOut.push("</tbody></table>"); inTable = false; }
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        if (codeLang === "mermaid") {
          htmlOut.push(`<div class="mermaid">\n${codeBuffer.join("\n")}\n</div>`);
        } else {
          htmlOut.push(`<pre><code class="language-${codeLang}">${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        }
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Tables
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (inList) { htmlOut.push("</ul>"); inList = false; }
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

      // Check if this is a separator line (e.g. |---|---|)
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        tableHeaderParsed = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderParsed = false;
        htmlOut.push("<table><thead><tr>");
        for (const cell of cells) {
          htmlOut.push(`<th>${parseInline(cell)}</th>`);
        }
        htmlOut.push("</tr></thead><tbody>");
      } else {
        htmlOut.push("<tr>");
        for (const cell of cells) {
          htmlOut.push(`<td>${parseInline(cell)}</td>`);
        }
        htmlOut.push("</tr>");
      }
      continue;
    } else if (inTable) {
      htmlOut.push("</tbody></table>");
      inTable = false;
    }

    // Unordered lists
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        inList = true;
        htmlOut.push("<ul>");
      }
      const itemContent = trimmed.slice(2);
      htmlOut.push(`<li>${parseInline(itemContent)}</li>`);
      continue;
    } else if (inList && !trimmed.startsWith("  ") && trimmed !== "") {
      htmlOut.push("</ul>");
      inList = false;
    }

    // Blockquotes & Alerts
    if (trimmed.startsWith("> ")) {
      const bqText = trimmed.slice(2);
      htmlOut.push(`<blockquote>${parseInline(bqText)}</blockquote>`);
      continue;
    }

    // Headings
    if (trimmed.startsWith("# ")) {
      htmlOut.push(`<h1>${parseInline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      htmlOut.push(`<h2>${parseInline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      htmlOut.push(`<h3>${parseInline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      htmlOut.push(`<h4>${parseInline(trimmed.slice(5))}</h4>`);
      continue;
    }

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***") {
      htmlOut.push("<hr />");
      continue;
    }

    // Paragraph
    if (trimmed === "") {
      continue;
    }

    htmlOut.push(`<p>${parseInline(trimmed)}</p>`);
  }

  if (inTable) htmlOut.push("</tbody></table>");
  if (inList) htmlOut.push("</ul>");

  return htmlOut.join("\n");
}

function parseInline(text: string): string {
  let res = escapeHtml(text);
  // Bold
  res = res.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic
  res = res.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Inline Code
  res = res.replace(/`(.*?)`/g, "<code>$1</code>");
  // Links
  res = res.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  return res;
}

function buildCompleteHtml(): string {
  const chapterHtmls: string[] = [];

  for (const ch of CHAPTERS) {
    const filePath = path.join(DOCS_DIR, ch.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }
    const md = fs.readFileSync(filePath, "utf-8");
    const html = markdownToHtml(md);
    chapterHtmls.push(`
      <section class="chapter-page">
        ${html}
      </section>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vetechno FB Auto Post — Operations & Architecture Manual</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1a1a1a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }
    .cover-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 85vh;
      text-align: center;
      padding: 40px 20px;
    }
    .cover-badge {
      display: inline-block;
      background: #1877F2;
      color: #ffffff;
      padding: 6px 16px;
      font-size: 11pt;
      font-weight: 700;
      border-radius: 20px;
      margin-bottom: 24px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .cover-title {
      font-size: 32pt;
      font-weight: 900;
      color: #0f172a;
      margin: 0 0 16px 0;
      line-height: 1.15;
    }
    .cover-subtitle {
      font-size: 15pt;
      color: #475569;
      max-width: 650px;
      margin: 0 0 40px 0;
      line-height: 1.45;
    }
    .cover-meta {
      border-top: 2px solid #e2e8f0;
      padding-top: 24px;
      font-size: 10pt;
      color: #64748b;
      line-height: 1.8;
    }
    .toc-page {
      page-break-after: always;
      padding-top: 20px;
    }
    .chapter-page {
      page-break-after: always;
      padding-top: 10px;
    }
    h1 {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #1877F2;
      padding-bottom: 8px;
      margin-top: 24px;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 15pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 22px;
      margin-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    h3 {
      font-size: 12pt;
      font-weight: 600;
      color: #334155;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    p {
      margin: 0 0 10px 0;
    }
    ul, ol {
      margin: 0 0 12px 0;
      padding-left: 24px;
    }
    li {
      margin-bottom: 4px;
    }
    pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 9pt;
      overflow-x: auto;
      margin: 10px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 9.5pt;
      color: #0f172a;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    blockquote {
      border-left: 4px solid #1877F2;
      background: #eff6ff;
      margin: 12px 0;
      padding: 8px 14px;
      color: #1e3a8a;
      font-size: 9.5pt;
    }
    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
    .mermaid {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      text-align: center;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dotted #cbd5e1;
      padding: 6px 0;
      font-size: 11pt;
    }
    .toc-item a {
      text-decoration: none;
      color: #0f172a;
      font-weight: 600;
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-badge">Official Architecture & Operations Manual</div>
    <div class="cover-title">Vetechno FB Auto Post</div>
    <div class="cover-subtitle">
      AI-Assisted Social Media Content Bridge, Multi-Page Facebook Management & Publishing Platform
    </div>
    <div class="cover-meta">
      <strong>Product Version:</strong> 2.0 (Multi-Page & Custom GPT Actions Edition)<br>
      <strong>Application URL:</strong> https://fbautopost.vetechno.in<br>
      <strong>Custom GPT:</strong> Vetechno FB Auto Post<br>
      <strong>Date of Compilation:</strong> October 2026 | Production Documentation Set
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc-page">
    <h1>Table of Contents</h1>
    <div style="margin-top: 24px;">
      <div class="toc-item"><span>Chapter 1: Application Overview</span><span>Page 3</span></div>
      <div class="toc-item"><span>Chapter 2: Installation and Setup Guide</span><span>Page 5</span></div>
      <div class="toc-item"><span>Chapter 3: Custom GPT Integration & Actions</span><span>Page 8</span></div>
      <div class="toc-item"><span>Chapter 4: Architecture & Mermaid Diagrams</span><span>Page 11</span></div>
      <div class="toc-item"><span>Chapter 5: User Operations & Workflow Guide</span><span>Page 15</span></div>
      <div class="toc-item"><span>Chapter 6: Troubleshooting & Error Matrix</span><span>Page 18</span></div>
      <div class="toc-item"><span>Chapter 7: Security, Privacy & Authorization</span><span>Page 21</span></div>
      <div class="toc-item"><span>Chapter 8: Limitations, Realities & Roadmap</span><span>Page 24</span></div>
    </div>
  </div>

  <!-- Chapter Content -->
  ${chapterHtmls.join("\n")}

</body>
</html>
`;
}

async function main() {
  console.log("Generating compiled HTML manual...");
  const html = buildCompleteHtml();
  fs.writeFileSync(OUTPUT_HTML, html, "utf-8");
  console.log(`Saved HTML manual to: ${OUTPUT_HTML}`);

  console.log(`Rendering PDF via Microsoft Edge headless: ${EDGE_PATH}...`);
  if (!fs.existsSync(EDGE_PATH)) {
    console.error(`Edge executable not found at: ${EDGE_PATH}`);
    process.exit(1);
  }

  const fileUrl = `file:///${OUTPUT_HTML.replace(/\\/g, "/")}`;
  const cmd = `"${EDGE_PATH}" --headless --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${OUTPUT_PDF}" "${fileUrl}"`;

  try {
    execSync(cmd, { stdio: "inherit", timeout: 45000 });
  } catch (err) {
    console.error("PDF generation command encountered an error:", err);
    process.exit(1);
  }

  if (fs.existsSync(OUTPUT_PDF)) {
    const stats = fs.statSync(OUTPUT_PDF);
    console.log(`\n🎉 PDF Manual successfully generated:`);
    console.log(`   Path: ${OUTPUT_PDF}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB\n`);
  } else {
    console.error("PDF generation failed: Output file not found.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
