CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"planning_horizon_weeks" integer DEFAULT 8 NOT NULL,
	"travel_monthly_call_ceiling" integer DEFAULT 5000 NOT NULL,
	"bootstrapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
