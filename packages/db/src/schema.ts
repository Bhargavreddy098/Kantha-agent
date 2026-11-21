import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  workspacePath: text("workspace_path").notNull(),
  status: text("status", { enum: ["idle", "running", "paused", "completed", "failed"] }).notNull().default("idle"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const checkpoints = sqliteTable("checkpoints", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  stepIndex: integer("step_index").notNull(),
  stateSnapshot: text("state_snapshot").notNull(), // JSON
  createdAt: integer("created_at").notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  callId: text("call_id").notNull(),
  toolName: text("tool_name").notNull(),
  args: text("args").notNull(), // JSON
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
});

export const sessionEvents = sqliteTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(), // JSON
  createdAt: integer("created_at").notNull(),
});
