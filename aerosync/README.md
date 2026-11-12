# AeroSync

A multi-constraint database system for integrated airport scheduling and resource allocation.
AeroSync assigns gates and baggage carousels to flights (best fit by aircraft wingspan), prevents
double-booking with triggers and locked transactions, re-routes flights automatically after delays,
validates ground-crew tasks, and lets staff search operational logs by meaning (vector search).

## Tech stack
- **Next.js** (App Router, Route Handlers) + Tailwind CSS
- **MySQL 8** - structured, transactional data (10 tables, triggers, procedures, functions, views)
- **Pinecone** - vector database for semantic search over flight logs (`llama-text-embed-v2`, cosine)
- *(optional)* **MongoDB** - document store for tracking-device telemetry

## Prerequisites
Node.js 22 LTS or newer, MySQL Server 8.0.16+ with MySQL Workbench, Git, a free Pinecone account.

## Setup
1. `git clone https://github.com/YOUR_USER/aerosync.git && cd aerosync`
2. `npm install`
3. In MySQL Workbench (as root) run, in order: `db/schema.sql`, `db/advanced.sql`, `db/seed.sql`
4. Edit the password in `db/app_user.sql`, run it as root
5. Copy `.env.example` to `.env.local` and fill in every value
6. `node --env-file=.env.local scripts/seed-users.mjs`
7. `node --env-file=.env.local scripts/pinecone-setup.mjs`
8. `npm run dev` and open http://localhost:3000

## Demo logins (development only)
| Username | Password | Role |
|---|---|---|
| admin | Admin123! | Admin (full control) |
| staff | Staff123! | Ground_Staff (read, status updates, shifts, logs) |

## Database scripts
| File | Purpose |
|---|---|
| `db/schema.sql` | DDL: tables, keys, CHECK constraints, indexes, FULLTEXT index |
| `db/advanced.sql` | functions, procedures, triggers, views |
| `db/seed.sql` | mock data |
| `db/app_user.sql` | least-privilege MySQL account for the app |
| `db/ddl_demo.sql` | ALTER / DROP demonstration |
| `db/tests.sql` | test cases T1-T16 |
| `db/concurrency_demo.sql` | two-session locking demo |

## Team contributions
| Member | Responsibilities |
|---|---|
| Member A (name, SRN) | MySQL schema, triggers, procedures, seed data, Pinecone script, logs + crew API |
| Member B (name, SRN) | Next.js UI, authentication, dashboard API, views and analytic queries, test cases |
