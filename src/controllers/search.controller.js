import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/search
export const globalSearch = async (req, res) => {
  try {
    const {
      q,
      type,
      city,
      country,
      category,
      minRate,
      maxRate,
      rating,
      available,
      language,
      gender,
      verification,
      lat,
      lng,
      radius,
      page = 1,
      limit = 20,
    } = req.query;

    if (!q || q.trim().length < 2) {
      return sendError(res, "Search query must be at least 2 characters", 400);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const results = {};

    if (!type || type === "workers") {
      const workerWhere = {
        isAvailable: available === "false" ? undefined : true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
          {
            categories: {
              some: {
                category: { name: { contains: q, mode: "insensitive" } },
              },
            },
          },
        ],
        user: {
          isActive: true,
          isBanned: false,
          ...(city && { city: { contains: city, mode: "insensitive" } }),
          ...(country && {
            country: { contains: country, mode: "insensitive" },
          }),
          ...(language && {
            language: { contains: language, mode: "insensitive" },
          }),
          ...(gender && { gender: gender }),
        },
        ...(minRate && { hourlyRate: { gte: parseFloat(minRate) } }),
        ...(maxRate && { hourlyRate: { lte: parseFloat(maxRate) } }),
        ...(rating && { avgRating: { gte: parseFloat(rating) } }),
        ...(verification && { verificationStatus: verification.toUpperCase() }),
        ...(category && {
          categories: { some: { category: { slug: category } } },
        }),
      };

      let [workers, workerTotal] = await Promise.all([
        prisma.workerProfile.findMany({
          where: workerWhere,
          skip,
          take: parseInt(limit),
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                city: true,
                country: true,
                latitude: true,
                longitude: true,
                language: true,
              },
            },
            categories: {
              take: 3,
              include: {
                category: { select: { name: true, slug: true, icon: true } },
              },
            },
          },
          orderBy: [{ avgRating: "desc" }, { completedJobs: "desc" }],
        }),
        prisma.workerProfile.count({ where: workerWhere }),
      ]);

      // Distance filter + sort (client-side after DB fetch)
      if (lat && lng) {
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const maxKm = radius ? parseFloat(radius) : 9999;

        workers = workers
          .map((w) => ({
            ...w,
            _distanceKm:
              w.user.latitude && w.user.longitude
                ? Math.round(
                    haversineKm(
                      userLat,
                      userLng,
                      w.user.latitude,
                      w.user.longitude,
                    ) * 10,
                  ) / 10
                : null,
          }))
          .filter((w) => w._distanceKm === null || w._distanceKm <= maxKm)
          .sort((a, b) => (a._distanceKm ?? 9999) - (b._distanceKm ?? 9999));

        workerTotal = workers.length;
      }

      results.workers = {
        data: workers,
        total: workerTotal,
        page: parseInt(page),
        pages: Math.ceil(workerTotal / parseInt(limit)),
      };
    }

    if (!type || type === "categories") {
      const categories = await prisma.category.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        include: {
          _count: { select: { workers: true, bookings: true } },
          children: {
            select: { id: true, name: true, slug: true, icon: true },
          },
        },
        orderBy: { workers: { _count: "desc" } },
        take: 10,
      });
      results.categories = { data: categories, total: categories.length };
    }

    if (!type || type === "locations") {
      const locationWorkers = await prisma.user.findMany({
        where: {
          isActive: true,
          isBanned: false,
          role: "WORKER",
          OR: [
            { city: { contains: q, mode: "insensitive" } },
            { country: { contains: q, mode: "insensitive" } },
            { state: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          city: true,
          country: true,
          state: true,
          workerProfile: {
            select: {
              title: true,
              hourlyRate: true,
              currency: true,
              avgRating: true,
              completedJobs: true,
              isAvailable: true,
              verificationStatus: true,
              categories: {
                take: 2,
                include: { category: { select: { name: true, icon: true } } },
              },
            },
          },
        },
        take: parseInt(limit),
      });
      results.locations = {
        data: locationWorkers,
        total: locationWorkers.length,
      };
    }

    if (type === "suggest") {
      const [categoryNames, workerNames, cities] = await Promise.all([
        prisma.category.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          select: { name: true, slug: true, icon: true },
          take: 5,
        }),
        prisma.user.findMany({
          where: {
            role: "WORKER",
            isActive: true,
            isBanned: false,
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            workerProfile: { select: { title: true } },
          },
          take: 5,
        }),
        prisma.user.findMany({
          where: {
            isActive: true,
            isBanned: false,
            city: { contains: q, mode: "insensitive" },
          },
          select: { city: true, country: true },
          distinct: ["city"],
          take: 5,
        }),
      ]);

      results.suggestions = {
        categories: categoryNames,
        workers: workerNames,
        cities: cities.map((u) => ({ city: u.city, country: u.country })),
      };
    }

    return sendResponse(res, {
      data: { query: q, type: type || "all", ...results },
    });
  } catch (err) {
    console.error("globalSearch error:", err);
    return sendError(res, "Search failed");
  }
};

