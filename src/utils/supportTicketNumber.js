import prisma from "../config/database.js";

/**
 * Atomically increments the ticket counter in AppSettings.
 * Returns a human-readable "SKP-000123".
 */
export async function generateTicketNumber() {
  const rows = await prisma.$queryRaw`
    INSERT INTO "AppSettings" ("id", "key", "value", "description", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'support_ticket_counter', '1',
            'Auto-incrementing support ticket counter', NOW(), NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "value" = (CAST("AppSettings"."value" AS INTEGER) + 1)::text,
        "updatedAt" = NOW()
    RETURNING "value";
  `;
  const n = parseInt(rows[0].value, 10);
  return `SKP-${String(n).padStart(6, "0")}`;
}
