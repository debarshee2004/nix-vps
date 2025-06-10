import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { validator } from "hono/validator";
import pkg from "pg";

// Database connection
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || "todoapp",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize Hono app
const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Database initialization
async function initDatabase() {
  try {
    const client = await pool.connect();

    // Create todos table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        completed BOOLEAN DEFAULT FALSE,
        priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
      CREATE TRIGGER update_todos_updated_at
        BEFORE UPDATE ON todos
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    client.release();
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    process.exit(1);
  }
}

// Validation schemas
const todoSchema = validator("json", (value, c) => {
  const { title, description, priority, due_date } = value;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return c.json(
      { error: "Title is required and must be a non-empty string" },
      400
    );
  }

  if (title.length > 255) {
    return c.json({ error: "Title must be less than 255 characters" }, 400);
  }

  if (description && typeof description !== "string") {
    return c.json({ error: "Description must be a string" }, 400);
  }

  if (priority && !["low", "medium", "high"].includes(priority)) {
    return c.json({ error: "Priority must be one of: low, medium, high" }, 400);
  }

  if (due_date && isNaN(Date.parse(due_date))) {
    return c.json({ error: "Due date must be a valid ISO date string" }, 400);
  }

  return value;
});

const updateTodoSchema = validator("json", (value, c) => {
  const { title, description, completed, priority, due_date } = value;

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      return c.json({ error: "Title must be a non-empty string" }, 400);
    }
    if (title.length > 255) {
      return c.json({ error: "Title must be less than 255 characters" }, 400);
    }
  }

  if (description !== undefined && typeof description !== "string") {
    return c.json({ error: "Description must be a string" }, 400);
  }

  if (completed !== undefined && typeof completed !== "boolean") {
    return c.json({ error: "Completed must be a boolean" }, 400);
  }

  if (priority !== undefined && !["low", "medium", "high"].includes(priority)) {
    return c.json({ error: "Priority must be one of: low, medium, high" }, 400);
  }

  if (
    due_date !== undefined &&
    due_date !== null &&
    isNaN(Date.parse(due_date))
  ) {
    return c.json(
      { error: "Due date must be a valid ISO date string or null" },
      400
    );
  }

  return value;
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

// API Routes
app.get("/api/todos", async (c) => {
  try {
    const { completed, priority, sort, limit, offset } = c.req.query();

    let query = "SELECT * FROM todos WHERE 1=1";
    const params = [];
    let paramCount = 0;

    // Filter by completion status
    if (completed !== undefined) {
      paramCount++;
      query += ` AND completed = $${paramCount}`;
      params.push(completed === "true");
    }

    // Filter by priority
    if (priority && ["low", "medium", "high"].includes(priority)) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      params.push(priority);
    }

    // Sorting
    const validSortFields = [
      "created_at",
      "updated_at",
      "title",
      "due_date",
      "priority",
    ];
    const sortField =
      typeof sort === "string" && validSortFields.includes(sort)
        ? sort
        : "created_at";
    query += ` ORDER BY ${sortField} DESC`;

    // Pagination
    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit) || 10);
    }

    if (offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(parseInt(offset) || 0);
    }

    const client = await pool.connect();
    const result = await client.query(query, params);
    client.release();

    return c.json({
      todos: result.rows,
      count: result.rows.length,
      filters: { completed, priority, sort, limit, offset },
    });
  } catch (error) {
    console.error("Get todos error:", error);
    return c.json({ error: "Failed to fetch todos" }, 500);
  }
});

// Get single todo
app.get("/api/todos/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }

    const client = await pool.connect();
    const result = await client.query("SELECT * FROM todos WHERE id = $1", [
      id,
    ]);
    client.release();

    if (result.rows.length === 0) {
      return c.json({ error: "Todo not found" }, 404);
    }

    return c.json({ todo: result.rows[0] });
  } catch (error) {
    console.error("Get todo error:", error);
    return c.json({ error: "Failed to fetch todo" }, 500);
  }
});

// Create new todo
app.post("/api/todos", todoSchema, async (c) => {
  try {
    const {
      title,
      description,
      priority = "medium",
      due_date,
    } = await c.req.json();

    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO todos (title, description, priority, due_date) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title.trim(), description || null, priority, due_date || null]
    );
    client.release();

    return c.json(
      {
        message: "Todo created successfully",
        todo: result.rows[0],
      },
      201
    );
  } catch (error) {
    console.error("Create todo error:", error);
    return c.json({ error: "Failed to create todo" }, 500);
  }
});

