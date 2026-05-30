import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { sendRealTimeNotification } from "./notification.controller.js";
import { v2 as cloudinary } from "cloudinary";

// ── WORKER: Submit ID for verification ───────────────────────────────────────
// POST /api/verification/submit-id
export const submitIdVerification = async (req, res) => {
  try {
    const { idType, idNumber, dateOfBirth, nationality } = req.body;

    if (!idType || !idNumber) {
      return sendError(res, "ID type and ID number are required", 400);
    }

    if (!req.file) {
      return sendError(res, "ID document image is required", 400);
    }

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

    if (!worker) {
      return sendError(res, "Worker profile not found", 404);
    }

    if (worker.verificationStatus === "VERIFIED") {
      return sendError(res, "Your profile is already verified", 400);
    }

    // Upload to Cloudinary under a secure folder
    const documentUrl = req.file.path;

    // Update worker profile with ID document and set status to PENDING
    const updated = await prisma.workerProfile.update({
      where: { userId: req.user.id },
      data: {
        idDocument: documentUrl,
        verificationStatus: "PENDING",
      },
    });

    // Store verification metadata in a JSON field on workerProfile
    // We use the idDocument field for the URL and track extra info via notification
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Verification Submitted ✅",
        body: "Your ID has been submitted for verification. We'll review within 24–48 hours.",
        type: "VERIFICATION_SUBMITTED",
        data: {
          idType,
          idNumber,
          dateOfBirth: dateOfBirth || null,
          nationality: nationality || null,
          documentUrl,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await sendRealTimeNotification({
        userId: admin.id,
        title: "New Verification Request 📋",
        body: `Worker ${req.user.firstName || ""} ${req.user.lastName || ""} submitted ID for verification.`,
        type: "VERIFICATION_REQUEST",
        data: {
          workerId: req.user.id,
          idType,
          documentUrl,
        },
      });
    }

    return sendResponse(res, {
      status: 201,
      message:
        "ID submitted successfully. Verification usually takes 24–48 hours.",
      data: {
        verificationStatus: updated.verificationStatus,
        documentUrl,
        idType,
        submittedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to submit ID verification");
  }
};

// ── WORKER: Submit a professional certification ───────────────────────────────
// POST /api/verification/submit-certification
export const submitCertification = async (req, res) => {
  try {
    const { name, issuedBy, issueDate, expiryDate } = req.body;

    if (!name || !issuedBy) {
      return sendError(
        res,
        "Certification name and issuing body are required",
        400,
      );
    }

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
    console.error(err);
    return sendError(res, "Failed to submit certification");
  }
};

// ── WORKER: Get own verification status ──────────────────────────────────────
// GET /api/verification/status
export const getVerificationStatus = async (req, res) => {
  try {
    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.user.id },
      select: {
        verificationStatus: true,
        idDocument: true,
        backgroundCheck: true,
        certifications: {
          select: {
            id: true,
            name: true,
            issuedBy: true,
            issueDate: true,
            expiryDate: true,
            documentUrl: true,
            verified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!worker) return sendError(res, "Worker profile not found", 404);

    // Get latest verification notification for metadata
    const latestSubmission = await prisma.notification.findFirst({
      where: {
        userId: req.user.id,
        type: "VERIFICATION_SUBMITTED",
      },
      orderBy: { createdAt: "desc" },
    });

    const statusMessages = {
      UNVERIFIED: "You have not submitted your ID yet.",
      PENDING: "Your ID is under review. This usually takes 24–48 hours.",
      VERIFIED: "Your profile is fully verified ✅",
      REJECTED:
        "Your verification was rejected. Please re-submit with a valid document.",
    };

    return sendResponse(res, {
      data: {
        verificationStatus: worker.verificationStatus,
        statusMessage: statusMessages[worker.verificationStatus],
        idDocument: worker.idDocument,
        backgroundCheck: worker.backgroundCheck,
        certifications: worker.certifications,
        lastSubmittedAt: latestSubmission?.createdAt || null,
        submissionData: latestSubmission?.data || null,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch verification status");
  }
};

// ── WORKER: Delete a certification ───────────────────────────────────────────
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

    // Delete from Cloudinary if has URL
    if (cert.documentUrl) {
      try {
        const publicId = cert.documentUrl
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^/.]+$/, "");
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.warn("Cloudinary delete warning:", cloudErr.message);
      }
    }

    await prisma.certification.delete({ where: { id: req.params.certId } });

    return sendResponse(res, { message: "Certification deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete certification");
  }
};

// ── ADMIN: Get all pending verifications ─────────────────────────────────────
// GET /api/verification/admin/pending
export const getPendingVerifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where: { verificationStatus: "PENDING" },
        skip,
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatar: true,
              country: true,
              city: true,
              createdAt: true,
            },
          },
          certifications: true,
          categories: {
            include: { category: { select: { name: true, icon: true } } },
          },
        },
        orderBy: { updatedAt: "asc" },
      }),
      prisma.workerProfile.count({ where: { verificationStatus: "PENDING" } }),
    ]);

    // Enrich with submission metadata from notifications
    const enriched = await Promise.all(
      workers.map(async (w) => {
        const submission = await prisma.notification.findFirst({
          where: { userId: w.userId, type: "VERIFICATION_SUBMITTED" },
          orderBy: { createdAt: "desc" },
        });
        return {
          ...w,
          submissionData: submission?.data || null,
          submittedAt: submission?.createdAt || null,
        };
      }),
    );

    return sendResponse(res, {
      data: {
        workers: enriched,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch pending verifications");
  }
};

// ── ADMIN: Get all verified workers ──────────────────────────────────────────
// GET /api/verification/admin/verified
export const getVerifiedWorkers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where: { verificationStatus: "VERIFIED" },
        skip,
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              country: true,
              city: true,
            },
          },
          categories: {
            include: { category: { select: { name: true, icon: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.workerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
    ]);

    return sendResponse(res, {
      data: {
        workers,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch verified workers");
  }
};

// ── ADMIN: Approve or reject a worker verification ───────────────────────────
// PATCH /api/verification/admin/:userId/review
export const reviewVerification = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);
    }

    if (status === "REJECTED" && !rejectionReason) {
      return sendError(res, "Rejection reason is required", 400);
    }

    const worker = await prisma.workerProfile.findUnique({
      where: { userId: req.params.userId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!worker) return sendError(res, "Worker not found", 404);

    if (worker.verificationStatus !== "PENDING") {
      return sendError(res, "Worker is not in PENDING verification state", 400);
    }

    await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: { verificationStatus: status },
    });

    const notifTitle =
      status === "VERIFIED"
        ? "Identity Verified ✅"
        : "Verification Rejected ❌";

    const notifBody =
      status === "VERIFIED"
        ? "Congratulations! Your identity has been verified. Your profile now shows the Verified badge."
        : `Your verification was rejected. Reason: ${rejectionReason}. Please re-submit with a valid document.`;

    await sendRealTimeNotification({
      userId: req.params.userId,
      title: notifTitle,
      body: notifBody,
      type: "VERIFICATION_UPDATE",
      data: {
        status,
        rejectionReason: rejectionReason || null,
        reviewedBy: req.user.id,
        reviewedAt: new Date().toISOString(),
      },
    });

    return sendResponse(res, {
      message: `Worker ${status === "VERIFIED" ? "verified" : "rejected"} successfully`,
      data: {
        userId: req.params.userId,
        workerName: `${worker.user.firstName} ${worker.user.lastName}`,
        status,
        rejectionReason: rejectionReason || null,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to review verification");
  }
};

// ── ADMIN: Verify a specific certification ───────────────────────────────────
// PATCH /api/verification/admin/certifications/:certId/verify
export const verifyCertification = async (req, res) => {
  try {
    const { verified } = req.body;

    const cert = await prisma.certification.update({
      where: { id: req.params.certId },
      data: { verified: verified === true || verified === "true" },
      include: {
        workerProfile: { select: { userId: true } },
      },
    });

    if (verified) {
      await sendRealTimeNotification({
        userId: cert.workerProfile.userId,
        title: "Certification Verified ✅",
        body: `Your "${cert.name}" certification has been verified.`,
        type: "CERTIFICATION_VERIFIED",
        data: { certificationId: cert.id, name: cert.name },
      });
    }

    return sendResponse(res, {
      message: `Certification ${verified ? "verified" : "unverified"}`,
      data: { certification: cert },
    });
  } catch (err) {
    return sendError(res, "Failed to verify certification");
  }
};

// ── ADMIN: Mark background check as done ─────────────────────────────────────
// PATCH /api/verification/admin/:userId/background-check
export const updateBackgroundCheck = async (req, res) => {
  try {
    const { passed } = req.body;

    const worker = await prisma.workerProfile.update({
      where: { userId: req.params.userId },
      data: { backgroundCheck: passed === true || passed === "true" },
    });

    await sendRealTimeNotification({
      userId: req.params.userId,
      title: passed ? "Background Check Passed ✅" : "Background Check Update",
      body: passed
        ? "Your background check has been completed and passed."
        : "Your background check status has been updated.",
      type: "BACKGROUND_CHECK_UPDATE",
      data: { passed, updatedAt: new Date().toISOString() },
    });

    return sendResponse(res, {
      message: `Background check updated`,
      data: { backgroundCheck: worker.backgroundCheck },
    });
  } catch (err) {
    return sendError(res, "Failed to update background check");
  }
};

// ── ADMIN: Get verification stats ─────────────────────────────────────────────
// GET /api/verification/admin/stats
export const getVerificationStats = async (req, res) => {
  try {
    const [unverified, pending, verified, rejected, backgroundChecked] =
      await Promise.all([
        prisma.workerProfile.count({
          where: { verificationStatus: "UNVERIFIED" },
        }),
        prisma.workerProfile.count({
          where: { verificationStatus: "PENDING" },
        }),
        prisma.workerProfile.count({
          where: { verificationStatus: "VERIFIED" },
        }),
        prisma.workerProfile.count({
          where: { verificationStatus: "REJECTED" },
        }),
        prisma.workerProfile.count({ where: { backgroundCheck: true } }),
      ]);

    return sendResponse(res, {
      data: {
        verificationStats: { unverified, pending, verified, rejected },
        backgroundChecked,
        total: unverified + pending + verified + rejected,
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch verification stats");
  }
};

// ── HIRER: Submit business or identity verification ───────────────────────────
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

    if (!verificationType) {
      return sendError(
        res,
        "Verification type is required (INDIVIDUAL or BUSINESS)",
        400,
      );
    }

    if (!["INDIVIDUAL", "BUSINESS"].includes(verificationType)) {
      return sendError(
        res,
        "Verification type must be INDIVIDUAL or BUSINESS",
        400,
      );
    }

    if (verificationType === "INDIVIDUAL" && (!idType || !idNumber)) {
      return sendError(
        res,
        "ID type and ID number are required for individual verification",
        400,
      );
    }

    if (
      verificationType === "BUSINESS" &&
      (!companyName || !companyRegNumber)
    ) {
      return sendError(
        res,
        "Company name and registration number are required for business verification",
        400,
      );
    }

    if (!req.file) {
      return sendError(res, "Verification document is required", 400);
    }

    const hirerProfile = await prisma.hirerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!hirerProfile) return sendError(res, "Hirer profile not found", 404);

    const documentUrl = req.file.path;

    // Store verification data in notification data field (since hirerProfile
    // doesn't have a verificationStatus field — we track it via notifications)
    const existingPending = await prisma.notification.findFirst({
      where: {
        userId: req.user.id,
        type: "HIRER_VERIFICATION_SUBMITTED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingPending) {
      const data = existingPending.data;
      if (data && data.status === "PENDING") {
        return sendError(
          res,
          "You already have a pending verification. Please wait for review.",
          409,
        );
      }
    }

    // Save verification submission as notification record
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: "Verification Submitted ✅",
        body: "Your verification documents have been submitted. We will review within 24–48 hours.",
        type: "HIRER_VERIFICATION_SUBMITTED",
        isRead: false,
        data: {
          verificationType,
          idType: idType || null,
          idNumber: idNumber || null,
          companyName: companyName || null,
          companyRegNumber: companyRegNumber || null,
          companyCountry: companyCountry || null,
          website: website || null,
          documentUrl,
          status: "PENDING",
          submittedAt: new Date().toISOString(),
        },
      },
    });

    // Update hirer profile with company info if provided
    if (companyName || website || companyCountry) {
      await prisma.hirerProfile.update({
        where: { userId: req.user.id },
        data: {
          companyName: companyName || hirerProfile.companyName,
          website: website || hirerProfile.website,
        },
      });
    }

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await sendRealTimeNotification({
        userId: admin.id,
        title: "New Hirer Verification Request 📋",
        body: `Hirer submitted ${verificationType} verification. Company: ${companyName || "N/A"}`,
        type: "HIRER_VERIFICATION_REQUEST",
        data: {
          hirerId: req.user.id,
          verificationType,
          companyName: companyName || null,
          documentUrl,
        },
      });
    }

    return sendResponse(res, {
      status: 201,
      message: "Verification submitted. Review takes 24–48 hours.",
      data: {
        verificationType,
        documentUrl,
        status: "PENDING",
        submittedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to submit hirer verification");
  }
};

// ── HIRER: Get own verification status ───────────────────────────────────────
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

    // Get latest submission
    const latestSubmission = await prisma.notification.findFirst({
      where: {
        userId: req.user.id,
        type: "HIRER_VERIFICATION_SUBMITTED",
      },
      orderBy: { createdAt: "desc" },
    });

    // Get latest review decision
    const latestReview = await prisma.notification.findFirst({
      where: {
        userId: req.user.id,
        type: {
          in: ["HIRER_VERIFICATION_APPROVED", "HIRER_VERIFICATION_REJECTED"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const submissionData = latestSubmission?.data || null;
    const reviewData = latestReview?.data || null;

    let currentStatus = "UNVERIFIED";
    if (submissionData?.status) currentStatus = submissionData.status;
    if (reviewData?.status) currentStatus = reviewData.status;

    const statusMessages = {
      UNVERIFIED: "You have not submitted verification documents yet.",
      PENDING:
        "Your documents are under review. This usually takes 24–48 hours.",
      VERIFIED: "Your account is verified ✅",
      REJECTED:
        "Your verification was rejected. Please re-submit with valid documents.",
    };

    return sendResponse(res, {
      data: {
        currentStatus,
        statusMessage: statusMessages[currentStatus] || "Unknown status",
        hirerProfile,
        latestSubmission: submissionData
          ? {
              verificationType: submissionData.verificationType,
              companyName: submissionData.companyName,
              submittedAt: latestSubmission.createdAt,
              documentUrl: submissionData.documentUrl,
            }
          : null,
        latestReview: reviewData
          ? {
              status: reviewData.status,
              rejectionReason: reviewData.rejectionReason || null,
              reviewedAt: latestReview.createdAt,
            }
          : null,
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch hirer verification status");
  }
};

// ── ADMIN: Get all pending hirer verifications ────────────────────────────────
// GET /api/verification/admin/hirers/pending
export const getPendingHirerVerifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all hirer users who have PENDING submissions
    const pendingNotifications = await prisma.notification.findMany({
      where: { type: "HIRER_VERIFICATION_SUBMITTED" },
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    });

    // Filter only PENDING status ones
    const pending = pendingNotifications.filter(
      (n) => n.data && n.data.status === "PENDING",
    );

    // Enrich with user and hirer profile data
    const enriched = await Promise.all(
      pending.map(async (n) => {
        const user = await prisma.user.findUnique({
          where: { id: n.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
            country: true,
            city: true,
            createdAt: true,
            hirerProfile: {
              select: {
                id: true,
                companyName: true,
                companySize: true,
                website: true,
                totalHires: true,
                totalSpent: true,
              },
            },
          },
        });
        return {
          notificationId: n.id,
          submittedAt: n.createdAt,
          submissionData: n.data,
          user,
        };
      }),
    );

    return sendResponse(res, {
      data: {
        verifications: enriched,
        total: enriched.length,
        page: parseInt(page),
        pages: Math.ceil(enriched.length / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch pending hirer verifications");
  }
};

// ── ADMIN: Approve or reject a hirer verification ────────────────────────────
// PATCH /api/verification/admin/hirers/:userId/review
export const reviewHirerVerification = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return sendError(res, "Status must be VERIFIED or REJECTED", 400);
    }

    if (status === "REJECTED" && !rejectionReason) {
      return sendError(res, "Rejection reason is required when rejecting", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: { hirerProfile: true },
    });

    if (!user || !user.hirerProfile) {
      return sendError(res, "Hirer not found", 404);
    }

    // Get latest submission
    const latestSubmission = await prisma.notification.findFirst({
      where: {
        userId: req.params.userId,
        type: "HIRER_VERIFICATION_SUBMITTED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestSubmission) {
      return sendError(
        res,
        "No verification submission found for this hirer",
        404,
      );
    }

    // Update the submission notification data with new status
    await prisma.notification.update({
      where: { id: latestSubmission.id },
      data: {
        data: {
          ...latestSubmission.data,
          status,
          reviewedBy: req.user.id,
          reviewedAt: new Date().toISOString(),
          rejectionReason: rejectionReason || null,
        },
      },
    });

    // Create a review decision notification for the hirer
    const notifTitle =
      status === "VERIFIED"
        ? "Account Verified ✅"
        : "Verification Rejected ❌";

    const notifBody =
      status === "VERIFIED"
        ? "Congratulations! Your account has been verified. You now have a Verified badge on your profile."
        : `Your verification was rejected. Reason: ${rejectionReason}. Please re-submit valid documents.`;

    await sendRealTimeNotification({
      userId: req.params.userId,
      title: notifTitle,
      body: notifBody,
      type:
        status === "VERIFIED"
          ? "HIRER_VERIFICATION_APPROVED"
          : "HIRER_VERIFICATION_REJECTED",
      data: {
        status,
        rejectionReason: rejectionReason || null,
        reviewedBy: req.user.id,
        reviewedAt: new Date().toISOString(),
      },
    });

    return sendResponse(res, {
      message: `Hirer verification ${status === "VERIFIED" ? "approved" : "rejected"} successfully`,
      data: {
        userId: req.params.userId,
        hirerName: `${user.firstName} ${user.lastName}`,
        companyName: user.hirerProfile.companyName || null,
        status,
        rejectionReason: rejectionReason || null,
        reviewedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to review hirer verification");
  }
};
