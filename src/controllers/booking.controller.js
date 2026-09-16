// src/controllers/booking.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  sendBookingRequestEmail,
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
  sendJobCompletedEmail,
  sendReviewRequestEmail,
} from "../services/email.service.js";

import {
  notifyBookingRequest,
  notifyBookingAccepted,
  notifyBookingRejected,
  notifyBookingCancelled,
  notifyBookingInProgress,
  notifyBookingCompleted,
  notifyReviewRequest, // ✅ ADD THIS
  notifyNewReview,
} from "../services/notification.service.js";

import { convertReferral } from "./referral.controller.js";
import {
  paginate,
  paginationMeta,
  fullName,
  formatCurrency,
  truncate,
  slugify,
  uniqueRef,
  parseJSON,
  extractIP,
  timeAgo,
  safeUser,
} from "../utils/helpers.js";

export const createBooking = async (req, res) => {
  try {
    const {
      workerId,
      categoryId,
      title,
      description,
      address,
      latitude,
      longitude,
      scheduledAt,
      estimatedHours,
      estimatedUnit,
      estimatedValue,
      isNegotiated,
      negotiatedRate,
      negotiationNote,
      agreedRate,
      currency,
      notes,
      jobType,
      locationType,
      requirements,
      responsibilities,
      quantity,
      customLabel,
    } = req.body;

    const booking = await prisma.booking.create({
      data: {
        hirerId: req.user.id,
        workerId,
        categoryId,
        title,
        description,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        scheduledAt: new Date(scheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        estimatedUnit: estimatedUnit || "hours",
        estimatedValue: estimatedValue ? String(estimatedValue) : null,
        quantity: quantity || 1,
        custom_label: customLabel || null,
        agreedRate:
          isNegotiated && negotiatedRate
            ? parseFloat(negotiatedRate)
            : parseFloat(agreedRate),
        currency: currency || "USD",
        notes,
        jobType: jobType || null,
        locationType: locationType || null,
        isNegotiated: isNegotiated === true || isNegotiated === "true",
        negotiatedRate:
          isNegotiated && negotiatedRate ? parseFloat(negotiatedRate) : null,
        negotiationNote:
          isNegotiated && negotiationNote ? negotiationNote.trim() : null,
        requirements: requirements || null,
        responsibilities: responsibilities || null,
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    // ── Email worker ──────────────────────────────────────────────────────────
    await sendBookingRequestEmail({
      to: booking.worker.email,
      workerName: booking.worker.firstName,
      hirerName: `${booking.hirer.firstName} ${booking.hirer.lastName}`,
      booking: {
        id: booking.id,
        title: booking.title,
        category: booking.category?.name || "",
        scheduledAt: booking.scheduledAt,
        address: booking.address,
        agreedRate: booking.agreedRate,
        currency: booking.currency,
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Booking created",
      data: { booking },
    });
  } catch (err) {
    console.error("createBooking error:", err);
    return sendError(res, "Booking failed");
  }
};

// ── GET /api/bookings/from-job/:jobPostId/draft ─────────────────────────────
// Hirer fetches the pre-fill data for creating a booking from a job post.
// Returns the job's locked fields + the list of selectable price options.
export const getJobPostBookingDraft = async (req, res) => {
  try {
    const { jobPostId } = req.params;

    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
        applications: {
          where: { status: "ACCEPTED" },
          select: {
            id: true,
            workerId: true,
            status: true,
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                email: true,
                workerProfile: {
                  select: {
                    title: true,
                    avgRating: true,
                    totalReviews: true,
                    completedJobs: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden — you don't own this job post", 403);

    // Optional filter: if `workerId` query is present, return only that
    // application's worker so the frontend knows who to book.
    const { workerId } = req.query;
    const accepted = workerId
      ? jobPost.applications.find((a) => a.workerId === workerId)
      : jobPost.applications[0];

    if (!accepted) {
      return sendError(res, "No accepted application found for this job", 400);
    }

    // ── Build the price options array ──────────────────────────────────────
    // Every value the hirer can pick from. Each entry is self-describing so
    // the frontend can render a radio button without extra logic.
    const priceOptions = [];

    if (jobPost.budget != null && jobPost.budget > 0) {
      priceOptions.push({
        key: "budget",
        label: `${jobPost.currency} ${jobPost.budget.toLocaleString()}`,
        amount: jobPost.budget,
        currency: jobPost.currency,
        period: jobPost.budgetType, // FIXED | HOURLY | DAILY | ...
        description: "Fixed budget from the job post",
      });
    }

    if (jobPost.salaryAmount != null && jobPost.salaryAmount > 0) {
      priceOptions.push({
        key: "salaryAmount",
        label: `${jobPost.salaryCurrency || jobPost.currency} ${jobPost.salaryAmount.toLocaleString()}`,
        amount: jobPost.salaryAmount,
        currency: jobPost.salaryCurrency || jobPost.currency,
        period: jobPost.salaryPeriod || null,
        description: "Salary amount from the job post",
      });
    }

    if (jobPost.salaryMin != null && jobPost.salaryMin > 0) {
      priceOptions.push({
        key: "salaryMin",
        label: `${jobPost.salaryCurrency || jobPost.currency} ${jobPost.salaryMin.toLocaleString()} (min)`,
        amount: jobPost.salaryMin,
        currency: jobPost.salaryCurrency || jobPost.currency,
        period: jobPost.salaryPeriod || null,
        description: "Minimum of the salary range",
      });
    }

    if (jobPost.salaryMax != null && jobPost.salaryMax > 0) {
      priceOptions.push({
        key: "salaryMax",
        label: `${jobPost.salaryCurrency || jobPost.currency} ${jobPost.salaryMax.toLocaleString()} (max)`,
        amount: jobPost.salaryMax,
        currency: jobPost.salaryCurrency || jobPost.currency,
        period: jobPost.salaryPeriod || null,
        description: "Maximum of the salary range",
      });
    }

    if (jobPost.salaryText) {
      // salaryText has no numeric amount — hirer must enter a value if they pick it
      priceOptions.push({
        key: "salaryText",
        label: jobPost.salaryText,
        amount: null,
        currency: jobPost.salaryCurrency || jobPost.currency,
        period: jobPost.salaryPeriod || null,
        description: "Salary headline from the job post — enter a final amount",
      });
    }

    if (priceOptions.length === 0) {
      return sendError(
        res,
        "This job post has no price information to base a booking on",
        400,
      );
    }

    // ── Locked fields — what the frontend must show read-only ─────────────
    const lockedFields = {
      jobPostId: jobPost.id,
      workerId: accepted.workerId,
      hirerId: jobPost.hirerId,
      categoryId: jobPost.categoryId,
      title: jobPost.title,
      description: jobPost.description,
      address: jobPost.address,
      latitude: jobPost.latitude,
      longitude: jobPost.longitude,
      scheduledAt: jobPost.scheduledAt,
      estimatedHours: jobPost.estimatedHours,
      estimatedUnit: jobPost.estimatedUnit,
      estimatedValue: jobPost.estimatedValue,
      durationType: jobPost.durationType,
      durationValue: jobPost.durationValue,
      jobType: jobPost.jobType,
      locationType: jobPost.locationType,
      skills: jobPost.skills,
      requirements: jobPost.requirements,
      responsibilities: jobPost.responsibilities,
    };

    return sendResponse(res, {
      data: {
        jobPostId: jobPost.id,
        jobTitle: jobPost.title,
        worker: accepted.worker,
        hirer: jobPost.hirer,
        category: jobPost.category,
        lockedFields,
        priceOptions,
        applicationId: accepted.id,
      },
    });
  } catch (err) {
    console.error("getJobPostBookingDraft error:", err);
    return sendError(res, "Failed to build booking draft");
  }
};

// ── POST /api/bookings/from-job/:jobPostId ─────────────────────────────────
// Hirer creates a booking directly from an accepted job application.
// All fields except `selectedRateOption`, `negotiatedRate`,
// `negotiationNote`, and `notes` are IGNORED — they come from the job post.
export const createBookingFromJobPost = async (req, res) => {
  try {
    const { jobPostId } = req.params;
    const {
      workerId, // required — which accepted worker to book
      selectedRateOption, // required — which of the price options to use
      negotiatedRate, // optional — overrides the selection
      negotiationNote, // optional
      notes, // optional — booking-level notes
      quantity, // optional — defaults to 1
      customLabel, // optional
    } = req.body;

    if (!workerId) {
      return sendError(res, "workerId is required", 400);
    }
    if (!selectedRateOption) {
      return sendError(res, "selectedRateOption is required", 400);
    }

    // ── Fetch the job + verify ownership + accepted application ────────────
    const jobPost = await prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: {
        applications: {
          where: { status: "ACCEPTED" },
          select: { id: true, workerId: true, status: true },
        },
      },
    });

    if (!jobPost) return sendError(res, "Job post not found", 404);
    if (jobPost.hirerId !== req.user.id)
      return sendError(res, "Forbidden — you don't own this job post", 403);

    const accepted = jobPost.applications.find((a) => a.workerId === workerId);
    if (!accepted)
      return sendError(
        res,
        "This worker has not been accepted for this job",
        400,
      );

    // ── Resolve the final agreed rate ──────────────────────────────────────
    // 1. If negotiatedRate is provided and valid, it WINS.
    // 2. Otherwise, use the selected price option.
    // 3. If the selection is `salaryText` (no numeric value) and no
    //    negotiatedRate, reject — the hirer must supply a number.

    const parsedNegotiated =
      negotiatedRate !== undefined &&
      negotiatedRate !== null &&
      negotiatedRate !== ""
        ? parseFloat(negotiatedRate)
        : null;

    const isNegotiated = parsedNegotiated !== null && parsedNegotiated > 0;

    let finalRate = null;
    let finalCurrency = jobPost.currency || "NGN";
    let finalPeriod = null;

    if (isNegotiated) {
      finalRate = parsedNegotiated;
      // Currency inherits from whichever price option matches the selection,
      // falling back to the job's currency.
      finalCurrency =
        jobPost.salaryCurrency || jobPost.currency || finalCurrency;
    } else {
      switch (selectedRateOption) {
        case "budget":
          if (jobPost.budget == null) {
            return sendError(res, "Job has no budget to use", 400);
          }
          finalRate = jobPost.budget;
          finalCurrency = jobPost.currency || finalCurrency;
          finalPeriod = jobPost.budgetType;
          break;
        case "salaryAmount":
          if (jobPost.salaryAmount == null) {
            return sendError(res, "Job has no salary amount to use", 400);
          }
          finalRate = jobPost.salaryAmount;
          finalCurrency =
            jobPost.salaryCurrency || jobPost.currency || finalCurrency;
          finalPeriod = jobPost.salaryPeriod;
          break;
        case "salaryMin":
          if (jobPost.salaryMin == null) {
            return sendError(res, "Job has no salary min to use", 400);
          }
          finalRate = jobPost.salaryMin;
          finalCurrency =
            jobPost.salaryCurrency || jobPost.currency || finalCurrency;
          finalPeriod = jobPost.salaryPeriod;
          break;
        case "salaryMax":
          if (jobPost.salaryMax == null) {
            return sendError(res, "Job has no salary max to use", 400);
          }
          finalRate = jobPost.salaryMax;
          finalCurrency =
            jobPost.salaryCurrency || jobPost.currency || finalCurrency;
          finalPeriod = jobPost.salaryPeriod;
          break;
        case "salaryText":
          // salaryText has no numeric amount — hirer must negotiate
          return sendError(
            res,
            "This price option has no numeric value. Please enter a negotiated amount.",
            400,
          );
        default:
          return sendError(res, "Invalid selectedRateOption", 400);
      }
    }

    if (!finalRate || finalRate <= 0) {
      return sendError(res, "Could not resolve a valid agreed rate", 400);
    }

    // ── Prevent duplicate booking for the same application ─────────────────
    const existingBooking = await prisma.booking.findFirst({
      where: {
        jobPostId: jobPost.id,
        workerId,
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      select: { id: true },
    });

    if (existingBooking) {
      return sendError(
        res,
        "A booking already exists for this application",
        409,
      );
    }

    // ── Create the booking with locked fields from the job ─────────────────
    const booking = await prisma.booking.create({
      data: {
        // Source discriminator + linkage
        source: "JOB_POST",
        jobPostId: jobPost.id,
        selectedRateOption,

        // Locked from the job
        hirerId: req.user.id,
        workerId,
        categoryId: jobPost.categoryId,
        title: jobPost.title,
        description: jobPost.description,
        address: jobPost.address ?? null,
        latitude: jobPost.latitude,
        longitude: jobPost.longitude,
        scheduledAt: jobPost.scheduledAt,
        estimatedHours: jobPost.estimatedHours,
        estimatedUnit: jobPost.estimatedUnit || "hours",
        estimatedValue: jobPost.estimatedValue,
        jobType: jobPost.jobType,
        locationType: jobPost.locationType,
        requirements: jobPost.requirements,
        responsibilities: jobPost.responsibilities,

        // Payment resolution
        agreedRate: finalRate,
        currency: finalCurrency,
        isNegotiated,
        negotiatedRate: isNegotiated ? finalRate : null,
        negotiationNote:
          isNegotiated && negotiationNote ? negotiationNote.trim() : null,

        // Hirer-editable
        notes: notes || null,
        quantity: quantity || 1,
        custom_label: customLabel || null,

        // Snapshot for audit / replay
        jobRateSnapshot: {
          budget: jobPost.budget,
          budgetType: jobPost.budgetType,
          currency: jobPost.currency,
          salaryAmount: jobPost.salaryAmount,
          salaryMin: jobPost.salaryMin,
          salaryMax: jobPost.salaryMax,
          salaryCurrency: jobPost.salaryCurrency,
          salaryPeriod: jobPost.salaryPeriod,
          salaryText: jobPost.salaryText,
          selectedRateOption,
          negotiatedOverride: isNegotiated ? finalRate : null,
        },
      },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    // ── Email worker ───────────────────────────────────────────────────────
    try {
      await sendBookingRequestEmail({
        to: booking.worker.email,
        workerName: booking.worker.firstName,
        hirerName: `${booking.hirer.firstName} ${booking.hirer.lastName}`,
        booking: {
          id: booking.id,
          title: booking.title,
          category: booking.category?.name || "",
          scheduledAt: booking.scheduledAt,
          address: booking.address,
          agreedRate: booking.agreedRate,
          currency: booking.currency,
        },
      });
    } catch (emailErr) {
      console.error("createBookingFromJobPost email error:", emailErr.message);
    }

    return sendResponse(res, {
      status: 201,
      message: "Booking created from job post",
      data: { booking },
    });
  } catch (err) {
    console.error("createBookingFromJobPost error:", err);
    return sendError(res, "Booking failed");
  }
};

// ── Get my bookings ───────────────────────────────────────────────────────────
export const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (req.user.role === "HIRER") where.hirerId = req.user.id;
    else where.workerId = req.user.id;
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        include: {
          hirer: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          worker: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          category: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        bookings,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch bookings");
  }
};

// ── Get single booking ────────────────────────────────────────────────────────
export const getBooking = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            role: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            role: true,
          },
        },
        category: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        reviews: {
          include: {
            giver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.hirerId !== req.user.id && booking.workerId !== req.user.id) {
      return sendError(res, "Forbidden", 403);
    }

    // Ensure duration fields are properly included
    const responseData = {
      ...booking,
      estimatedHours: booking.estimatedHours || null,
      estimatedUnit: booking.estimatedUnit || "hours",
      estimatedValue: booking.estimatedValue || null,
      quantity: booking.quantity || 1, // ← Add this
      customLabel: booking.custom_label || null,
    };

    return sendResponse(res, { data: { booking: responseData } });
  } catch (err) {
    console.error("getBooking error:", err.message);
    return sendError(res, "Failed to fetch booking");
  }
};

// ── Update booking status ─────────────────────────────────────────────────────
export const updateBookingStatus = async (req, res) => {
  try {
    const { status, cancelReason } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        category: true,
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    // ── Permission check ──────────────────────────────────────────────────────
    const allowed = {
      WORKER: {
        PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
        ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED"],
      },
      HIRER: {
        PENDING: ["CANCELLED"],
        ACCEPTED: ["CANCELLED"],
      },
      ADMIN: {
        PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
        ACCEPTED: ["ACCEPTED", "IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED", "CANCELLED", "DISPUTED"],
        COMPLETED: ["DISPUTED"],
        DISPUTED: ["COMPLETED", "CANCELLED"],
      },
    };

    const permissionsForRole = allowed[req.user.role] || {};
    const permissionsForStatus = permissionsForRole[booking.status] || [];

    if (!permissionsForStatus.includes(status)) {
      return sendError(
        res,
        `${req.user.role} cannot change status from ${booking.status} to ${status}`,
        403,
      );
    }

    // ── Cancel requires a reason ──────────────────────────────────────────────
    if (status === "CANCELLED" && !cancelReason?.trim()) {
      return sendError(res, "A cancellation reason is required", 400);
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status,
        cancelReason: status === "CANCELLED" ? cancelReason.trim() : null,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        checkInAt: status === "IN_PROGRESS" ? new Date() : undefined,
      },
    });

    // ── Email hooks ───────────────────────────────────────────────────────────
    if (status === "ACCEPTED") {
      await sendBookingConfirmedEmail({
        to: booking.hirer.email,
        hirerName: booking.hirer.firstName,
        workerName: `${booking.worker.firstName} ${booking.worker.lastName}`,
        booking: {
          id: booking.id,
          title: booking.title,
          scheduledAt: booking.scheduledAt,
          address: booking.address,
          agreedRate: booking.agreedRate,
          currency: booking.currency,
        },
      });

      // ── In-app notification for Hirer when Worker accepts ──────────────────
      try {
        await notifyBookingAccepted(
          booking.hirerId,
          `${booking.worker.firstName} ${booking.worker.lastName}`,
          booking,
        );
      } catch (notificationError) {
        console.error(
          "Failed to send booking accepted notification:",
          notificationError,
        );
      }
    }

    if (status === "CANCELLED") {
      await Promise.all([
        sendBookingCancelledEmail({
          to: booking.hirer.email,
          name: booking.hirer.firstName,
          booking: {
            id: booking.id,
            title: booking.title,
            scheduledAt: booking.scheduledAt,
          },
          reason: cancelReason,
        }),
        sendBookingCancelledEmail({
          to: booking.worker.email,
          name: booking.worker.firstName,
          booking: {
            id: booking.id,
            title: booking.title,
            scheduledAt: booking.scheduledAt,
          },
          reason: cancelReason,
        }),
      ]);

      // In-app notification to the other party
      const notifyUserId =
        req.user.id === booking.hirerId ? booking.workerId : booking.hirerId;

      const cancellerName =
        req.user.id === booking.hirerId
          ? `${booking.hirer.firstName} ${booking.hirer.lastName}`
          : `${booking.worker.firstName} ${booking.worker.lastName}`;

      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          title: "Booking Cancelled",
          body: `${cancellerName} cancelled the booking "${booking.title}". Reason: ${cancelReason}`,
          type: "BOOKING_CANCELLED",
          data: { bookingId: booking.id, reason: cancelReason },
        },
      });
    }

    if (status === "COMPLETED") {
      await sendJobCompletedEmail({
        to: booking.hirer.email,
        hirerName: booking.hirer.firstName,
        workerName: `${booking.worker.firstName} ${booking.worker.lastName}`,
        booking: { id: booking.id, title: booking.title },
      });

      await Promise.all([
        sendReviewRequestEmail({
          to: booking.hirer.email,
          name: booking.hirer.firstName,
          otherPartyName: `${booking.worker.firstName} ${booking.worker.lastName}`,
          booking: { id: booking.id, title: booking.title },
        }),
        sendReviewRequestEmail({
          to: booking.worker.email,
          name: booking.worker.firstName,
          otherPartyName: `${booking.hirer.firstName} ${booking.hirer.lastName}`,
          booking: { id: booking.id, title: booking.title },
        }),
        convertReferral(booking.workerId, booking.agreedRate),
        convertReferral(booking.hirerId, booking.agreedRate),
      ]).catch((err) => console.error("convertReferral error:", err));

      // ── In-app notification for review requests (both parties) ─────────────
      try {
        await Promise.all([
          notifyReviewRequest(
            booking.hirerId,
            `${booking.worker.firstName} ${booking.worker.lastName}`,
            booking,
          ),
          notifyReviewRequest(
            booking.workerId,
            `${booking.hirer.firstName} ${booking.hirer.lastName}`,
            booking,
          ),
        ]);
      } catch (notificationError) {
        console.error(
          "Failed to send review request notifications:",
          notificationError,
        );
      }
    }

    return sendResponse(res, {
      message: `Booking ${status.toLowerCase()}`,
      data: { booking: updated },
    });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    return sendError(res, "Update failed");
  }
};

// ── Check In ──────────────────────────────────────────────────────────────────
export const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (booking.status !== "ACCEPTED")
      return sendError(res, "Booking must be ACCEPTED to check in", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        checkInAt: new Date(),
        status: "IN_PROGRESS",
        checkInLat: latitude ? parseFloat(latitude) : null,
        checkInLng: longitude ? parseFloat(longitude) : null,
      },
    });

    // Notify hirer with worker GPS
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Worker Checked In 🟢",
        body: "Your worker has arrived and the job is now in progress.",
        type: "BOOKING_CHECKIN",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
        },
      },
    });

    return sendResponse(res, {
      message: "Checked in",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkIn error:", err.message);
    return sendError(res, "Check-in failed");
  }
};