// Update todo
app.put("/api/todos/:id", updateTodoSchema, async (c) => {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }

    const updates = await c.req.json();

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      if (
        ["title", "description", "completed", "priority", "due_date"].includes(
          key
        )
      ) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(
          key === "title" && typeof value === "string" ? value.trim() : value
        );
      }
    }

    if (fields.length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    values.push(id); // Add ID as last parameter

    const client = await pool.connect();
    const result = await client.query(
      `UPDATE todos SET ${fields.join(", ")} WHERE id = $${
        paramCount + 1
      } RETURNING *`,
      values
    );
    client.release();

    if (result.rows.length === 0) {
      return c.json({ error: "Todo not found" }, 404);
    }

    return c.json({
      message: "Todo updated successfully",
      todo: result.rows[0],
    });
  } catch (error) {
    console.error("Update todo error:", error);
    return c.json({ error: "Failed to update todo" }, 500);
  }
});

// Delete todo
app.delete("/api/todos/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }

    const client = await pool.connect();
    const result = await client.query(
      "DELETE FROM todos WHERE id = $1 RETURNING *",
      [id]
    );
    client.release();

    if (result.rows.length === 0) {
      return c.json({ error: "Todo not found" }, 404);
    }

    return c.json({
      message: "Todo deleted successfully",
      todo: result.rows[0],
    });
  } catch (error) {
    console.error("Delete todo error:", error);
    return c.json({ error: "Failed to delete todo" }, 500);
  }
});

// Bulk operations
app.post("/api/todos/bulk/complete", async (c) => {
  try {
    const { ids } = await c.req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "IDs array is required" }, 400);
    }

    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      return c.json({ error: "No valid IDs provided" }, 400);
    }

    const client = await pool.connect();
    const result = await client.query(
      `UPDATE todos SET completed = true WHERE id = ANY($1) RETURNING *`,
      [validIds]
    );
    client.release();

    return c.json({
      message: `${result.rows.length} todos marked as completed`,
      todos: result.rows,
    });
  } catch (error) {
    console.error("Bulk complete error:", error);
    return c.json({ error: "Failed to complete todos" }, 500);
  }
});

app.delete("/api/todos/bulk/delete", async (c) => {
  try {
    const { ids } = await c.req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "IDs array is required" }, 400);
    }

    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      return c.json({ error: "No valid IDs provided" }, 400);
    }

    const client = await pool.connect();
    const result = await client.query(
      `DELETE FROM todos WHERE id = ANY($1) RETURNING *`,
      [validIds]
    );
    client.release();

    return c.json({
      message: `${result.rows.length} todos deleted`,
      deleted: result.rows.length,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return c.json({ error: "Failed to delete todos" }, 500);
  }
});

// Stats endpoint
app.get("/api/todos/stats", async (c) => {
  try {
    const client = await pool.connect();

    const totalResult = await client.query(
      "SELECT COUNT(*) as total FROM todos"
    );
    const completedResult = await client.query(
      "SELECT COUNT(*) as completed FROM todos WHERE completed = true"
    );
    const priorityResult = await client.query(`
      SELECT priority, COUNT(*) as count 
      FROM todos 
      GROUP BY priority
    `);
    const overdueResult = await client.query(`
      SELECT COUNT(*) as overdue 
      FROM todos 
      WHERE due_date < CURRENT_TIMESTAMP AND completed = false
    `);

    client.release();

    const priorityStats = priorityResult.rows.reduce(
      (acc, row) => {
        acc[row.priority] = parseInt(row.count);
        return acc;
      },
      { low: 0, medium: 0, high: 0 }
    );

    return c.json({
      total: parseInt(totalResult.rows[0].total),
      completed: parseInt(completedResult.rows[0].completed),
      pending:
        parseInt(totalResult.rows[0].total) -
        parseInt(completedResult.rows[0].completed),
      overdue: parseInt(overdueResult.rows[0].overdue),
      byPriority: priorityStats,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Endpoint not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Application error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing database connections...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing database connections...");
  await pool.end();
  process.exit(0);
});

// Start server
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const host = process.env.HOST || "0.0.0.0";

async function startServer() {
  try {
    await initDatabase();

    const server = {
      port: port,
      hostname: host,
      fetch: app.fetch,
    };

    console.log(`Todo API Server starting on http://${host}:${port}`);
    console.log(`Health check available at http://${host}:${port}/health`);
    console.log(`API endpoints available at http://${host}:${port}/api/todos`);

    // For Bun runtime
    if (typeof Bun !== "undefined") {
      Bun.serve(server);
    } else {
      // For Node.js with @hono/node-server
      const { serve } = await import("@hono/node-server");
      serve(server);
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export default app;
