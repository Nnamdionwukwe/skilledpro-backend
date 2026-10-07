// src/controllers/verification.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Full verification controller — workers, hirers, certifications, stats.
//
// USER-FACING (worker):
//   POST   /api/verification/submit-id
//   POST   /api/verification/submit-certification
//   GET    /api/verification/status
//   DELETE /api/verification/certifications/:certId
//
// USER-FACING (hirer):
//   POST   /api/verification/hirer/submit
//   GET    /api/verification/hirer/status
//
// ADMIN (worker):
//   GET    /api/verification/admin/workers/pending
//   GET    /api/verification/admin/workers/verified
//   GET    /api/verification/admin/workers/rejected
//   GET    /api/verification/admin/workers/unverified
//   GET    /api/verification/admin/workers/:userId
//   PATCH  /api/verification/admin/workers/:userId/review
//   PATCH  /api/verification/admin/workers/:userId/revoke
//   PATCH  /api/verification/admin/workers/:userId/background-check
//
// ADMIN (hirer):
//   GET    /api/verification/admin/hirers/pending
//   GET    /api/verification/admin/hirers/verified
//   GET    /api/verification/admin/hirers/rejected
//   GET    /api/verification/admin/hirers/:userId
//   PATCH  /api/verification/admin/hirers/:userId/review
//   PATCH  /api/verification/admin/hirers/:userId/revoke
//
// ADMIN (certifications):
//   GET    /api/verification/admin/certifications/pending
//   PATCH  /api/verification/admin/certifications/:certId/verify
//   PATCH  /api/verification/admin/certifications/:certId/reject
//
// ADMIN (summary):
//   GET    /api/verification/admin/stats
//   GET    /api/verification/admin/activity
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { createNotification } from "../services/notification.service.js";
import { logAdminAction } from "../utils/auditLog.js";
import { paginate } from "../utils/helpers.js";
import { v2 as cloudinary } from "cloudinary";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SELECTORS — one place to change if the shape needs to grow
// ─────────────────────────────────────────────────────────────────────────────

const FULL_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  country: true,
  city: true,
  state: true,
  gender: true,
  language: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  isActive: true,
  isBanned: true,
  createdAt: true,
  lastSeen: true,
};

const WORKER_LIST_INCLUDE = {
  user: { select: FULL_USER_SELECT },
  certifications: true,
  categories: {
    include: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
    },
  },
  portfolio: true,
  availability: true,
};

