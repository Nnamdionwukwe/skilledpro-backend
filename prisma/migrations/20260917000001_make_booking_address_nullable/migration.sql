-- AlterTable: Booking.address — allow NULL for remote jobs
ALTER TABLE "Booking" ALTER COLUMN "address" DROP NOT NULL;
