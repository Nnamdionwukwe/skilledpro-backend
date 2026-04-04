import prisma from "../src/config/database.js";

async function main() {
  console.log("🌱 Seeding database updates...");

  // Ensure all worker profiles have videoIntroUrl field (already null by default)
  const workers = await prisma.workerProfile.count();
  console.log(
    `✅ WorkerProfile records: ${workers} (videoIntroUrl field added via schema push)`,
  );

  // Ensure all bookings have GPS fields (null by default)
  const bookings = await prisma.booking.count();
  console.log(
    `✅ Booking records: ${bookings} (checkInLat/Lng, checkOutLat/Lng added)`,
  );

  // Ensure Withdrawal table exists
  const withdrawals = await prisma.withdrawal.count();
  console.log(`✅ Withdrawal records: ${withdrawals}`);

  // Create a test admin if none exists
  const adminExists = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminExists) {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash("admin123456", 12);
    const admin = await prisma.user.create({
      data: {
        email: "admin@skilledproz.com",
        password: hash,
        role: "ADMIN",
        firstName: "Admin",
        lastName: "SkilledProz",
        isEmailVerified: true,
      },
    });
    console.log(`✅ Admin created: ${admin.email}`);
  } else {
    console.log(`✅ Admin already exists: ${adminExists.email}`);
  }

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
