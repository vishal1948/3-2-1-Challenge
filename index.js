import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const app = express();
const port = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// Uses a hosted DATABASE_URL (e.g. from Neon/Render) when set,
// otherwise falls back to local Postgres for development.
// Pool (not Client) is used so multiple requests can query concurrently,
// and it connects lazily -- no explicit .connect() call needed.
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

db.query("SELECT NOW()")
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB Connection Error", err));

// Config for the three goal lists: table name, active-item cap, display color, label
const LIST_CONFIG = {
  today: { table: "today_goals", limit: 3, color: "#4A90D9", label: "Today" },
  weekly: { table: "weekly_goals", limit: 2, color: "#50C878", label: "This Week" },
  monthly: { table: "monthly_goals", limit: 1, color: "#9B59B6", label: "This Month" },
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Render (and most hosts) terminate HTTPS at a proxy and forward plain HTTP
// to the app. Without this, Express thinks every request is insecure, so a
// secure:true session cookie below never gets set -- logins would silently
// fail to persist. This tells Express to trust the proxy's X-Forwarded-Proto
// header instead.
app.set("trust proxy", 1);

// ---- Session setup ----
// Sessions are stored in Postgres (via connect-pg-simple), not in memory.
// This matters because Render's free tier restarts the process on cold
// starts -- an in-memory session store would log everyone out every time.
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool: db,
      tableName: "session", // must match migration_auth.sql
    }),
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// Makes the logged-in user (or null) available in every EJS template
// without passing it manually in each res.render call.
app.use((req, res, next) => {
  res.locals.user = req.session.userId
    ? { id: req.session.userId, email: req.session.userEmail }
    : null;
  next();
});

// Blocks a route unless the visitor is logged in.
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

// ---- Auth pages ----

app.get("/signup", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("signup.ejs", { error: null });
});

app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 6) {
    return res.render("signup.ejs", {
      error: "Email and a password of at least 6 characters are required.",
    });
  }

  try {
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      return res.render("signup.ejs", { error: "An account with that email already exists." });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase().trim(), hash]
    );

    const newUser = result.rows[0];
    req.session.userId = newUser.id;
    req.session.userEmail = newUser.email;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("signup.ejs", { error: "Something went wrong. Please try again." });
  }
});

app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("login.ejs", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      (email || "").toLowerCase().trim(),
    ]);
    const user = result.rows[0];

    // Same generic error whether the email or the password was wrong --
    // this avoids revealing which accounts exist.
    if (!user) {
      return res.render("login.ejs", { error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password || "", user.password_hash);
    if (!passwordMatches) {
      return res.render("login.ejs", { error: "Invalid email or password." });
    }

    req.session.userId = user.id;
    req.session.userEmail = user.email;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("login.ejs", { error: "Something went wrong. Please try again." });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ---- Page ----

app.get("/", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    const [today, weekly, monthly, history] = await Promise.all([
      db.query(
        `SELECT * FROM ${LIST_CONFIG.today.table} WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      db.query(
        `SELECT * FROM ${LIST_CONFIG.weekly.table} WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      db.query(
        `SELECT * FROM ${LIST_CONFIG.monthly.table} WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      db.query(
        `SELECT * FROM history WHERE user_id = $1 ORDER BY archived_at DESC LIMIT 20`,
        [userId]
      ),
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

app.post("/api/add", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { listType, title } = req.body;
  const list = LIST_CONFIG[listType];

  if (!list) return res.status(400).json({ error: "Unknown list type" });
  if (!title || !title.trim()) return res.status(400).json({ error: "Title is required" });

  try {
    const countResult = await db.query(
      `SELECT COUNT(*) FROM ${list.table} WHERE user_id = $1`,
      [userId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount >= list.limit) {
      return res.status(400).json({
        error: `${list.label} is full (max ${list.limit}). Complete or delete a goal first.`,
      });
    }

    const insertResult = await db.query(
      `INSERT INTO ${list.table} (title, user_id) VALUES ($1, $2) RETURNING *`,
      [title.trim(), userId]
    );

    res.json({ success: true, item: insertResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add goal" });
  }
});

// ---- API: complete (archives to history, removes from active table) ----

app.post("/api/complete", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { listType, id } = req.body;
  const list = LIST_CONFIG[listType];
  if (!list) return res.status(400).json({ error: "Unknown list type" });

  try {
    const itemResult = await db.query(
      `SELECT * FROM ${list.table} WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }
    const item = itemResult.rows[0];

    const historyResult = await db.query(
      `INSERT INTO history (list_type, title, action, user_id) VALUES ($1, $2, 'completed', $3) RETURNING id`,
      [listType, item.title, userId]
    );
    await db.query(`DELETE FROM ${list.table} WHERE id = $1 AND user_id = $2`, [id, userId]);

    res.json({ success: true, historyId: historyResult.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to complete goal" });
  }
});

// ---- API: delete (archives to history, removes from active table) ----

app.post("/api/delete", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { listType, id } = req.body;
  const list = LIST_CONFIG[listType];
  if (!list) return res.status(400).json({ error: "Unknown list type" });

  try {
    const itemResult = await db.query(
      `SELECT * FROM ${list.table} WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }
    const item = itemResult.rows[0];

    const historyResult = await db.query(
      `INSERT INTO history (list_type, title, action, user_id) VALUES ($1, $2, 'deleted', $3) RETURNING id`,
      [listType, item.title, userId]
    );
    await db.query(`DELETE FROM ${list.table} WHERE id = $1 AND user_id = $2`, [id, userId]);

    res.json({ success: true, historyId: historyResult.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

// ---- API: delete a history entry ----

app.post("/api/history/delete", requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.body;

  try {
    const result = await db.query(
      "DELETE FROM history WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "History entry not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete history entry" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});