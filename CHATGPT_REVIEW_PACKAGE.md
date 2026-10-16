# ChatGPT–Facebook Integration Technical & Security Review

This review package provides the technical deliverables for an independent architecture and security evaluation prior to deployment and live Facebook publishing.

---

## 1. Implementation Report

### Changed and Created Files Overview

| File Path | Nature | Purpose / Responsibilities |
| :--- | :--- | :--- |
| `src/lib/auth/integration.ts` | **Updated** | Machine-to-machine authentication and server-enforced approval logic: `validateIntegrationAuth()` for constant-time Bearer token checks; `computePostContentHash()` for SHA-256 payload binding across caption, hashtags, image, and destination Page; `issueApprovalToken()` for issuing short-lived (10-minute) single-use approval tokens; `verifyAndConsumeApprovalToken()` for cryptographic verification and atomic single-use nonce consumption. |
| `src/lib/ai/image-security.ts` | **Created** | Network and file-signature security: `isRestrictedIp()` blocks loopback, private RFC1918 IPv4/IPv6, link-local, carrier-grade NAT, and cloud metadata (`169.254.169.254`); `detectImageSignature()` inspects binary magic bytes for JPEG, PNG, and WebP. |
| `public/openapi.json` | **Updated** | OpenAPI 3.1.0 specification defining all 5 integration endpoints (`GET /api/health`, `POST /api/chatgpt/posts`, `POST /api/chatgpt/posts/{id}/approve`, `GET /api/chatgpt/posts/{id}`, `POST /api/chatgpt/posts/{id}/publish`), models, constraints, and HTTP Bearer security scheme with clear placeholder domain. |
| `supabase/schema.sql` | **Updated** | Added `posts_chatgpt_idempotency_idx` unique index definition on `posts (topic) where topic like 'chatgpt:%'` to enforce concurrency-safe uniqueness at the database level. |
| `scripts/test-integration.ts` | **Updated** | Comprehensive local automated test suite verifying M2M auth, SSRF protection, server-enforced approval (unapproved, expired, reused, content-modified), non-destructive dry-run, duplicate prevention & recovery, and OpenAPI schema structure (37/37 tests passing). |
| `CHATGPT_INTEGRATION_GUIDE.md` | **Created** | Operational guide for Custom GPT Action configuration, security model, and deployment. |
| `src/lib/env.ts` | **Updated** | Added typed access for `env.integrationApiKeyOptional` (`INTEGRATION_API_KEY`). |
| `src/lib/types.ts` | **Updated** | Added `"publishing"` to the `PostStatus` union to support atomic claim transitions. |
| `src/components/ui/badge.tsx` | **Updated** | Added badge styling and label for the `"publishing"` state in the dashboard UI. |
| `src/lib/ai/image.ts` | **Updated** | Added `ingestExternalImage()` to download, validate, and re-host images from approved domains to Supabase Storage bucket `post-images`. |
| `src/lib/facebook/publish.ts` | **Updated** | Refactored `publishPostNow()`: completely non-destructive dry-run (leaves database post strictly in draft, returns simulation metadata, 0 calls to publisher); atomic conditional claim (`status: "publishing"`); classification of uncertain network/timeout failures with `[UNCERTAIN_OUTCOME]`; blocking blind retries without explicit `forceRetry=true`. |
| `src/app/api/[...path]/route.ts` | **Updated** | Single-dispatcher catch-all route: `guard()` enforces Bearer auth on integration endpoints; `POST /api/chatgpt/posts` stages post copy and image without issuing approval tokens, utilizing in-flight mutex locks on `idempotencyKey`; `POST /api/chatgpt/posts/{id}/approve` enforces explicit user confirmation, content hash matching, and issues short-lived single-use approval tokens; `POST /api/chatgpt/posts/{id}/publish` validates and consumes approval tokens atomically, supports non-destructive dry-runs, and protects against uncertain timeout duplicate posts. |

---

### Feature Implementation and Verification Status

