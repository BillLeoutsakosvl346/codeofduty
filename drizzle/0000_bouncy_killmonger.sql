CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"headline" text NOT NULL,
	"detail" text NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"engineer_id" text,
	"customer_id" text,
	"feature_id" text,
	"delta_arr_cents" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"display_name" text NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"unattributed_arr_cents" bigint DEFAULT 0 NOT NULL,
	"last_recalculated_at" timestamp with time zone,
	"next_usage_expiry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineer_arr_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"engineer_id" text NOT NULL,
	"ownership_ppm" integer NOT NULL,
	"arr_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"github_login" text NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'Software Engineer' NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_arr_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"usage_count" integer NOT NULL,
	"weight_ppm" integer NOT NULL,
	"arr_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"score" integer NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'greptile' NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_usage_events" (
	"usage_event_id" text PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"action" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"successful" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_syncs" (
	"provider" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mission_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"mission_id" text NOT NULL,
	"engineer_id" text NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"claimed_by" text,
	"linked_feature_id" text,
	"xp_reward" integer DEFAULT 500 NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"repository" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"author_login" text NOT NULL,
	"engineer_id" text,
	"url" text NOT NULL,
	"merged_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'github' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"unit_amount_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"mrr_cents" bigint NOT NULL,
	"arr_cents" bigint NOT NULL,
	"source" text DEFAULT 'stripe' NOT NULL,
	"event_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_arr_allocations" ADD CONSTRAINT "engineer_arr_allocations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_arr_allocations" ADD CONSTRAINT "engineer_arr_allocations_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_arr_allocations" ADD CONSTRAINT "engineer_arr_allocations_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_arr_allocations" ADD CONSTRAINT "feature_arr_allocations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_arr_allocations" ADD CONSTRAINT "feature_arr_allocations_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_contributions" ADD CONSTRAINT "feature_contributions_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_contributions" ADD CONSTRAINT "feature_contributions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage_events" ADD CONSTRAINT "feature_usage_events_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_claims" ADD CONSTRAINT "mission_claims_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_claims" ADD CONSTRAINT "mission_claims_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_claimed_by_engineers_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_linked_feature_id_features_id_fk" FOREIGN KEY ("linked_feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."engineers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_dedupe_key_uq" ON "activity_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "activity_events_created_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_uq" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_stripe_customer_id_uq" ON "customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engineer_arr_customer_feature_engineer_uq" ON "engineer_arr_allocations" USING btree ("customer_id","feature_id","engineer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engineers_github_login_uq" ON "engineers" USING btree ("github_login");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_arr_customer_feature_uq" ON "feature_arr_allocations" USING btree ("customer_id","feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_contributions_pr_feature_uq" ON "feature_contributions" USING btree ("pull_request_id","feature_id");--> statement-breakpoint
CREATE INDEX "feature_usage_user_window_idx" ON "feature_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_claims_mission_uq" ON "mission_claims" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_repo_number_uq" ON "pull_requests" USING btree ("repository","number");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_id_uq" ON "subscriptions" USING btree ("stripe_subscription_id");