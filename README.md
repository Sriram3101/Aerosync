# AeroSync

A multi-constraint database system for integrated airport scheduling and resource allocation.
AeroSync assigns gates and baggage carousels to flights (best fit by aircraft wingspan), prevents
double-booking with triggers and locked transactions, re-routes flights automatically after delays,
validates ground-crew tasks, and lets staff search operational logs by meaning (vector search).

## Tech stack
- **Next.js 15** (App Router, Route Handlers) + Tailwind CSS
- **MySQL 8** - structured, transactional data (10 tables, 5 triggers, 4 procedures, 2 functions, 3 views)
- **Pinecone** - vector database for semantic search over flight logs (`llama-text-embed-v2`, cosine)
- **Auth** - sign-in and sign-up, bcrypt password hashes, JWT in an httpOnly cookie, two roles (Admin, Ground_Staff)

## Prerequisites
Node.js 22 LTS or newer, MySQL Server 8.0.16+ with MySQL Workbench, Git, a free Pinecone account.

## Setup
1. `git clone https://github.com/YOUR_USER/aerosync.git && cd aerosync`
2. `npm install`
3. In MySQL Workbench (as root) run, in order: `db/schema.sql`, `db/advanced.sql`, `db/seed.sql`
4. Edit the password in `db/app_user.sql` (replace `CHANGE_ME_Strong#2026`), run it as root.
   **Never commit your real password:** commit that file only with the placeholder.
5. Copy `.env.example` to `.env.local` and fill in every value. The DB password must match step 4.
   `.env.local` is git-ignored and must stay out of the repo.
6. `node --env-file=.env.local scripts/seed-users.mjs`
7. `node --env-file=.env.local scripts/pinecone-setup.mjs`
8. `npm run dev` and open http://localhost:3000

## Logins and roles
| Username | Password | Role |
|---|---|---|
| admin | Admin123! | Admin (full control: add/delete flights and crew, assign, delay, any status) |
| staff | Staff123! | Ground_Staff (view, mark Arrived/Departed, crew shifts, operational logs) |

These demo logins are for development only.

**Sign-up:** the login page has a Sign up option. Usernames are 3-50 characters (letters, numbers or `_ . @ + -`,
so an email works) and passwords 8-72 characters. Every new account is created as **Ground_Staff**.
There is no way to become Admin from the browser. To promote a user, run in MySQL:
`UPDATE Users SET role='Admin' WHERE username='name';` (the user must log in again).

## Log search
The Log search page does semantic (vector) search through Pinecone, with an optional category filter.
Saving a log writes it to MySQL (`Flight_Logs`) and embeds it in Pinecone as `log-<log_id>`, which is
stored in `Flight_Logs.vector_id`. If you edit or delete a log in one place, do the same in the other.

## Database scripts
| File | Purpose |
|---|---|
| `db/schema.sql` | DDL: tables, keys, CHECK constraints, indexes, FULLTEXT index (kept in the DB, not used by the app) |
| `db/advanced.sql` | functions, procedures, triggers, views |
| `db/seed.sql` | mock data |
| `db/app_user.sql` | least-privilege MySQL account for the app (placeholder password) |
| `db/ddl_demo.sql` | ALTER / DROP demonstration |
| `db/tests.sql` | test cases T1-T19 (includes correlated subquery, window functions and CTE) |
| `db/concurrency_demo.sql` | two-session locking demo |

## Team contributions
| Member | Responsibilities |
|---|---|
| Sriram K (PES1UG24CS468) | MySQL schema, triggers, procedures, seed data, Pinecone script, logs + crew API |
| Sriram S (PES1UG24CS469) | Next.js UI, authentication and sign-up, dashboard API, views and analytic queries, test cases |