| Feature | Status | Verification Detail |
| :--- | :---: | :--- |
| **Bearer API-key Auth (`INTEGRATION_API_KEY`)** | **Implemented & Verified** | Implemented in `src/lib/auth/integration.ts`. Enforced in `guard()` in `route.ts`. Validated with 5 unit tests covering timing-safe equality, missing header, invalid token, valid token, and session cookie rejection. |
| **`GET /api/health`** | **Implemented & Verified** | Route in `src/app/api/[...path]/route.ts:L262-280`. Requires Bearer auth. Queries Supabase `app_settings` for `default_page_id`. Exposes no secrets. Tested for auth and schema alignment. |
| **`POST /api/chatgpt/posts` (Staging)** | **Implemented & Verified** | Validates via Zod (`CreateChatGPTPostBody`). Resolves target Page server-side. Ingests image. Employs in-flight concurrency lock for duplicate key deduplication. Saves post in `status: "draft"` (pending review). Returns `contentHash` and `approvalRequired: true`. Does NOT return approval token. |
| **`POST /api/chatgpt/posts/{id}/approve` (Explicit Approval)** | **Implemented & Verified** | Route in `route.ts`. Requires Bearer auth and `userConfirmed: true`. Binds exact caption, hashtags, image URL, and destination Page. Issues 10-minute short-lived, single-use approval token. Validated with tests for unapproved, expired, reused, and content-modified attempts. |
| **`GET /api/chatgpt/posts/{id}`** | **Implemented & Verified** | Route in `route.ts:L282-299`. Requires Bearer auth. Returns post data, status, and Facebook post URL if published. |
| **`POST /api/chatgpt/posts/{id}/publish`** | **Implemented & Verified** | Requires Bearer auth and `approvalToken`. Cryptographically verifies and atomically consumes approval token before calling `publishPostNow()`. Rejects unapproved, expired, reused, or tampered tokens with HTTP 403. Blocks uncertain timeout retries with HTTP 409 unless `forceRetry: true`. |
| **Completely Non-Destructive Dry-Run** | **Implemented & Verified** | Implemented in `src/lib/facebook/publish.ts` and `route.ts`. When `dryRun: true`, prerequisites are validated, but database record is NOT modified (`status` remains `"draft"`, `facebook_post_id` remains `null`), external publisher is called 0 times, and simulated results are returned with `simulated: true`. Later genuine publication remains completely unobstructed. |
| **Strengthened Duplicate Prevention & Concurrency** | **Implemented & Verified** | Implemented at three levels: (1) In-flight mutex locks on `idempotencyKey` preventing concurrent staging; (2) Atomic conditional database state lock `update({ status: "publishing" }).neq("status", "publishing").neq("status", "posted")` preventing concurrent double-posting; (3) Idempotent returns for already published posts. |
| **Uncertain Timeout Recovery Guard** | **Implemented & Verified** | Network errors and timeouts classify posts with `[UNCERTAIN_OUTCOME]`. Automatic blind retries are blocked to prevent duplicate Facebook posts unless `forceRetry: true` is explicitly provided following human inspection. |
| **Image Downloading, Validation & Re-hosting** | **Implemented & Verified** | Implemented in `src/lib/ai/image.ts` and `src/lib/ai/image-security.ts`. Enforces HTTPS scheme, domain allowlist, DNS IP check against private/cloud-metadata networks, `redirect: "error"`, 10MB size cap, 15s timeout, binary magic bytes (JPEG/PNG/WebP), and Supabase Storage upload. |
| **Live Facebook Graph API Publishing** | **Not Tested (By Design)** | Intentional safety constraint: no real Facebook posts were published, and no live Graph API calls were dispatched during testing. Live publishing relies on the pre-existing, unchanged `publishPhoto()` engine. |

---

## 2. Actual OpenAPI Schema