const HIRER_LIST_INCLUDE = {
  user: { select: FULL_USER_SELECT },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fallback: if a worker submitted before the schema migration (metadata
 * lives in a Notification row instead of the new columns), surface it here.
 * Returns null if nothing is found.
 */
async function legacyWorkerSubmission(userId) {
  const note = await prisma.notification.findFirst({
    where: { userId, type: "VERIFICATION_SUBMITTED" },
    orderBy: { createdAt: "desc" },
  });
  if (!note) return null;
  return {
    submissionData: note.data || null,
    submittedAt: note.createdAt,
  };
}

async function legacyHirerSubmission(userId) {
  const note = await prisma.notification.findFirst({
    where: { userId, type: "HIRER_VERIFICATION_SUBMITTED" },
    orderBy: { createdAt: "desc" },
  });
  if (!note) return null;
  return {
    submissionData: note.data || null,
    submittedAt: note.createdAt,
  };
}

function shapeWorker(w, legacy = null) {
  const sub = {
    idType: w.idType ?? legacy?.submissionData?.idType ?? null,
    idNumber: w.idNumber ?? legacy?.submissionData?.idNumber ?? null,
    dateOfBirth: w.idDateOfBirth ?? legacy?.submissionData?.dateOfBirth ?? null,
    nationality: w.idNationality ?? legacy?.submissionData?.nationality ?? null,
    documentUrl: w.idDocument ?? legacy?.submissionData?.documentUrl ?? null,
    submittedAt: w.submittedAt ?? legacy?.submittedAt ?? null,
    reviewedAt: w.reviewedAt ?? null,
    rejectionReason: w.rejectionReason ?? null,
  };
  return {
    ...w,
    submissionData: sub,
    submittedAt: sub.submittedAt,
  };
}

function shapeHirer(h, legacy = null) {
  const sub = {
    verificationType: h.verificationType ?? null,
    idType: h.idType ?? legacy?.submissionData?.idType ?? null,
    idNumber: h.idNumber ?? legacy?.submissionData?.idNumber ?? null,
    documentUrl: h.idDocument ?? legacy?.submissionData?.documentUrl ?? null,
    companyName: h.companyName ?? legacy?.submissionData?.companyName ?? null,
    companyRegNumber:
      h.companyRegNumber ?? legacy?.submissionData?.companyRegNumber ?? null,
    companyCountry:
      h.companyCountry ?? legacy?.submissionData?.companyCountry ?? null,
    website: h.website ?? legacy?.submissionData?.website ?? null,
    status: h.verificationStatus,
    submittedAt: h.submittedAt ?? legacy?.submittedAt ?? null,
    reviewedAt: h.reviewedAt ?? null,
    rejectionReason: h.rejectionReason ?? null,
  };
  return {
    ...h,
    submissionData: sub,
    submittedAt: sub.submittedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  USER-FACING — WORKER SUBMISSION
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/verification/submit-id
export const submitIdVerification = async (req, res) => {
  try {
    const { idType, idNumber, dateOfBirth, nationality } = req.body;
    if (!idType || !idNumber)
      return sendError(res, "ID type and ID number are required", 400);
    if (!req.file) return sendError(res, "ID document image is required", 400);

    const validIdTypes = [
      "NATIONAL_ID",
      "PASSPORT",
      "DRIVERS_LICENSE",
      "VOTERS_CARD",
      "RESIDENCE_PERMIT",
      "WORK_PERMIT",
    ];
    if (!validIdTypes.includes(idType)) {
      return sendError(
        res,
        `ID type must be one of: ${validIdTypes.join(", ")}`,
        400,
      );
    }

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);
    if (worker.verificationStatus === "VERIFIED")
      return sendError(res, "Your profile is already verified", 400);

    const documentUrl = req.file.path;

    const updated = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: {
        idDocument: documentUrl,
        idType,
        idNumber,
        idDateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        idNationality: nationality || null,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
        verificationStatus: "PENDING",
      },
    });

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        createNotification({
          userId: a.id,
          title: "New Verification Request",
          body: `${req.user.firstName} ${req.user.lastName} submitted ID for verification.`,
          type: "VERIFICATION_REQUEST",
          data: { workerId: req.user.id, idType, documentUrl },
          icon: "FaIdCard",
        }).catch(() => {}),
      ),
    );

    // Confirm to the worker
    await createNotification({
      userId: req.user.id,
      title: "Verification Submitted",
      body: "Your ID has been submitted for verification. We'll review within 24–48 hours.",
      type: "VERIFICATION_SUBMITTED",
      data: { idType, documentUrl, submittedAt: updated.submittedAt },
      icon: "FaClock",
    }).catch(() => {});

    return sendResponse(res, {
      status: 201,
      message:
        "ID submitted successfully. Verification usually takes 24–48 hours.",
      data: {
        verificationStatus: updated.verificationStatus,
        documentUrl,
        idType,
        submittedAt: updated.submittedAt,
      },
    });
  } catch (err) {
    console.error("submitIdVerification:", err);
    return sendError(res, "Failed to submit ID verification");
  }
};

// POST /api/verification/submit-certification
export const submitCertification = async (req, res) => {
  try {
    const { name, issuedBy, issueDate, expiryDate } = req.body;
    if (!name || !issuedBy)
      return sendError(
        res,
        "Certification name and issuing body are required",
        400,
      );

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);

    const documentUrl = req.file?.path || null;
    const cert = await prisma.certification.create({
      data: {
        workerProfileId: worker.id,
        name,
        issuedBy,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        documentUrl,
        verified: false,
      },
    });

    return sendResponse(res, {
      status: 201,
      message: "Certification submitted for review",
      data: { certification: cert },
    });
  } catch (err) {
    console.error("submitCertification:", err);
    return sendError(res, "Failed to submit certification");
  }
};

