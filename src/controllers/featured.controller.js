import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import Stripe from "stripe";
import { randomUUID } from "crypto";

let _stripe;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

export const FEATURED_PACKAGES = [
  {
    id: "featured_7days",
    name: "7-Day Spotlight",
    days: 7,
    price: 5,
    currency: "USD",
    description: "Appear at the top of your category for 7 days",
    type: "CATEGORY_TOP",
  },
  {
    id: "featured_14days",
    name: "14-Day Boost",
    days: 14,
    price: 9,
    currency: "USD",
    description: "14 days of top placement across all search results",
    type: "SEARCH_TOP",
    popular: true,
  },
  {
    id: "featured_30days",
    name: "30-Day Premium",
    days: 30,
    price: 19,
    currency: "USD",
    description: "30 days at the top + homepage feature",
    type: "HOMEPAGE",
  },
];

// GET /api/featured/packages
export const getPackages = async (req, res) => {
  return sendResponse(res, { data: { packages: FEATURED_PACKAGES } });
};

// GET /api/featured
export const getFeaturedUsers = async (req, res) => {
  try {
    const { categoryId, type } = req.query;
    const featured = await prisma.featuredListing.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        ...(categoryId && { categoryId }),
        ...(type && { type }),
      },
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

// POST /api/featured/checkout
export const createFeaturedCheckout = async (req, res) => {
  try {
    const { packageId, categoryId } = req.body;
    if (!packageId) return sendError(res, "Package ID required", 400);

    const pkg = FEATURED_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return sendError(res, "Invalid package", 404);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(pkg.price * 100),
            product_data: {
              name: pkg.name,
              description: pkg.description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/featured/success?session_id={CHECKOUT_SESSION_ID}&pkg=${packageId}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/${req.user.role.toLowerCase()}/featured`,
      metadata: {
        userId: req.user.id,
        packageId,
        categoryId: categoryId || "",
        type: pkg.type,
        days: pkg.days.toString(),
      },
    });

    return sendResponse(res, {
      data: { url: session.url, sessionId: session.id },
    });
  } catch (err) {
    console.error("Featured checkout error:", err.message);
    return sendError(res, "Failed to create checkout");
  }
};

// POST /api/featured/verify
export const verifyFeaturedCheckout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return sendError(res, "Payment not completed", 400);
    }

    const { userId, packageId, categoryId, type, days } = session.metadata;
    const pkg = FEATURED_PACKAGES.find((p) => p.id === packageId);

    // Cancel existing featured
    await prisma.featuredListing.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(days));
    const reference = `FEAT-${randomUUID().slice(0, 8).toUpperCase()}`;

    const listing = await prisma.featuredListing.create({
      data: {
        userId,
        categoryId: categoryId || null,
        type,
        price: pkg.price,
        currency: "USD",
        startsAt: new Date(),
        expiresAt,
        isActive: true,
        reference,
        stripeSessionId: session.id,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: `Featured Listing Active ⭐`,
        body: `Your ${pkg.name} is live. You appear at the top for ${days} days.`,
        type: "FEATURED_ACTIVATED",
        data: { packageId, reference, expiresAt, sessionId },
      },
    });

    return sendResponse(res, {
      message: `${pkg.name} activated`,
      data: { listing, package: pkg, reference, expiresAt, sessionId },
    });
  } catch (err) {
    console.error("Featured verify error:", err.message);
    return sendError(res, "Failed to verify payment");
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

// GET /api/featured/invoice/:sessionId
export const getFeaturedInvoice = async (req, res) => {
  try {
    const session = await getStripe().checkout.sessions.retrieve(
      req.params.sessionId,
      { expand: ["payment_intent"] },
    );

    return sendResponse(res, {
      data: {
        receiptUrl: session.payment_intent?.latest_charge
          ? `https://dashboard.stripe.com/receipts/${session.payment_intent.latest_charge}`
          : null,
        amount: session.amount_total / 100,
        currency: session.currency,
      },
    });
  } catch {
    return sendError(res, "Invoice not available");
  }
};
