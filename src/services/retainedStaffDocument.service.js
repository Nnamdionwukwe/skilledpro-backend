// src/services/retainedStaffDocument.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Retained Staff — HR document service
//
// Handles upload / list / verify / reject / delete of HR documents
// (contracts, NDAs, IDs, certifications, offer letters, payslips).
//
// Files are uploaded elsewhere (S3 / Cloudinary / your existing uploader)
// and this service stores the resulting URL + metadata.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { logAdminAction } from "../utils/auditLog.js";
import { createNotification } from "./notification.service.js";

export async function uploadDocument(memberId, hirerId, payload, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const { type, title, fileUrl, mimeType, sizeBytes, expiresAt, meta } =
    payload;
  if (!type || !title || !fileUrl)
    throw httpError(400, "type, title and fileUrl are required");

  const doc = await prisma.retainedStaffDocument.create({
    data: {
      memberId,
      type,
      title,
      fileUrl,
      mimeType: mimeType ?? null,
      sizeBytes: sizeBytes ?? null,
      status: "PENDING",
      uploadedById: hirerId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      meta: meta ?? null,
    },
  });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_DOCUMENT_UPLOADED",
    targetType: "RETAINED_STAFF_DOCUMENT",
    targetId: doc.id,
    description: `Uploaded ${type} document: ${title}`,
    after: { type, title, status: "PENDING" },
    meta: { memberId },
  });

  try {
    await createNotification({
      userId: member.workerId,
      title: "New document uploaded 📄",
      body: `${title} has been added to your employment file.`,
      type: "RETAINED_DOCUMENT_UPLOADED",
      icon: "FaFileAlt",
      data: { memberId, documentId: doc.id },
    });
  } catch {}

  return doc;
}

export async function listDocuments(memberId, hirerId) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  return prisma.retainedStaffDocument.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateDocument(
  memberId,
  hirerId,
  docId,
  patch,
  ctx = {},
) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const doc = await prisma.retainedStaffDocument.findFirst({
    where: { id: docId, memberId },
  });
  if (!doc) throw httpError(404, "Document not found");

  const data = {};
  if (patch.status) data.status = patch.status;
  if (patch.title) data.title = patch.title;
  if (patch.expiresAt !== undefined)
    data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  if (patch.status === "SIGNED") data.signedAt = new Date();
  if (patch.status === "REJECTED")
    data.rejectionNote = patch.rejectionNote ?? null;
  if (patch.meta !== undefined) data.meta = patch.meta;

  if (Object.keys(data).length === 0) return doc;

  const updated = await prisma.retainedStaffDocument.update({
    where: { id: docId },
    data,
  });

  const actionMap = {
    VERIFIED: "RETAINED_STAFF_DOCUMENT_VERIFIED",
    REJECTED: "RETAINED_STAFF_DOCUMENT_REJECTED",
  };
  const action = actionMap[patch.status];
  if (action) {
    await logAdminAction({
      req: ctx.req,
      adminId: hirerId,
      action,
      targetType: "RETAINED_STAFF_DOCUMENT",
      targetId: docId,
      description: `${patch.status.toLowerCase()} document: ${doc.title}`,
      before: { status: doc.status },
      after: { status: updated.status },
      meta: { memberId },
    });
  }

  return updated;
}

export async function deleteDocument(memberId, hirerId, docId, ctx = {}) {
  const member = await prisma.retainedStaffMember.findFirst({
    where: { id: memberId, hirerId },
  });
  if (!member) throw httpError(404, "Retained staff member not found");

  const doc = await prisma.retainedStaffDocument.findFirst({
    where: { id: docId, memberId },
  });
  if (!doc) throw httpError(404, "Document not found");

  await prisma.retainedStaffDocument.delete({ where: { id: docId } });

  await logAdminAction({
    req: ctx.req,
    adminId: hirerId,
    action: "RETAINED_STAFF_DOCUMENT_REJECTED",
    targetType: "RETAINED_STAFF_DOCUMENT",
    targetId: docId,
    description: `Deleted document: ${doc.title}`,
    before: { title: doc.title, type: doc.type },
    meta: { memberId },
  });

  return { deleted: true };
}

function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