// GET /api/verification/status
export const getVerificationStatus = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
      select: {
        verificationStatus: true,
        idDocument: true,
        idType: true,
        idNumber: true,
        idDateOfBirth: true,
        idNationality: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        backgroundCheck: true,
        backgroundCheckAt: true,
        certifications: true,
      },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);

    const legacy =
      worker.submittedAt == null
        ? await legacyWorkerSubmission(req.user.id)
        : null;

    const statusMessages = {
      UNVERIFIED: "You have not submitted your ID yet.",
      PENDING: "Your ID is under review. This usually takes 24–48 hours.",
      VERIFIED: "Your profile is fully verified.",
      REJECTED:
        "Your verification was rejected. Please re-submit with a valid document.",
    };

    return sendResponse(res, {
      data: {
        verificationStatus: worker.verificationStatus,
        statusMessage: statusMessages[worker.verificationStatus],
        idDocument: worker.idDocument,
        idType: worker.idType,
        idNumber: worker.idNumber,
        idDateOfBirth: worker.idDateOfBirth,
        idNationality: worker.idNationality,
        submittedAt: worker.submittedAt ?? legacy?.submittedAt ?? null,
        reviewedAt: worker.reviewedAt,
        rejectionReason: worker.rejectionReason,
        backgroundCheck: worker.backgroundCheck,
        backgroundCheckAt: worker.backgroundCheckAt,
        certifications: worker.certifications,
      },
    });
  } catch (err) {
    console.error("getVerificationStatus:", err);
    return sendError(res, "Failed to fetch verification status");
  }
};

// DELETE /api/verification/certifications/:certId
export const deleteCertification = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!worker) return sendError(res, "Worker profile not found", 404);

    const cert = await prisma.certification.findFirst({
      where: { id: req.params.certId, workerProfileId: worker.id },
    });
    if (!cert) return sendError(res, "Certification not found", 404);

    if (cert.documentUrl) {
      try {
        const publicId = cert.documentUrl
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^/.]+$/, "");
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.warn("Cloudinary delete warning:", e.message);
      }
    }

    await prisma.certification.delete({ where: { id: req.params.certId } });
    return sendResponse(res, { message: "Certification deleted" });
  } catch (err) {
    console.error("deleteCertification:", err);
    return sendError(res, "Failed to delete certification");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  USER-FACING — HIRER SUBMISSION
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/verification/hirer/submit
export const submitHirerVerification = async (req, res) => {
  try {
    const {
      verificationType,
      idType,
      idNumber,
      companyName,
      companyRegNumber,
      companyCountry,
      website,
    } = req.body;

    if (!verificationType)
      return sendError(res, "Verification type is required", 400);
    if (!["INDIVIDUAL", "BUSINESS"].includes(verificationType))
      return sendError(
        res,
        "Verification type must be INDIVIDUAL or BUSINESS",
        400,
      );
    if (verificationType === "INDIVIDUAL" && (!idType || !idNumber))
      return sendError(
        res,
        "ID type and ID number are required for individual verification",
        400,
      );
    if (verificationType === "BUSINESS" && (!companyName || !companyRegNumber))
      return sendError(
        res,
        "Company name and registration number are required for business verification",
        400,
      );
    if (!req.file)
      return sendError(res, "Verification document is required", 400);

    const hirerProfile = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!hirerProfile) return sendError(res, "Hirer profile not found", 404);
    if (hirerProfile.verificationStatus === "PENDING")
      return sendError(
        res,
        "You already have a pending verification. Please wait for review.",
        409,
      );

    const documentUrl = req.file.path;

    const updated = await prisma.hirerProfile.update({
      where: { userId: req.user.id },
      data: {
        verificationType,
        idType: idType || null,
        idNumber: idNumber || null,
        idDocument: documentUrl,
        companyRegNumber: companyRegNumber || null,
        companyCountry: companyCountry || null,
        companyName: companyName || hirerProfile.companyName,
        website: website || hirerProfile.website,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
        verificationStatus: "PENDING",
      },
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        createNotification({
          userId: a.id,
          title: "New Hirer Verification Request",
          body: `Hirer submitted ${verificationType} verification. Company: ${companyName || "N/A"}`,
          type: "HIRER_VERIFICATION_REQUEST",
          data: {
            hirerId: req.user.id,
            verificationType,
            companyName,
            documentUrl,
          },
          icon: "FaIdCard",
        }).catch(() => {}),
      ),
    );

    await createNotification({
      userId: req.user.id,
      title: "Verification Submitted",
      body: "Your verification documents have been submitted. We will review within 24–48 hours.",
      type: "HIRER_VERIFICATION_SUBMITTED",
      data: { verificationType, documentUrl, submittedAt: updated.submittedAt },
      icon: "FaClock",
    }).catch(() => {});

    return sendResponse(res, {
      status: 201,
      message: "Verification submitted. Review takes 24–48 hours.",
      data: {
        verificationType,
        documentUrl,
        status: "PENDING",
        submittedAt: updated.submittedAt,
      },
    });
  } catch (err) {
    console.error("submitHirerVerification:", err);
    return sendError(res, "Failed to submit hirer verification");
  }
};

