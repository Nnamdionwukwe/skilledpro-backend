import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

export const FEATURED_PACKAGES = [
  {
    id: "featured_7days",
    name: "7-Day Spotlight",
    days: 7,
    price: 3500,
    currency: "NGN",
    description: "Appear at the top of your category for 7 days",
    type: "CATEGORY_TOP",
  },
  {
    id: "featured_14days",
    name: "14-Day Boost",
    days: 14,
    price: 6000,
    currency: "NGN",
    description: "14 days of top placement across all search results",
    type: "SEARCH_TOP",
    popular: true,
  },
  {
    id: "featured_30days",
    name: "30-Day Premium",
    days: 30,
    price: 12000,
    currency: "NGN",
    description: "30 days at the top + homepage feature",
    type: "HOMEPAGE",
  },
];

// GET /api/featured/packages
export const getPackages = async (req, res) => {
  return sendResponse(res, { data: { packages: FEATURED_PACKAGES } });
};

// GET /api/featured — get all active featured users (for search injection)
export const getFeaturedUsers = async (req, res) => {
  try {
    const { categoryId, type } = req.query;
    const where = {
      isActive: true,
      expiresAt: { gt: new Date() },
      ...(categoryId && { categoryId }),
      ...(type && { type }),
    };

    const featured = await prisma.featuredListing.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            workerProfile: {
              select: {
                title: true,
                hourlyRate: true,
                currency: true,
                avgRating: true,
                totalReviews: true,
                completedJobs: true,
                isAvailable: true,
                categories: { include: { category: true } },
              },
            },
            hirerProfile: {
              select: { companyName: true, totalHires: true, avgRating: true },
            },
          },
        },
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return sendResponse(res, { data: { featured } });
  } catch (err) {
    return sendError(res, "Failed to fetch featured listings");
  }
};

// POST /api/featured/purchase
export const purchaseFeatured = async (req, res) => {
  try {
    const { packageId, categoryId } = req.body;
    if (!packageId) return sendError(res, "Package ID is required", 400);

    const pkg = FEATURED_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return sendError(res, "Invalid package", 404);

    // Cancel any existing active listing
    await prisma.featuredListing.updateMany({
      where: { userId: req.user.id, isActive: true },
      data: { isActive: false },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + pkg.days);
    const reference = `FEAT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const listing = await prisma.featuredListing.create({
      data: {
        userId: req.user.id,
        categoryId: categoryId || null,
        type: pkg.type,
        price: pkg.price,
        currency: pkg.currency,
        startsAt: new Date(),
        expiresAt,
        isActive: true,
        reference,
      },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `Featured Listing Activated ⭐`,
        body: `Your ${pkg.name} is now live. You'll appear at the top of search results for ${pkg.days} days.`,
        type: "FEATURED_ACTIVATED",
        data: { packageId, reference, expiresAt, type: pkg.type },
      },
    });

    return sendResponse(res, {
      status: 201,
      message: `${pkg.name} activated`,
      data: { listing, package: pkg, reference, expiresAt },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to activate featured listing");
  }
};

// GET /api/featured/my
export const getMyFeatured = async (req, res) => {
  try {
    const listing = await prisma.featuredListing.findFirst({
      where: {
        userId: req.user.id,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: { category: true },
    });
    return sendResponse(res, { data: { listing, isActive: !!listing } });
  } catch (err) {
    return sendError(res, "Failed to fetch featured status");
  }
};