// ── Check Out ─────────────────────────────────────────────────────────────────
export const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true, email: true } },
        worker: { select: { id: true, firstName: true, email: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (booking.status !== "IN_PROGRESS")
      return sendError(res, "Booking must be IN_PROGRESS to check out", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        checkOutAt: new Date(),
        status: "COMPLETED",
        completedAt: new Date(),
        checkOutLat: latitude ? parseFloat(latitude) : null,
        checkOutLng: longitude ? parseFloat(longitude) : null,
      },
    });

    // Notify hirer
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "Job Completed ✅",
        body: "Your worker checked out. Please release payment when satisfied.",
        type: "BOOKING_CHECKOUT",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
        },
      },
    });

    convertReferral(booking.workerId, booking.agreedRate).catch((err) =>
      console.error("convertReferral (checkout) error:", err),
    );

    // Email hirer to release payment
    await sendJobCompletedEmail({
      to: booking.hirer.email,
      hirerName: booking.hirer.firstName,
      workerName: booking.worker.firstName,
      booking: { id: booking.id, title: booking.title },
    });

    // Prompt both to review
    await Promise.all([
      sendReviewRequestEmail({
        to: booking.hirer.email,
        name: booking.hirer.firstName,
        otherPartyName: booking.worker.firstName,
        booking: { id: booking.id, title: booking.title },
      }),
      sendReviewRequestEmail({
        to: booking.worker.email,
        name: booking.worker.firstName,
        otherPartyName: booking.hirer.firstName,
        booking: { id: booking.id, title: booking.title },
      }),
    ]);

    return sendResponse(res, {
      message: "Checked out",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("checkOut error:", err.message);
    return sendError(res, "Check-out failed");
  }
};