// GET /api/verification/hirer/status
export const getHirerVerificationStatus = async (req, res) => {
  try {
    const hirerProfile = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });
    if (!hirerProfile) return sendError(res, "Hirer profile not found", 404);

    const legacy =
      hirerProfile.submittedAt == null
        ? await legacyHirerSubmission(req.user.id)
        : null;

    const statusMessages = {
      UNVERIFIED: "You have not submitted verification documents yet.",
      PENDING:
        "Your documents are under review. This usually takes 24–48 hours.",
      VERIFIED: "Your account is verified.",
      REJECTED:
        "Your verification was rejected. Please re-submit with valid documents.",
    };

    return sendResponse(res, {
      data: {
        currentStatus: hirerProfile.verificationStatus,
        statusMessage: statusMessages[hirerProfile.verificationStatus],
        hirerProfile,
        latestSubmission: {
          verificationType: hirerProfile.verificationType,
          companyName: hirerProfile.companyName,
          documentUrl: hirerProfile.idDocument,
          submittedAt: hirerProfile.submittedAt ?? legacy?.submittedAt ?? null,
        },
        latestReview: hirerProfile.reviewedAt
          ? {
              status: hirerProfile.verificationStatus,
              rejectionReason: hirerProfile.rejectionReason,
              reviewedAt: hirerProfile.reviewedAt,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("getHirerVerificationStatus:", err);
    return sendError(res, "Failed to fetch hirer verification status");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  ADMIN — WORKER LISTS
// ─────────────────────────────────────────────────────────────────────────────

async function listWorkersByStatus(status, req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where: { verificationStatus: status },
        skip,
        take,
        include: WORKER_LIST_INCLUDE,
        orderBy:
          status === "PENDING" ? { submittedAt: "asc" } : { updatedAt: "desc" },
      }),
      prisma.workerProfile.count({ where: { verificationStatus: status } }),
    ]);

    const shaped = await Promise.all(
      workers.map(async (w) => {
        const legacy =
          w.submittedAt == null ? await legacyWorkerSubmission(w.userId) : null;
        return shapeWorker(w, legacy);
      }),
    );

    return sendResponse(res, {
      data: {
        workers: shaped,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("listWorkersByStatus:", err);
    return sendError(res, "Failed to fetch workers");
  }
}

export const getPendingWorkers = (req, res) =>
  listWorkersByStatus("PENDING", req, res);
export const getVerifiedWorkers = (req, res) =>
  listWorkersByStatus("VERIFIED", req, res);
export const getRejectedWorkers = (req, res) =>
  listWorkersByStatus("REJECTED", req, res);
export const getUnverifiedWorkers = (req, res) =>
  listWorkersByStatus("UNVERIFIED", req, res);

// GET /api/verification/admin/workers/:userId
export const getWorkerVerificationDetail = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        ...WORKER_LIST_INCLUDE,
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        backgroundCheckedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!worker) return sendError(res, "Worker not found", 404);

    const legacy =
      worker.submittedAt == null
        ? await legacyWorkerSubmission(worker.userId)
        : null;

    return sendResponse(res, { data: { worker: shapeWorker(worker, legacy) } });
  } catch (err) {
    console.error("getWorkerVerificationDetail:", err);
    return sendError(res, "Failed to fetch worker detail");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  ADMIN — WORKER ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/verification/admin/workers/:userId/review
// Body: { status: "VERIFIED" | "REJECTED", rejectionReason?, notes? }
export const reviewWorkerVerification = async (req, res) => {
  try {
    const { status, rejectionReason, notes } = req.body;
    if (!["VERIFIED", "REJECTED"].includes(status))
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);
    if (status === "REJECTED" && !rejectionReason)
      return sendError(res, "Rejection reason is required", 400);

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!worker) return sendError(res, "Worker not found", 404);
    if (worker.verificationStatus !== "PENDING")
      return sendError(res, "Worker is not in PENDING state", 400);

    const previousStatus = worker.verificationStatus;

    const updated = await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: {
        verificationStatus: status,
        reviewedAt: new Date(),
        reviewedById: req.user.id,
        rejectionReason: status === "REJECTED" ? rejectionReason : null,
      },
    });

    await createNotification({
      userId: req.params.userId,
      title:
        status === "VERIFIED" ? "Identity Verified" : "Verification Rejected",
      body:
        status === "VERIFIED"
          ? "Your identity has been verified. Your profile now shows the Verified badge."
          : `Your verification was rejected. Reason: ${rejectionReason}. Please re-submit with a valid document.`,
      type: "VERIFICATION_UPDATE",
      data: {
        status,
        rejectionReason: rejectionReason || null,
        reviewedBy: req.user.id,
        reviewedAt: new Date().toISOString(),
      },
      icon: status === "VERIFIED" ? "FaCheckCircle" : "FaTimesCircle",
    }).catch(() => {});

    await logAdminAction({
      req,
      adminId: req.user.id,
      action:
        status === "VERIFIED" ? "USER_VERIFIED" : "USER_VERIFICATION_REJECTED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `${status === "VERIFIED" ? "Verified" : "Rejected"} worker verification — ${rejectionReason || notes || ""}`,
      before: { verificationStatus: previousStatus },
      after: { verificationStatus: status, rejectionReason },
      meta: { rejectionReason, notes },
    }).catch((e) => console.error("logAdminAction:", e.message));

    return sendResponse(res, {
      message: `Worker ${status === "VERIFIED" ? "verified" : "rejected"} successfully`,
      data: {
        userId: req.params.userId,
        workerName: `${worker.user.firstName} ${worker.user.lastName}`,
        status,
        rejectionReason: rejectionReason || null,
        reviewedAt: updated.reviewedAt,
      },
    });
  } catch (err) {
    console.error("reviewWorkerVerification:", err);
    return sendError(res, "Failed to review verification");
  }
};