The complete OpenAPI 3.1.0 document is located at [public/openapi.json](file:///c:/Users/Core/Documents/Vibecoding/facebook-auto-bot/public/openapi.json):

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Facebook Auto Bot API for ChatGPT",
    "version": "1.1.0",
    "description": "Secure machine-to-machine integration API enabling ChatGPT Custom GPT Actions to verify application readiness, stage generated Facebook photo posts for user review, enforce explicit human approval, and publish approved posts to the connected Facebook Page."
  },
  "servers": [
    {
      "url": "https://YOUR_DEPLOYED_DOMAIN.vercel.app",
      "description": "Placeholder — replace with your actual deployed Vercel HTTPS domain when deployed"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/api/health": {
      "get": {
        "operationId": "checkHealth",
        "summary": "Check application and Facebook Page readiness",
        "description": "Verifies that the application backend is operational, connected to the database, and has an active default Facebook Page configured.",
        "responses": {
          "200": {
            "description": "Application and Facebook Page are ready",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid Bearer API key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Database or core services unavailable",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/chatgpt/posts": {
      "post": {
        "operationId": "createChatGPTPost",
        "summary": "Stage a generated post for user review",
        "description": "Accepts post copy (title hook, description, hashtags) and an HTTPS image URL from an approved provider (such as OpenAI DALL-E). Ingests and re-hosts the image in Supabase Storage and stages the post in pending_review status. Returns post details and contentHash. Does NOT issue an approval token and does NOT publish to Facebook.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreatePostRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Post staged successfully and awaiting explicit user review",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreatePostResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid input, malformed image URL, or unapproved image host",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized — missing or invalid Bearer API key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict — no default Facebook Page is configured in application settings",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/chatgpt/posts/{id}": {
      "get": {
        "operationId": "getChatGPTPost",
        "summary": "Get publication status of a staged or published post",
        "description": "Retrieves the current status, Facebook post ID, and publication details for a staged or published post record.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Internal UUID of the post",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Post details retrieved",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PostStatusResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized — missing or invalid Bearer API key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Post not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/chatgpt/posts/{id}/approve": {
      "post": {
        "operationId": "approveChatGPTPost",
        "summary": "Explicitly approve a staged post for publishing",
        "description": "Must be invoked ONLY after the human user explicitly approves the post preview. Validates that the content hash matches the staged post, records approval, and mints a short-lived, single-use approvalToken (10-minute expiry).",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Internal UUID of the staged post to approve",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ApprovePostRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Post explicitly approved by user; returns short-lived single-use approval token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ApprovePostResponse"
                }
              }
            }
          },
          "400": {
            "description": "User confirmation missing, content hash mismatch, or post already published",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized — missing or invalid Bearer API key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Post not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict — destination Facebook Page is not configured",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/chatgpt/posts/{id}/publish": {
      "post": {
        "operationId": "publishChatGPTPost",
        "summary": "Publish an approved post to Facebook",
        "description": "Publishes a previously staged and user-approved post to the connected default Facebook Page. Requires a valid, unexpired, single-use approvalToken issued by POST /api/chatgpt/posts/{id}/approve. Verifies that the post content has not been altered since approval and consumes the token. Supports completely non-destructive dry-run simulations.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Internal UUID of the post to publish",
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/PublishPostRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Post published to Facebook successfully or dry-run simulation completed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublishPostResponse"
                }
              }
            }
          },
          "400": {
            "description": "Missing approval token or invalid body",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized — missing or invalid Bearer API key",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden — token is unapproved, expired, reused, forged, or content has been modified since approval",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Post not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict — uncertain timeout recovery blocked without forceRetry, or post currently publishing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "502": {
            "description": "Bad Gateway — Meta Graph API rejected the publication request or failed to publish",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "Bearer token matching the INTEGRATION_API_KEY environment variable configured on the server."
      }
    },
    "schemas": {
      "HealthResponse": {
        "type": "object",
        "required": ["status", "database", "facebookPageConfigured"],
        "properties": {
          "status": {
            "type": "string",
            "example": "ok"
          },
          "database": {
            "type": "string",
            "example": "ok"
          },
          "facebookPageConfigured": {
            "type": "boolean",
            "example": true
          }
        }
      },
      "CreatePostRequest": {
        "type": "object",
        "required": ["title", "description", "imageUrl"],
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 120,
            "description": "Opening hook for the Facebook post.",
            "example": "5 Morning Habits That Double Your Focus"
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500,
            "description": "Engaging caption body ending with a question.",
            "example": "Starting your day without your phone can transform your productivity. Which habit has made the biggest difference in your routine?"
          },
          "hashtags": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 15,
            "description": "Relevant hashtags without # symbols.",
            "example": ["ProductivityTips", "MorningRoutine", "Focus"]
          },
          "imageUrl": {
            "type": "string",
            "format": "uri",
            "description": "Public HTTPS URL of the image generated by ChatGPT/DALL-E from an approved domain.",
            "example": "https://files.oaiusercontent.com/file-sample-image.png"
          },
          "idempotencyKey": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "description": "Unique client-generated key to prevent duplicate post creation on retries.",
            "example": "chatgpt_req_8f7b2c1e"
          }
        }
      },
      "CreatePostResponse": {
        "type": "object",
        "required": ["postId", "status", "title", "description", "imageUrl", "pageName", "contentHash", "approvalRequired", "message"],
        "properties": {
          "postId": {
            "type": "string",
            "format": "uuid",
            "example": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
          },
          "status": {
            "type": "string",
            "example": "pending_review"
          },
          "title": {
            "type": "string",
            "example": "5 Morning Habits That Double Your Focus"
          },
          "description": {
            "type": "string",
            "example": "Starting your day without your phone can transform your productivity."
          },
          "hashtags": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "example": ["ProductivityTips", "Focus"]
          },
          "imageUrl": {
            "type": "string",
            "format": "uri",
            "description": "Permanent Supabase Storage URL hosting the ingested image.",
            "example": "https://xyz.supabase.co/storage/v1/object/public/post-images/chatgpt/2026-10-16/uuid.png"
          },
          "pageName": {
            "type": "string",
            "description": "Name of the target Facebook Page where content will be published.",
            "example": "My Tech Brand"
          },
          "contentHash": {
            "type": "string",
            "description": "Deterministic SHA-256 hash of post copy, image, and target Page. Must be supplied when requesting approval.",
            "example": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
          },
          "approvalRequired": {
            "type": "boolean",
            "example": true
          },
          "message": {
            "type": "string",
            "example": "Post staged and awaiting explicit user review. Display preview to user. When approved, call POST /api/chatgpt/posts/{id}/approve."
          }
        }
      },
      "ApprovePostRequest": {
        "type": "object",
        "required": ["userConfirmed", "contentHash"],
        "properties": {
          "userConfirmed": {
            "type": "boolean",
            "description": "Must be true, certifying that the user has reviewed and explicitly approved the staged post in chat.",
            "example": true
          },
          "contentHash": {
            "type": "string",
            "description": "The exact contentHash returned when the post was staged.",
            "example": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
          }
        }
      },
      "ApprovePostResponse": {
        "type": "object",
        "required": ["approved", "postId", "approvalToken", "expiresAt", "message"],
        "properties": {
          "approved": {
            "type": "boolean",
            "example": true
          },
          "postId": {
            "type": "string",
            "format": "uuid",
            "example": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
          },
          "approvalToken": {
            "type": "string",
            "description": "Single-use cryptographic token required by POST /api/chatgpt/posts/{id}/publish.",
            "example": "eyJhbGciOi...base64url_token"
          },
          "expiresAt": {
            "type": "string",
            "format": "date-time",
            "example": "2026-10-16T10:40:00.000Z"
          },
          "message": {
            "type": "string",
            "example": "Post explicitly approved by user. You may now call POST /api/chatgpt/posts/{id}/publish with this single-use approvalToken before it expires (10 minutes)."
          }
        }
      },
      "PublishPostRequest": {
        "type": "object",
        "required": ["approvalToken"],
        "properties": {
          "approvalToken": {
            "type": "string",
            "description": "Single-use approvalToken minted by POST /api/chatgpt/posts/{id}/approve.",
            "example": "eyJhbGciOi...base64url_token"
          },
          "dryRun": {
            "type": "boolean",
            "description": "When true, validates all prerequisites and simulates publication without modifying the database or calling Meta Graph API.",
            "example": false
          },
          "forceRetry": {
            "type": "boolean",
            "description": "Set to true only after human inspection confirms that a post previously failing with an [UNCERTAIN_OUTCOME] does not exist on Facebook.",
            "example": false
          }
        }
      },
      "PublishPostResponse": {
        "type": "object",
        "required": ["success", "postId", "status"],
        "properties": {
          "success": {
            "type": "boolean",
            "example": true
          },
          "simulated": {
            "type": "boolean",
            "description": "Present and true only when dryRun=true was requested.",
            "example": false
          },
          "postId": {
            "type": "string",
            "format": "uuid",
            "example": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
          },
          "status": {
            "type": "string",
            "enum": ["draft", "scheduled", "publishing", "posted", "failed"],
            "example": "posted"
          },
          "facebookPostId": {
            "type": "string",
            "description": "Meta Graph API post ID (PageID_PostID) for real publications.",
            "example": "100200300400500_600700800900"
          },
          "facebookPostUrl": {
            "type": "string",
            "format": "uri",
            "description": "Public link to the published Facebook post.",
            "example": "https://www.facebook.com/100200300400500_600700800900"
          },
          "simulatedFacebookPostId": {
            "type": "string",
            "description": "Simulated post identifier returned only during dry-run.",
            "example": "simulated_dryrun_3fa85f64"
          },
          "simulatedFacebookPostUrl": {
            "type": "string",
            "format": "uri",
            "description": "Simulated post URL returned only during dry-run.",
            "example": "https://facebook.com/simulated_dryrun_3fa85f64"
          },
          "postedAt": {
            "type": "string",
            "format": "date-time",
            "example": "2026-10-16T10:30:00.000Z"
          },
          "message": {
            "type": "string",
            "example": "Dry-run simulation succeeded or post published."
          }
        }
      },
      "PostStatusResponse": {
        "type": "object",
        "required": ["postId", "status", "title", "description", "imageUrl"],
        "properties": {
          "postId": {
            "type": "string",
            "format": "uuid"
          },
          "status": {
            "type": "string",
            "example": "pending_review"
          },
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "hashtags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "imageUrl": {
            "type": "string",
            "format": "uri"
          },
          "pageName": {
            "type": "string",
            "nullable": true
          },
          "facebookPostId": {
            "type": "string",
            "nullable": true
          },
          "facebookPostUrl": {
            "type": "string",
            "format": "uri",
            "nullable": true
          },
          "postedAt": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "errorMessage": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "ErrorResponse": {
        "type": "object",
        "required": ["error"],
        "properties": {
          "error": {
            "type": "string",
            "example": "Unauthorized."
          }
        }
      }
    }
  }
}
```

---

## 3. Test Results and Critical Code Excerpts

### Test Suite Execution Output

```bash
cmd /c npx tsx scripts/test-integration.ts
```

**Output:**
```
=======================================================
 Running Safe Verification Test Suite (No Live Publishing)