// GET /api/search/nearby
export const nearbyWorkers = async (req, res) => {
  try {
    const {
      lat,
      lng,
      radius = 25,
      category,
      language,
      gender,
      verification,
      page = 1,
      limit = 20,
    } = req.query;

    if (!lat || !lng)
      return sendError(res, "Latitude and longitude are required", 400);

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

    const where = {
      isAvailable: true,
      ...(verification && { verificationStatus: verification.toUpperCase() }),
      ...(category && {
        categories: { some: { category: { slug: category } } },
      }),
      user: {
        isActive: true,
        isBanned: false,
        latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
        longitude: { gte: longitude - lngDelta, lte: longitude + lngDelta },
        ...(language && {
          language: { contains: language, mode: "insensitive" },
        }),
        ...(gender && { gender: gender }),
      },
    };

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
              latitude: true,
              longitude: true,
              language: true,
            },
          },
          categories: {
            take: 3,
            include: {
              category: { select: { name: true, slug: true, icon: true } },
            },
          },
        },
        orderBy: [{ avgRating: "desc" }, { completedJobs: "desc" }],
      }),
      prisma.workerProfile.count({ where }),
    ]);

    const withDistance = workers
      .map((w) => ({
        ...w,
        distanceKm:
          w.user.latitude && w.user.longitude
            ? Math.round(
                haversineKm(
                  latitude,
                  longitude,
                  w.user.latitude,
                  w.user.longitude,
                ) * 10,
              ) / 10
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));

    return sendResponse(res, {
      data: {
        workers: withDistance,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        searchCenter: { latitude, longitude, radiusKm },
      },
    });
  } catch (err) {
    console.error("nearbyWorkers error:", err);
    return sendError(res, "Nearby search failed");
  }
};

// GET /api/search/trending
export const getTrending = async (req, res) => {
  try {
    const { country, city } = req.query;

    const userFilter = {
      isActive: true,
      isBanned: false,
      ...(country && { country: { contains: country, mode: "insensitive" } }),
      ...(city && { city: { contains: city, mode: "insensitive" } }),
    };

    const [trendingCategories, topWorkers, recentlyJoined] = await Promise.all([
      prisma.category.findMany({
        include: { _count: { select: { bookings: true, workers: true } } },
        orderBy: { bookings: { _count: "desc" } },
        take: 12,
      }),
      prisma.workerProfile.findMany({
        where: {
          avgRating: { gte: 4.0 },
          completedJobs: { gte: 1 },
          isAvailable: true,
          user: userFilter,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
            },
          },
          categories: {
            take: 2,
            include: {
              category: { select: { name: true, slug: true, icon: true } },
            },
          },
        },
        orderBy: [{ avgRating: "desc" }, { completedJobs: "desc" }],
        take: 8,
      }),
      prisma.workerProfile.findMany({
        where: { isAvailable: true, user: userFilter },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              city: true,
              country: true,
              createdAt: true,
            },
          },
          categories: {
            take: 2,
            include: {
              category: { select: { name: true, slug: true, icon: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    return sendResponse(res, {
      data: { trendingCategories, topWorkers, recentlyJoined },
    });
  } catch (err) {
    console.error("getTrending error:", err);
    return sendError(res, "Failed to fetch trending data");
  }
};

// GET /api/search/filters
export const getFilterOptions = async (req, res) => {
  try {
    const { category, country } = req.query;

    const workerWhere = {
      isAvailable: true,
      ...(category && {
        categories: { some: { category: { slug: category } } },
      }),
      ...(country && {
        user: { country: { contains: country, mode: "insensitive" } },
      }),
    };

    const [rateRange, locations, categories, languages] = await Promise.all([
      prisma.workerProfile.aggregate({
        where: workerWhere,
        _min: { hourlyRate: true },
        _max: { hourlyRate: true },
        _avg: { hourlyRate: true },
      }),
      prisma.user.findMany({
        where: {
          role: "WORKER",
          isActive: true,
          isBanned: false,
          ...(country && {
            country: { contains: country, mode: "insensitive" },
          }),
        },
        select: { city: true, country: true },
        distinct: ["city"],
        take: 50,
      }),
      prisma.category.findMany({
        include: { _count: { select: { workers: true } } },
        orderBy: { workers: { _count: "desc" } },
        take: 20,
      }),
      // Distinct languages from worker users
      prisma.user.findMany({
        where: {
          role: "WORKER",
          isActive: true,
          isBanned: false,
          language: { not: null },
        },
        select: { language: true },
        distinct: ["language"],
      }),
    ]);

    return sendResponse(res, {
      data: {
        rateRange: {
          min: rateRange._min.hourlyRate || 0,
          max: rateRange._max.hourlyRate || 0,
          avg: Math.round(rateRange._avg.hourlyRate || 0),
        },
        locations: locations.map((u) => ({ city: u.city, country: u.country })),
        categories,
        ratings: [5, 4, 3],
        languages: languages.map((u) => u.language).filter(Boolean),
        genders: ["Male", "Female", "Non-binary", "Prefer not to say"],
        verifications: [
          { value: "VERIFIED", label: "Verified ✅" },
          { value: "UNVERIFIED", label: "Any" },
        ],
        distances: [5, 10, 25, 50, 100, 200],
      },
    });
  } catch (err) {
    console.error("getFilterOptions error:", err);
    return sendError(res, "Failed to fetch filter options");
  }
};
