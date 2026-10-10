-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "languageRequirement" TEXT,
ADD COLUMN     "providesAccommodation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providesMeals" BOOLEAN NOT NULL DEFAULT false;
