import dotenv from "dotenv";
dotenv.config();

import express from "express";
import pg from "pg";

const app = express();
const port = process.env.PORT || 3000;

// Uses a hosted DATABASE_URL (e.g. from Neon/Render) when set,
// otherwise falls back to local Postgres for development.
const db = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })

: new pg.Pool({
  user: "postgres",
  host: "localhost",
  database: "permalist",
  password: "123456",
  port: 5433,
});

db.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB Connection Error", err));

// Config for the three goal lists: table name, active-item cap, display color, label
const LIST_CONFIG = {
  today: { table: "today_goals", limit: 3, color: "#f80707", label: "Today" },
  weekly: { table: "weekly_goals", limit: 2, color: "#068bf7", label: "This Week" },
  monthly: { table: "monthly_goals", limit: 1, color: "#0a9105", label: "This Month" },
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// ---- Page ----

app.get("/", async (req, res) => {
  try {
    const [today, weekly, monthly, history] = await Promise.all([
      db.query(`SELECT * FROM ${LIST_CONFIG.today.table} ORDER BY created_at ASC`),
      db.query(`SELECT * FROM ${LIST_CONFIG.weekly.table} ORDER BY created_at ASC`),
      db.query(`SELECT * FROM ${LIST_CONFIG.monthly.table} ORDER BY created_at ASC`),
      db.query(`SELECT * FROM history ORDER BY archived_at DESC LIMIT 20`),
    ]);

    res.render("index.ejs", {
      lists: {
        today: today.rows,
        weekly: weekly.rows,
        monthly: monthly.rows,
      },
      config: LIST_CONFIG,
      history: history.rows,
    });
  } catch (err) {
    console.error(err);
    res.render("index.ejs", {
      lists: { today: [], weekly: [], monthly: [] },
      config: LIST_CONFIG,
      history: [],
    });
  }
});

// ---- API: add ----

app.post("/api/add", async (req, res) => {
  const { listType, title } = req.body;
  const list = LIST_CONFIG[listType];

  if (!list) return res.status(400).json({ error: "Unknown list type" });
  if (!title || !title.trim()) return res.status(400).json({ error: "Title is required" });

  try {
    const countResult = await db.query(`SELECT COUNT(*) FROM ${list.table}`);
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount >= list.limit) {
      return res.status(400).json({
        error: `${list.label} is full (max ${list.limit}). Complete or delete a goal first.`,
      });
    }

    const insertResult = await db.query(
      `INSERT INTO ${list.table} (title) VALUES ($1) RETURNING *`,
      [title.trim()]
    );

    res.json({ success: true, item: insertResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add goal" });
  }
});

// ---- API: complete (archives to history, removes from active table) ----

app.post("/api/complete", async (req, res) => {
  const { listType, id } = req.body;
  const list = LIST_CONFIG[listType];
  if (!list) return res.status(400).json({ error: "Unknown list type" });

  try {
    const itemResult = await db.query(`SELECT * FROM ${list.table} WHERE id = $1`, [id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }
    const item = itemResult.rows[0];

    await db.query(
      `INSERT INTO history (list_type, title, action) VALUES ($1, $2, 'completed')`,
      [listType, item.title]
    );
    await db.query(`DELETE FROM ${list.table} WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to complete goal" });
  }
});

// ---- API: delete (archives to history, removes from active table) ----

app.post("/api/delete", async (req, res) => {
  const { listType, id } = req.body;
  const list = LIST_CONFIG[listType];
  if (!list) return res.status(400).json({ error: "Unknown list type" });

  try {
    const itemResult = await db.query(`SELECT * FROM ${list.table} WHERE id = $1`, [id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }
    const item = itemResult.rows[0];

    await db.query(
      `INSERT INTO history (list_type, title, action) VALUES ($1, $2, 'deleted')`,
      [listType, item.title]
    );
    await db.query(`DELETE FROM ${list.table} WHERE id = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
