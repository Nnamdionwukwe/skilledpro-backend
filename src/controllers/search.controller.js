import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// GET /api/search?q=plumber&type=workers&city=Lagos&country=Nigeria
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
      page = 1,
      limit = 20,
    } = req.query;

    if (!q || q.trim().length < 2) {
      return sendError(res, "Search query must be at least 2 characters", 400);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const results = {};

    // ── Search Workers ────────────────────────────────────────────────────────
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
        },
        ...(minRate && { hourlyRate: { gte: parseFloat(minRate) } }),
        ...(maxRate && { hourlyRate: { lte: parseFloat(maxRate) } }),
        ...(rating && { avgRating: { gte: parseFloat(rating) } }),
        ...(category && {
          categories: { some: { category: { slug: category } } },
        }),
      };

      const [workers, workerTotal] = await Promise.all([
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

      results.workers = {
        data: workers,
        total: workerTotal,
        page: parseInt(page),
        pages: Math.ceil(workerTotal / parseInt(limit)),
      };
    }

    // ── Search Categories ─────────────────────────────────────────────────────
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

    // ── Search by Location (workers in a city/country) ────────────────────────
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

    // ── Suggestions (for autocomplete) ────────────────────────────────────────
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
    console.error(err);
    return sendError(res, "Search failed");
  }
};

// GET /api/search/workers/nearby?lat=6.5&lng=3.3&radius=25&category=electrician
export const nearbyWorkers = async (req, res) => {
  try {
    const { lat, lng, radius = 25, category, page = 1, limit = 20 } = req.query;

    if (!lat || !lng) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Bounding box approximation (1 degree ≈ 111km)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

    const where = {
      isAvailable: true,
      user: {
        isActive: true,
        isBanned: false,
        latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
        longitude: { gte: longitude - lngDelta, lte: longitude + lngDelta },
      },
      ...(category && {
        categories: { some: { category: { slug: category } } },
      }),
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

    // Add distance to each worker
    const workersWithDistance = workers.map((w) => {
      const wLat = w.user.latitude || 0;
      const wLng = w.user.longitude || 0;
      const dLat = ((wLat - latitude) * Math.PI) / 180;
      const dLng = ((wLng - longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((latitude * Math.PI) / 180) *
          Math.cos((wLat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { ...w, distanceKm: Math.round(distanceKm * 10) / 10 };
    });

    workersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    return sendResponse(res, {
      data: {
        workers: workersWithDistance,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        searchCenter: { latitude, longitude, radiusKm },
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Nearby search failed");
  }
};

// GET /api/search/trending - Trending categories and top workers globally
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
      // Top categories by booking count
      prisma.category.findMany({
        include: { _count: { select: { bookings: true, workers: true } } },
        orderBy: { bookings: { _count: "desc" } },
        take: 12,
      }),

      // Top rated workers
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

      // Recently joined workers
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
    console.error(err);
    return sendError(res, "Failed to fetch trending data");
  }
};

// GET /api/search/filters - Get available filter options for a category/location
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

    const [rateRange, locations, categories] = await Promise.all([
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
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch filter options");
  }
};