// ── Activate SOS ──────────────────────────────────────────────────────────────
export const activateSOS = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        hirer: { select: { id: true, firstName: true, email: true } },
        worker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);
    if (!["ACCEPTED", "IN_PROGRESS"].includes(booking.status)) {
      return sendError(
        res,
        "SOS can only be activated on active bookings",
        400,
      );
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        sosActivatedAt: new Date(),
        sosLatitude: latitude ? parseFloat(latitude) : null,
        sosLongitude: longitude ? parseFloat(longitude) : null,
        sosResolvedAt: null,
      },
    });

    // Notify hirer immediately
    await prisma.notification.create({
      data: {
        userId: booking.hirerId,
        title: "🚨 SOS Alert — Worker Needs Help",
        body: `${booking.worker.firstName} ${booking.worker.lastName} has activated an emergency alert on booking "${booking.title}".`,
        type: "SOS_ACTIVATED",
        data: {
          bookingId: booking.id,
          lat: latitude ? parseFloat(latitude) : null,
          lng: longitude ? parseFloat(longitude) : null,
          activatedAt: new Date().toISOString(),
        },
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            title: "🚨 SOS Alert",
            body: `Worker ${booking.worker.firstName} ${booking.worker.lastName} activated SOS on booking "${booking.title}"`,
            type: "SOS_ACTIVATED",
            data: {
              bookingId: booking.id,
              workerId: booking.workerId,
              lat: latitude ? parseFloat(latitude) : null,
              lng: longitude ? parseFloat(longitude) : null,
            },
          },
        }),
      ),
    );

    return sendResponse(res, {
      status: 201,
      message: "SOS activated. Your hirer and our team have been alerted.",
      data: { booking: updated },
    });
  } catch (err) {
    console.error("activateSOS error:", err.message);
    return sendError(res, "Failed to activate SOS");
  }
};

