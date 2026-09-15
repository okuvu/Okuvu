-- Therapist-portal wireframes, Phase 2: Appointments/Scheduling. Entirely
-- additive — a new calendar-appointment concept, distinct from SessionLog
-- (a chat conversation).
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 50,
    "mode" TEXT NOT NULL,
    "location" TEXT,
    "note_to_client" TEXT,
    "remind_24h" BOOLEAN NOT NULL DEFAULT false,
    "remind_1h" BOOLEAN NOT NULL DEFAULT false,
    "rescheduled_from" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Appointment_therapist_id_scheduled_at_idx" ON "Appointment"("therapist_id", "scheduled_at");
CREATE INDEX "Appointment_client_user_id_scheduled_at_idx" ON "Appointment"("client_user_id", "scheduled_at");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "Therapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