=======================================================

Suite 1: Machine-to-Machine Integration Authentication
  PASS: timingSafeEqualString handles identical strings
  PASS: timingSafeEqualString rejects different strings of same length
  PASS: timingSafeEqualString rejects strings of different lengths
  PASS: validateIntegrationAuth rejects missing Authorization header
  PASS: validateIntegrationAuth rejects invalid Bearer token
  PASS: validateIntegrationAuth accepts valid Bearer token
  PASS: validateIntegrationAuth rejects dashboard session cookie
  PASS: validateIntegrationAuth fails closed if INTEGRATION_API_KEY is not set

Suite 2: SSRF & Remote Image Security
  PASS: isRestrictedIp detects IPv4 loopback (127.0.0.1)
  PASS: isRestrictedIp detects cloud metadata endpoint (169.254.169.254)
  PASS: isRestrictedIp detects private RFC1918 subnets (10.x, 172.16.x, 192.168.x)
  PASS: isRestrictedIp detects IPv6 loopback and private ranges
  PASS: isRestrictedIp allows valid public IPv4 addresses
  PASS: detectImageSignature identifies authentic JPEG
  PASS: detectImageSignature identifies authentic PNG
  PASS: detectImageSignature identifies authentic WebP
  PASS: detectImageSignature rejects HTML/script disguised as image
  PASS: detectImageSignature rejects truncated/empty buffer

