# Vetechno FB Auto Post

> **AI-Assisted Social Media Content Workflow & Multi-Page Facebook Publishing Platform**  
> Connects your conversational content generation in ChatGPT with a centralized dashboard for image-hosted drafts, approval safeguards, visual calendar scheduling, and supported Facebook publishing operations.

---

## 🌟 Key Capabilities

- **Custom GPT Content Creation Bridge:** Leverage your existing ChatGPT Plus or Team subscription via the configured Custom GPT (**Vetechno FB Auto Post**) with **zero third-party AI billing** on the server.
- **Original Asset Preservation:** Transfers native DALL-E 3 generated images directly from ChatGPT into permanent Supabase Storage (`post-images`) to guarantee high-resolution assets with no expiring links.
- **Multi-Facebook-Page Management:** Connect multiple Facebook Pages through Meta OAuth, store individual non-expiring Page tokens securely, and target posts to specific Pages.
- **Human-in-the-Loop Safeguards:** Mandatory draft review with cryptographic SHA-256 content hashing and single-use approval tokens to prevent unauthorized or modified publishing.
- **Interactive Content Calendar:** Plan, inspect, schedule, and reschedule posts in your local timezone with automatic UTC roundtripping.
- **Zero-Trust Public Marketing Site:** Modern public marketing presence at `/`, `/about`, `/how-it-works`, `/requirements`, `/benefits`, `/limitations`, and `/privacy` with sanitized demo data and complete isolation from private account records.
- **Hardened Database Security:** Row Level Security (RLS) enabled across all tables, locking anonymous PostgREST access strictly to the server-side `service_role`.

---

## 📚 Complete Documentation Set

All in-depth architecture, setup, and troubleshooting guides are available in the [`docs/`](./docs) directory:

| Guide | Description |
| :--- | :--- |
| **[01. Application Overview](./docs/01_APPLICATION_OVERVIEW.md)** | Core features, components, and workflow architecture. |
| **[02. Installation & Setup](./docs/02_INSTALLATION_AND_SETUP.md)** | Prerequisites, environment variables, Supabase migrations, and Meta app setup. |
| **[03. Custom GPT Integration](./docs/03_CUSTOM_GPT_INTEGRATION.md)** | OpenAPI Action schemas, instructions prompt, and image import pipeline. |
| **[04. Architecture & Diagrams](./docs/04_ARCHITECTURE_AND_DIAGRAMS.md)** | Mermaid sequence diagrams, state machines, and system architecture. |
| **[05. User Guide](./docs/05_USER_GUIDE.md)** | Complete walkthrough: login, connecting Pages, staging requests, Queue, and Calendar. |
| **[06. Troubleshooting & FAQ](./docs/06_TROUBLESHOOTING.md)** | Diagnoses for OAuth issues, missing Pages, Action errors, and publishing fixes. |
| **[07. Security & Privacy](./docs/07_SECURITY_AND_PRIVACY.md)** | Three-tier auth model, RLS policies, SSRF prevention, and anti-tamper controls. |
| **[08. Limitations & Roadmap](./docs/08_LIMITATIONS_AND_ROADMAP.md)** | Operational boundaries, Meta App Review requirements, and upcoming features. |
| **[Vetechno FB Auto Post Operations Manual (PDF)](./docs/Vetechno_FB_Auto_Post_Manual.pdf)** | Compiled, offline-readable PDF operations manual. |

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/vikashrancho/facebook-auto-bot.git
cd facebook-auto-bot
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and configure your credentials:
```bash
cp .env.example .env.local
```

Required keys:
```ini
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJh..."
ADMIN_PASSWORD="YourStrongPassword123!"
SESSION_SECRET="openssl rand -base64 32"
INTEGRATION_API_KEY="m2m_sec_..."
```

### 3. Apply Supabase Database Migrations
Run the SQL scripts in **Supabase Dashboard > SQL Editor** in order:
1. `supabase/schema.sql` (Base tables)
2. `supabase/migrations/20261018_content_requests.sql` (Content requests)
3. `supabase/migrations/20261020_content_calendar_and_scheduling.sql` (Calendar)
4. `supabase/migrations/20261021_multi_page_support.sql` (Multi-Page support)
5. `supabase/migrations/20261022_enable_rls_lockdown.sql` (RLS lockdown)

### 4. Run Development Server
```bash
npm run dev
```
Visit `http://localhost:3000` to view the public website, or `http://localhost:3000/login` to access the authenticated dashboard.

### 5. Run Verification & Regression Tests
```bash
npm test
```
Executes all 173 automated tests covering security regression, OpenAPI integration, calendar scheduling, Facebook OAuth lifecycle, and multi-page publishing.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 16.3.4 (App Router, Turbopack)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database & Storage:** Supabase PostgreSQL with RLS & S3-compatible Storage
- **Social Integration:** Meta Graph API v22.0
- **AI Engine:** ChatGPT Custom GPT with OpenAPI 3.1.0 Actions
- **Deployment:** Vercel

---

## 📄 License & Ownership

Private and proprietary SaaS application. Developed for secure Facebook Page management and ChatGPT content workflows.