// PATCH /api/verification/admin/workers/:userId/revoke
// Body: { reason }
export const revokeWorkerVerification = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return sendError(res, "Reason is required", 400);

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!worker) return sendError(res, "Worker not found", 404);
    if (worker.verificationStatus !== "VERIFIED")
      return sendError(res, "Worker is not currently verified", 400);

    const updated = await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: {
        verificationStatus: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: req.user.id,
        rejectionReason: reason,
      },
    });

    await createNotification({
      userId: req.params.userId,
      title: "Verification Revoked",
      body: `Your verification has been revoked. Reason: ${reason}. Please contact support.`,
      type: "VERIFICATION_UPDATE",
      data: { status: "REJECTED", rejectionReason: reason },
      icon: "FaTimesCircle",
    }).catch(() => {});

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_VERIFICATION_REJECTED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `Revoked worker verification — ${reason}`,
      before: { verificationStatus: "VERIFIED" },
      after: { verificationStatus: "REJECTED", rejectionReason: reason },
      meta: { reason },
    }).catch(() => {});

    return sendResponse(res, {
      message: "Worker verification revoked",
      data: { userId: req.params.userId, status: updated.verificationStatus },
    });
  } catch (err) {
    console.error("revokeWorkerVerification:", err);
    return sendError(res, "Failed to revoke verification");
  }
};

