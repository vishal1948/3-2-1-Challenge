# 3-2-1 Challenge

A task management app built around a simple idea: **priority only means something when it's limited.**

Instead of a flat to-do list, tasks are organized into three tiers:
- **3** Today goals
- **2** Weekly goals
- **1** Monthly goal

Plus a history table to track completed goals over time.

## Why

Most to-do apps let you add unlimited tasks with no real forcing function for priority. This app fixes that by capping how many "important" things you can have active at once — 3 daily, 2 weekly, 1 monthly.

## Tech Stack

- **Backend:** Node.js, Express
- **Views:** EJS
- **Frontend interactivity:** jQuery
- **Database:** PostgreSQL (Neon, managed/serverless)
- **Auth:** Session-based, via `express-session` + `connect-pg-simple` (sessions persisted in Postgres, not memory)
- **Hosting:** Render

## Features

- Create/manage Today, Weekly, and Monthly goals
- Mark goals complete → automatically logged to history
- Delete individual history entries
- Multi-user support with full data isolation (`user_id` scoping on all tables)
- Signup / login / logout

## Architecture Notes

- Database connection via `pg.Pool`, configured from a `DATABASE_URL` environment variable
- Sessions stored in Postgres so login state survives server restarts and works correctly across Render's infrastructure
- **Production gotcha:** Render sits behind a reverse proxy, so secure session cookies require:
  ```js
  app.set("trust proxy", 1);
  ```
  Without this, cookies fail to persist even though everything works locally.

## Roadmap

- [ ] Weekly email report (via Resend) summarizing each user's goals, status, and last 7 days of history
- [ ] Scheduled via an external cron trigger hitting a protected `/api/cron/weekly-report` endpoint
- [ ] Verify a sending domain in Resend to move past sandbox mode (currently limited to sending to the account's own signup email)

## Setup

1. Clone the repo
2. `npm install`
3. Set environment variables: `DATABASE_URL`, session secret, etc.
4. `npm start`

---

**Live app / repo:** [github.com/vishal1948/3-2-1-Challenge](https://github.com/vishal1948/3-2-1-Challenge)
