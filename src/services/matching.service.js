import prisma from "../config/database.js";

const EARTH_RADIUS_KM = 6371;

// Haversine formula — distance between two lat/lng points in km
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Score a worker for a hirer's search — higher is better
const scoreWorker = (worker, hirerLat, hirerLon) => {
  let score = 0;

  // Rating weight (0–50 points)
  score += (worker.workerProfile?.avgRating || 0) * 10;

  // Completed jobs weight (0–20 points, caps at 20 jobs)
  score += Math.min(worker.workerProfile?.completedJobs || 0, 20);

  // Response rate weight (0–15 points)
  score += (worker.workerProfile?.responseRate || 0) * 15;

  // Distance weight — closer is better (0–15 points)
  if (hirerLat && hirerLon && worker.latitude && worker.longitude) {
    const dist = haversineDistance(
      hirerLat,
      hirerLon,
      worker.latitude,
      worker.longitude,
    );
    score += Math.max(0, 15 - dist * 0.3);
  }

  return score;
};

export const findMatchingWorkers = async ({
  categoryId,
  latitude,
  longitude,
  radiusKm = 50,
  minRating = 0,
  maxRate,
  minRate,
  currency,
  limit = 20,
  offset = 0,
}) => {
  const workers = await prisma.user.findMany({
    where: {
      role: "WORKER",
      isActive: true,
      isBanned: false,
      workerProfile: {
        isAvailable: true,
        avgRating: { gte: minRating },
        ...(maxRate && { hourlyRate: { lte: maxRate } }),
        ...(minRate && { hourlyRate: { gte: minRate } }),
        ...(currency && { currency }),
        ...(categoryId && {
          categories: {
            some: { categoryId },
          },
        }),
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      workerProfile: {
        select: {
          id: true,
          title: true,
          description: true,
          hourlyRate: true,
          currency: true,
          yearsExperience: true,
          avgRating: true,
          totalReviews: true,
          completedJobs: true,
          responseRate: true,
          serviceRadius: true,
          isAvailable: true,
          verificationStatus: true,
          categories: {
            include: { category: true },
          },
        },
      },
    },
  });

  // Filter by distance if coordinates provided
  let filtered = workers;
  if (latitude && longitude) {
    filtered = workers.filter((w) => {
      if (!w.latitude || !w.longitude) return true;
      const dist = haversineDistance(
        latitude,
        longitude,
        w.latitude,
        w.longitude,
      );
      const workerRadius = w.workerProfile?.serviceRadius || 25;
      return dist <= Math.min(radiusKm, workerRadius);
    });
  }

  // Score and sort
  const scored = filtered
    .map((w) => ({
      ...w,
      _score: scoreWorker(w, latitude, longitude),
      _distance:
        latitude && longitude && w.latitude && w.longitude
          ? Math.round(
              haversineDistance(latitude, longitude, w.latitude, w.longitude),
            )
          : null,
    }))
    .sort((a, b) => b._score - a._score);

  const total = scored.length;
  const paginated = scored.slice(offset, offset + limit);

  return { workers: paginated, total };
};

export const findSingleWorker = async (workerId, hirerLat, hirerLon) => {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      bio: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      workerProfile: {
        include: {
          categories: { include: { category: true } },
          portfolio: true,
          certifications: true,
          availability: true,
        },
      },
    },
  });

  if (!worker) return null;

  return {
    ...worker,
    _distance:
      hirerLat && hirerLon && worker.latitude && worker.longitude
        ? Math.round(
            haversineDistance(
              hirerLat,
              hirerLon,
              worker.latitude,
              worker.longitude,
            ),
          )
        : null,
  };
};