// ── Resolve SOS ───────────────────────────────────────────────────────────────
export const resolveSOS = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) return sendError(res, "Booking not found", 404);

    const isInvolved =
      booking.workerId === req.user.id ||
      booking.hirerId === req.user.id ||
      req.user.role === "ADMIN";

    if (!isInvolved) return sendError(res, "Forbidden", 403);
    if (!booking.sosActivatedAt)
      return sendError(res, "No active SOS on this booking", 400);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { sosResolvedAt: new Date() },
    });

    // Notify the worker the alert is resolved
    await prisma.notification.create({
      data: {
        userId: booking.workerId,
        title: "✅ SOS Resolved",
        body: "Your emergency alert has been resolved.",
        type: "SOS_RESOLVED",
        data: { bookingId: booking.id },
      },
    });

    return sendResponse(res, {
      message: "SOS resolved",
      data: { booking: updated },
    });
  } catch (err) {
    return sendError(res, "Failed to resolve SOS");
  }
};

// ── Update emergency contact ──────────────────────────────────────────────────
export const updateEmergencyContact = async (req, res) => {
  try {
    const { name, phone, relationship } = req.body;

    if (!name || !phone) {
      return sendError(res, "Name and phone are required", 400);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) return sendError(res, "Booking not found", 404);
    if (booking.workerId !== req.user.id)
      return sendError(res, "Forbidden", 403);

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        emergencyContact: JSON.stringify({ name, phone, relationship }),
      },
    });

    return sendResponse(res, {
      message: "Emergency contact saved",
      data: { emergencyContact: { name, phone, relationship } },
    });
  } catch (err) {
    return sendError(res, "Failed to save emergency contact");
  }
};
