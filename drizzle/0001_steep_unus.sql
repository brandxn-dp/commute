CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"kind" text DEFAULT 'event' NOT NULL,
	"busy" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_time_order" CHECK ("events"."end_at" >= "events"."start_at"),
	CONSTRAINT "events_kind" CHECK ("events"."kind" in ('event','protected'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"deadline" timestamp with time zone,
	"earliest_start" timestamp with time zone,
	"priority" integer DEFAULT 3 NOT NULL,
	"location" text,
	"splittable" boolean DEFAULT false NOT NULL,
	"min_chunk_minutes" integer,
	"energy" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_priority_range" CHECK ("tasks"."priority" between 1 and 4),
	CONSTRAINT "tasks_duration_positive" CHECK ("tasks"."duration_minutes" > 0),
	CONSTRAINT "tasks_energy" CHECK ("tasks"."energy" is null or "tasks"."energy" in ('deep','shallow')),
	CONSTRAINT "tasks_status" CHECK ("tasks"."status" in ('todo','done'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_start_idx" ON "events" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");