// PATCH /api/verification/admin/workers/:userId/background-check
// Body: { passed, notes? }
export const updateBackgroundCheck = async (req, res) => {
  try {
    const { passed } = req.body;
    if (typeof passed !== "boolean")
      return sendError(res, "passed must be a boolean", 400);

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!worker) return sendError(res, "Worker not found", 404);

    const updated = await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: {
        backgroundCheck: passed,
        backgroundCheckAt: new Date(),
        backgroundCheckedById: req.user.id,
      },
    });

    await createNotification({
      userId: req.params.userId,
      title: passed ? "Background Check Passed" : "Background Check Failed",
      body: passed
        ? "Your background check has been completed and passed."
        : "Your background check status has been updated.",
      type: "BACKGROUND_CHECK_UPDATE",
      data: { passed, updatedAt: new Date().toISOString() },
      icon: passed ? "FaCheckCircle" : "FaTimesCircle",
    }).catch(() => {});

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_VERIFIED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `Background check ${passed ? "passed" : "failed"} for ${worker.userId}`,
      before: { backgroundCheck: worker.backgroundCheck },
      after: { backgroundCheck: passed },
      meta: { passed },
    }).catch(() => {});

    return sendResponse(res, {
      message: "Background check updated",
      data: {
        backgroundCheck: updated.backgroundCheck,
        backgroundCheckAt: updated.backgroundCheckAt,
      },
    });
  } catch (err) {
    console.error("updateBackgroundCheck:", err);
    return sendError(res, "Failed to update background check");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  ADMIN — HIRER LISTS
// ─────────────────────────────────────────────────────────────────────────────

async function listHirersByStatus(status, req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [hirers, total] = await Promise.all([
      prisma.hirerProfile.findMany({
        where: { verificationStatus: status },
        skip,
        take,
        include: HIRER_LIST_INCLUDE,
        orderBy:
          status === "PENDING" ? { submittedAt: "asc" } : { updatedAt: "desc" },
      }),
      prisma.hirerProfile.count({ where: { verificationStatus: status } }),
    ]);

    const shaped = await Promise.all(
      hirers.map(async (h) => {
        const legacy =
          h.submittedAt == null ? await legacyHirerSubmission(h.userId) : null;
        return shapeHirer(h, legacy);
      }),
    );

    return sendResponse(res, {
      data: {
        hirers: shaped,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("listHirersByStatus:", err);
    return sendError(res, "Failed to fetch hirers");
  }
}

export const getPendingHirers = (req, res) =>
  listHirersByStatus("PENDING", req, res);
export const getVerifiedHirers = (req, res) =>
  listHirersByStatus("VERIFIED", req, res);
export const getRejectedHirers = (req, res) =>
  listHirersByStatus("REJECTED", req, res);

// GET /api/verification/admin/hirers/:userId
export const getHirerVerificationDetail = async (req, res) => {
  try {
    const hirer = await prisma.hirerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        ...HIRER_LIST_INCLUDE,
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!hirer) return sendError(res, "Hirer not found", 404);

    const legacy =
      hirer.submittedAt == null
        ? await legacyHirerSubmission(hirer.userId)
        : null;

    return sendResponse(res, { data: { hirer: shapeHirer(hirer, legacy) } });
  } catch (err) {
    console.error("getHirerVerificationDetail:", err);
    return sendError(res, "Failed to fetch hirer detail");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  ADMIN — HIRER ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/verification/admin/hirers/:userId/review
// Body: { status: "VERIFIED" | "REJECTED", rejectionReason?, notes? }
export const reviewHirerVerification = async (req, res) => {
  try {
    const { status, rejectionReason, notes } = req.body;
    if (!["VERIFIED", "REJECTED"].includes(status))
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);
    if (status === "REJECTED" && !rejectionReason)
      return sendError(res, "Rejection reason is required", 400);

    const hirer = await prisma.hirerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!hirer) return sendError(res, "Hirer not found", 404);
    if (hirer.verificationStatus !== "PENDING")
      return sendError(res, "Hirer is not in PENDING state", 400);

    const previousStatus = hirer.verificationStatus;

    const updated = await prisma.hirerProfile.update({
      where: { userId: req.params.userId },
      data: {
        verificationStatus: status,
        reviewedAt: new Date(),
        reviewedById: req.user.id,
        rejectionReason: status === "REJECTED" ? rejectionReason : null,
      },
    });

    await createNotification({
      userId: req.params.userId,
      title:
        status === "VERIFIED" ? "Account Verified" : "Verification Rejected",
      body:
        status === "VERIFIED"
          ? "Your account has been verified. You now have a Verified badge."
          : `Your verification was rejected. Reason: ${rejectionReason}. Please re-submit valid documents.`,
      type:
        status === "VERIFIED"
          ? "HIRER_VERIFICATION_APPROVED"
          : "HIRER_VERIFICATION_REJECTED",
      data: { status, rejectionReason, reviewedBy: req.user.id },
      icon: status === "VERIFIED" ? "FaCheckCircle" : "FaTimesCircle",
    }).catch(() => {});

    await logAdminAction({
      req,
      adminId: req.user.id,
      action:
        status === "VERIFIED" ? "USER_VERIFIED" : "USER_VERIFICATION_REJECTED",
      targetType: "USER",
      targetId: req.params.userId,
      description: `${status === "VERIFIED" ? "Verified" : "Rejected"} hirer verification — ${rejectionReason || notes || ""}`,
      before: { verificationStatus: previousStatus },
      after: { verificationStatus: status, rejectionReason },
      meta: { rejectionReason, notes },
    }).catch(() => {});

    return sendResponse(res, {
      message: `Hirer verification ${status === "VERIFIED" ? "approved" : "rejected"} successfully`,
      data: {
        userId: req.params.userId,
        hirerName: `${hirer.user.firstName} ${hirer.user.lastName}`,
        status,
        rejectionReason: rejectionReason || null,
        reviewedAt: updated.reviewedAt,
      },
    });
  } catch (err) {
    console.error("reviewHirerVerification:", err);
    return sendError(res, "Failed to review hirer verification");
  }
};

// PATCH /api/verification/admin/hirers/:userId/revoke
export const revokeHirerVerification = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return sendError(res, "Reason is required", 400);

    const hirer = await prisma.hirerProfile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!hirer) return sendError(res, "Hirer not found", 404);
    if (hirer.verificationStatus !== "VERIFIED")
      return sendError(res, "Hirer is not currently verified", 400);

    const updated = await prisma.hirerProfile.update({
      where: { userId: req.params.userId },
      data: {
        verificationStatus: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: req.user.id,
        rejectionReason: reason,
      },
    });

    await createNotification({
      userId: req.params.userId,
      title: "Verification Revoked",
      body: `Your verification has been revoked. Reason: ${reason}. Please contact support.`,
      type: "HIRER_VERIFICATION_REJECTED",
      data: { status: "REJECTED", rejectionReason: reason },
      icon: "FaTimesCircle",
    }).catch(() => {});

    return sendResponse(res, {
      message: "Hirer verification revoked",
      data: { userId: req.params.userId, status: updated.verificationStatus },
    });
  } catch (err) {
    console.error("revokeHirerVerification:", err);
    return sendError(res, "Failed to revoke hirer verification");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7  ADMIN — CERTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/verification/admin/certifications/pending
export const getPendingCertifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [certs, total] = await Promise.all([
      prisma.certification.findMany({
        where: { verified: false, rejectionReason: null },
        skip,
        take,
        include: {
          workerProfile: {
            include: { user: { select: FULL_USER_SELECT } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.certification.count({
        where: { verified: false, rejectionReason: null },
      }),
    ]);

    return sendResponse(res, {
      data: {
        certifications: certs,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getPendingCertifications:", err);
    return sendError(res, "Failed to fetch pending certifications");
  }
};

// PATCH /api/verification/admin/certifications/:certId/verify
export const verifyCertification = async (req, res) => {
  try {
    const cert = await prisma.certification.update({
      where: { id: req.params.certId },
      data: {
        verified: true,
        verifiedAt: new Date(),
        verifiedById: req.user.id,
        rejectionReason: null,
      },
      include: { workerProfile: { select: { userId: true } } },
    });

    await createNotification({
      userId: cert.workerProfile.userId,
      title: "Certification Verified",
      body: `Your "${cert.name}" certification has been verified.`,
      type: "CERTIFICATION_VERIFIED",
      data: { certificationId: cert.id, name: cert.name },
      icon: "FaCheckCircle",
    }).catch(() => {});

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "USER_VERIFIED",
      targetType: "USER",
      targetId: cert.workerProfile.userId,
      description: `Verified certification "${cert.name}"`,
      meta: { certificationId: cert.id },
    }).catch(() => {});

    return sendResponse(res, {
      message: "Certification verified",
      data: { certification: cert },
    });
  } catch (err) {
    console.error("verifyCertification:", err);
    return sendError(res, "Failed to verify certification");
  }
};

// PATCH /api/verification/admin/certifications/:certId/reject
export const rejectCertification = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return sendError(res, "Reason is required", 400);

    const cert = await prisma.certification.update({
      where: { id: req.params.certId },
      data: {
        verified: false,
        rejectionReason: reason,
        verifiedById: req.user.id,
        verifiedAt: new Date(),
      },
      include: { workerProfile: { select: { userId: true } } },
    });

    await createNotification({
      userId: cert.workerProfile.userId,
      title: "Certification Rejected",
      body: `Your "${cert.name}" certification was rejected. Reason: ${reason}`,
      type: "CERTIFICATION_REJECTED",
      data: { certificationId: cert.id, reason },
      icon: "FaTimesCircle",
    }).catch(() => {});

    return sendResponse(res, {
      message: "Certification rejected",
      data: { certification: cert },
    });
  } catch (err) {
    console.error("rejectCertification:", err);
    return sendError(res, "Failed to reject certification");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 8  ADMIN — STATS + ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/verification/admin/stats
export const getVerificationStats = async (req, res) => {
  try {
    const [
      wUnverified,
      wPending,
      wVerified,
      wRejected,
      wBgChecked,
      hUnverified,
      hPending,
      hVerified,
      hRejected,
      cPending,
      cVerified,
    ] = await Promise.all([
      prisma.workerProfile.count({
        where: { verificationStatus: "UNVERIFIED" },
      }),
      prisma.workerProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.workerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.workerProfile.count({ where: { verificationStatus: "REJECTED" } }),
      prisma.workerProfile.count({ where: { backgroundCheck: true } }),
      prisma.hirerProfile.count({
        where: { verificationStatus: "UNVERIFIED" },
      }),
      prisma.hirerProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.hirerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.hirerProfile.count({ where: { verificationStatus: "REJECTED" } }),
      prisma.certification.count({
        where: { verified: false, rejectionReason: null },
      }),
      prisma.certification.count({ where: { verified: true } }),
    ]);

    return sendResponse(res, {
      data: {
        workers: {
          unverified: wUnverified,
          pending: wPending,
          verified: wVerified,
          rejected: wRejected,
          backgroundChecked: wBgChecked,
          total: wUnverified + wPending + wVerified + wRejected,
        },
        hirers: {
          unverified: hUnverified,
          pending: hPending,
          verified: hVerified,
          rejected: hRejected,
          total: hUnverified + hPending + hVerified + hRejected,
        },
        certifications: {
          pending: cPending,
          verified: cVerified,
          total: cPending + cVerified,
        },
      },
    });
  } catch (err) {
    console.error("getVerificationStats:", err);
    return sendError(res, "Failed to fetch verification stats");
  }
};

// GET /api/verification/admin/activity
// Recent verification events (last 30 days) for the admin dashboard feed.
export const getVerificationActivityLog = async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const since = new Date(Date.now() - 30 * 86_400_000);

    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: {
          in: ["USER_VERIFIED", "USER_VERIFICATION_REJECTED"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit) || 30, 100),
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    // Enrich with the target user's basic info so the UI can render rows
    const userIds = [...new Set(logs.map((l) => l.targetId).filter(Boolean))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
        role: true,
      },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = logs.map((l) => ({
      ...l,
      targetUser: l.targetId ? userMap[l.targetId] || null : null,
    }));

    return sendResponse(res, {
      data: { activity: enriched, total: enriched.length },
    });
  } catch (err) {
    console.error("getVerificationActivityLog:", err);
    return sendError(res, "Failed to fetch verification activity");
  }
};
