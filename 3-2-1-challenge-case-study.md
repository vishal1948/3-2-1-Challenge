# Case Study: The 3-2-1 Challenge

**A task app built around a priority system I'd been thinking about for years**

---

## The Problem

Long before I started coding, I relied on my phone's built-in Notes app to track important tasks. It worked fine for jotting things down — but every task looked the same. There was no real way to say "this matters more than that." I'd try folders, bold text, emojis — none of it captured actual priority. Everything sat in one flat list, equally important and equally ignorable.

At the time, I didn't have the skills to fix it. But the problem stuck with me: **most to-do apps let you list tasks, but they don't help you decide which ones actually deserve your attention today.**

## The Spark

Years later, during my full-stack development course, I was given a practice project: build a to-do list app. It was meant to be a simple CRUD exercise — add, edit, delete, mark complete.

But building it brought that old frustration back. I had the tools now to actually solve the problem I'd noticed years earlier.

## The Idea: 3-2-1

Instead of a flat list, I designed a structure around how priority actually works in someone's life:

- **3 Today goals** — the things that must get done today
- **2 Weekly goals** — things with a longer runway, revisited across the week
- **1 Monthly goal** — a single, higher-level target to stay oriented toward

The numbers force a decision. You can't have ten "urgent" tasks — you have three. That constraint was the whole point: priority means something only when it's scarce.

## Building It

**Stack:** Node.js, Express, EJS templating, jQuery, PostgreSQL

I started with the core CRUD flow for the three goal types, plus a history table to track completed goals over time — turning the app from a static list into something that showed progress.

**Deployment:** Render (hosting) + Neon (managed Postgres), with the database connection handled via `pg.Pool` and the connection string in an environment variable.

## Adding Real Multi-User Support

Once the core app worked, I extended it into a proper multi-user product:

- Added a `users` table and a `user_id` column across every goals table and the history table
- Built session-based authentication using `express-session`, with sessions persisted in Postgres via `connect-pg-simple` (rather than in memory, which doesn't survive server restarts)
- Added signup, login, and logout flows with their own EJS pages
- Scoped every query — including a new feature to delete individual history entries — to the logged-in user, so one person's data never leaks into another's view

## The Bug That Taught Me the Most

After deploying to Render, login worked locally but sessions silently failed to persist in production — users would log in and immediately appear logged out.

The cause: Render sits behind a reverse proxy, and secure cookies (required for session cookies over HTTPS) need Express to explicitly trust that proxy. The fix was one line:

```js
app.set("trust proxy", 1);
```

But finding it meant understanding *why* a cookie that worked on `localhost` would silently fail behind a proxy — a good reminder that "it works on my machine" often hides infrastructure-specific gaps.

## What's Next

Currently building a weekly email report feature — a scheduled job that emails each user a summary of their goals, completion status, and recent history, sent via Resend and triggered by an external cron scheduler (since Render's own cron jobs aren't free on the plan I'm using).

## Reflection

This project mattered to me less because of the tech stack and more because of where it came from — a years-old, half-formed observation about a product that didn't fit how people actually think about priority. Getting to actually build that fix, end to end, including the un-glamorous parts (auth, session bugs, deployment) was the real learning.

**Repo:** [github.com/vishal1948/3-2-1-Challenge](https://github.com/vishal1948/3-2-1-Challenge)
