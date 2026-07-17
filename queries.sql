-- Redesigned schema: three goal lists (3-2-1 cap) + history log
-- Run this against your "permalist" database (or rename as you like)

-- Drop the old single-table version if it exists
-- DROP TABLE IF EXISTS items;

CREATE TABLE IF NOT EXISTS today_goals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_goals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_goals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Every completed or deleted goal gets archived here
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  list_type VARCHAR(20) NOT NULL,   -- 'today' | 'weekly' | 'monthly'
  title VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,      -- 'completed' | 'deleted'
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Optional sample data
INSERT INTO today_goals (title) VALUES ('Buy milk'), ('Finish homework');
INSERT INTO weekly_goals (title) VALUES ('Ship portfolio update');
INSERT INTO monthly_goals (title) VALUES ('Land first freelance client');