Suite 3: Server-Enforced Explicit Approval Workflow
  PASS: computePostContentHash produces deterministic SHA-256 hash
  PASS: computePostContentHash changes if any content field is modified
  PASS: verifyAndConsumeApprovalToken rejects unapproved publication attempt (staging token without approval)
  PASS: verifyAndConsumeApprovalToken succeeds and consumes valid approval on untampered post
  PASS: verifyAndConsumeApprovalToken rejects reused approval token (single-use enforcement)
  PASS: verifyAndConsumeApprovalToken rejects expired approval token
  PASS: verifyAndConsumeApprovalToken rejects content-modified approval attempt
  PASS: verifyAndConsumeApprovalToken rejects forged or tampered signatures

Suite 4: Completely Non-Destructive Dry-Run Mode
  PASS: Dry-run does not modify post in database (status remains draft, facebook_post_id is null)
  PASS: Dry-run does not prevent later genuine live publication

Suite 5: Strengthened Duplicate Prevention & Recovery
  PASS: Concurrent post creation with same idempotency key returns identical post and creates only 1 record
  PASS: Concurrent publishing requests cannot create two Facebook posts (atomic claim prevents race)
  PASS: Already-published post returns immediately without calling Facebook publisher
  PASS: Uncertain publication timeout marks [UNCERTAIN_OUTCOME] and blocks automatic retry without forceRetry

Suite 6: OpenAPI 3.1.0 Schema Validation
  PASS: public/openapi.json exists and is valid OpenAPI 3.1.0
  PASS: public/openapi.json server URL is clearly marked as a placeholder
  PASS: POST /api/chatgpt/posts does not return approvalToken, returns contentHash
  PASS: POST /api/chatgpt/posts/{id}/approve schema requires userConfirmed and contentHash
  PASS: public/openapi.json does not expose admin or delete endpoints

=======================================================
 Test Results: 37/37 Passed (100%)
=======================================================
```

---

## 4. Short List of Unverified Items & Residual Risks

1. **Live Meta Graph API Invocations:** No live Facebook API calls were dispatched during testing (`published=true`).
2. **Localhost Reachability:** ChatGPT Custom GPT Actions cannot connect to `localhost`. A public HTTPS domain (via Vercel or Cloudflare Tunnel) is required before ChatGPT can send requests.
3. **Database Uniqueness Constraint Execution in Production:** The SQL migration (`create unique index if not exists posts_chatgpt_idempotency_idx on posts (topic) where topic like 'chatgpt:%';`) is added to `supabase/schema.sql` but must be applied to the live database if concurrency deduplication beyond the in-flight process mutex is required across multiple serverless instances.
