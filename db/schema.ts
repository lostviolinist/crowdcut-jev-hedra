import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const liveStory = sqliteTable("live_story", {
  id: integer("id").primaryKey(),
  running: integer("running").notNull().default(0),
  phase: text("phase").notNull().default("awaiting_frame"),
  round: integer("round").notNull().default(1),
  sceneCount: integer("scene_count").notNull().default(0),
  jobId: text("job_id"),
  pendingAction: text("pending_action"),
  frameKey: text("frame_key"),
  nextPollAt: integer("next_poll_at").notNull().default(0),
  producerSeenAt: integer("producer_seen_at").notNull().default(0),
  error: text("error"),
});

export const liveScenes = sqliteTable("live_scenes", {
  number: integer("number").primaryKey(),
  action: text("action").notNull(),
  videoKey: text("video_key").notNull(),
  jobId: text("job_id").notNull(),
  cutMs: integer("cut_ms").notNull().default(8000),
  createdAt: integer("created_at").notNull(),
});

export const liveComments = sqliteTable("live_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  round: integer("round").notNull(),
  state: text("state").notNull().default("pending"),
  action: text("action"),
  clusterId: text("cluster_id"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_live_comments_round_state").on(table.round, table.state),
  index("idx_live_comments_user_round").on(table.userId, table.round),
]);
