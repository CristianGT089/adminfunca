-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'ACADEMIC_COORDINATION', 'ADMINISTRATIVE_COORDINATION', 'ADMINISTRATIVE_ASSISTANT', 'PSYCHOLOGY', 'INTERNSHIP_COORDINATION');

-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('STUDENT', 'TEACHER', 'STAFF', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "item_status" AS ENUM ('AVAILABLE', 'LOANED', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "return_condition" AS ENUM ('GOOD', 'DAMAGED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "issue_type" AS ENUM ('DEFECT', 'MISSING_PART', 'DAMAGED_IN_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('MODULE_CLASS', 'COURSE', 'DIPLOMA', 'FIELD_TRIP', 'PSYCHOLOGY_SESSION', 'OTHER');

-- CreateEnum
CREATE TYPE "modality" AS ENUM ('IN_PERSON', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "completion" AS ENUM ('COMPLETED', 'NOT_COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "shift" AS ENUM ('DAYTIME', 'EVENING', 'SATURDAY');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('PENDING_VERIFICATION', 'PENDING', 'TAKEN', 'SCHEDULED', 'ATTENDED', 'REFERRED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "request_origin" AS ENUM ('PUBLIC', 'INTERNAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "attendance" AS ENUM ('ATTENDED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "referral" AS ENUM ('NONE', 'EPS', 'CRISIS_LINE', 'MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "consultation_reason" AS ENUM ('ACADEMIC', 'FAMILY', 'EMOTIONAL', 'SUBSTANCE_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "payroll_period_status" AS ENUM ('OPEN', 'IN_REVIEW', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "payroll_item_status" AS ENUM ('PENDING', 'FLAGGED', 'VERIFIED', 'PAID');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL DEFAULT 'ADMINISTRATIVE_ASSISTANT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "person_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "type" "person_type" NOT NULL DEFAULT 'STUDENT',
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'CC',
    "document_hash" TEXT NOT NULL,
    "document_encrypted" TEXT NOT NULL,
    "document_last4" TEXT NOT NULL,
    "card_code" TEXT,
    "program" TEXT,
    "email" TEXT,
    "phone_encrypted" TEXT,
    "hourly_rate" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_modules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "hours" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_modules" (
    "person_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_modules_pkey" PRIMARY KEY ("person_id","module_id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "brand" TEXT,
    "serial" TEXT,
    "location" TEXT,
    "campus" TEXT,
    "status" "item_status" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "due_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "returned_by_id" TEXT,
    "return_condition" "return_condition",
    "return_note" TEXT,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_issues" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "type" "issue_type" NOT NULL DEFAULT 'DEFECT',
    "description" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes_since_delivery" INTEGER NOT NULL,
    "registered_by_id" TEXT NOT NULL,

    CONSTRAINT "loan_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" "event_type" NOT NULL DEFAULT 'MODULE_CLASS',
    "shift" "shift",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "modality" "modality" NOT NULL DEFAULT 'IN_PERSON',
    "campus" TEXT,
    "location" TEXT,
    "student_count" INTEGER,
    "payable" BOOLEAN NOT NULL DEFAULT true,
    "hourly_rate" INTEGER,
    "series_id" TEXT,
    "teacher_id" TEXT,
    "module_id" TEXT,
    "completion" "completion",
    "closing_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_requests" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "origin" "request_origin" NOT NULL DEFAULT 'INTERNAL',
    "requester_type" "person_type" NOT NULL DEFAULT 'STUDENT',
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'CC',
    "document_hash" TEXT NOT NULL,
    "document_encrypted" TEXT NOT NULL,
    "document_last4" TEXT NOT NULL,
    "phone_encrypted" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "program" TEXT,
    "campus" TEXT,
    "preferred_modality" "modality",
    "availability" TEXT,
    "reason_encrypted" TEXT,
    "person_id" TEXT,
    "policy_version" TEXT NOT NULL,
    "policy_accepted_at" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "registered_by_id" TEXT,
    "assigned_to_id" TEXT,
    "taken_at" TIMESTAMP(3),
    "event_id" TEXT,
    "previous_id" TEXT,
    "attendance" "attendance",
    "referral" "referral",
    "reason_category" "consultation_reason",
    "needs_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_date" TIMESTAMP(3),
    "observation_encrypted" TEXT,
    "closed_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "payroll_period_status" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "in_review_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" "payroll_item_status" NOT NULL DEFAULT 'PENDING',
    "calculation" JSONB NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "amount" INTEGER NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "observation" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projections" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "links" TEXT NOT NULL DEFAULT '',
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "people_document_hash_key" ON "people"("document_hash");

-- CreateIndex
CREATE UNIQUE INDEX "people_card_code_key" ON "people"("card_code");

-- CreateIndex
CREATE INDEX "people_last_names_first_names_idx" ON "people"("last_names", "first_names");

-- CreateIndex
CREATE UNIQUE INDEX "academic_modules_program_name_key" ON "academic_modules"("program", "name");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_status_idx" ON "items"("status");

-- CreateIndex
CREATE INDEX "loans_item_id_returned_at_idx" ON "loans"("item_id", "returned_at");

-- CreateIndex
CREATE INDEX "loans_person_id_returned_at_idx" ON "loans"("person_id", "returned_at");

-- CreateIndex
CREATE INDEX "loans_delivered_at_idx" ON "loans"("delivered_at");

-- CreateIndex
CREATE INDEX "loan_issues_loan_id_idx" ON "loan_issues"("loan_id");

-- CreateIndex
CREATE INDEX "events_starts_at_ends_at_idx" ON "events"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "events_teacher_id_starts_at_idx" ON "events"("teacher_id", "starts_at");

-- CreateIndex
CREATE INDEX "events_series_id_idx" ON "events"("series_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_requests_number_key" ON "consultation_requests"("number");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_requests_token_hash_key" ON "consultation_requests"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_requests_event_id_key" ON "consultation_requests"("event_id");

-- CreateIndex
CREATE INDEX "consultation_requests_status_created_at_idx" ON "consultation_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "consultation_requests_document_hash_created_at_idx" ON "consultation_requests"("document_hash", "created_at");

-- CreateIndex
CREATE INDEX "consultation_requests_assigned_to_id_status_idx" ON "consultation_requests"("assigned_to_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_year_month_key" ON "payroll_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_period_id_person_id_key" ON "payroll_items"("period_id", "person_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_modules" ADD CONSTRAINT "teacher_modules_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_modules" ADD CONSTRAINT "teacher_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "academic_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_by_id_fkey" FOREIGN KEY ("returned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_issues" ADD CONSTRAINT "loan_issues_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_issues" ADD CONSTRAINT "loan_issues_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "academic_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An item has at most one open loan (returned_at IS NULL). Prisma cannot express partial
-- unique indexes in the schema, so it lives here; the service also checks it first.
CREATE UNIQUE INDEX "loans_one_open_per_item" ON "loans"("item_id") WHERE "returned_at" IS NULL;
