import fs from "fs/promises";
import cloudinary from "../config/cloudinary.js";
import { ATTACHMENT_POLICY } from "../config/supportConfig.js";

function classify(mime) {
  if (ATTACHMENT_POLICY.IMAGE.mimes.includes(mime)) return "IMAGE";
  if (ATTACHMENT_POLICY.PDF.mimes.includes(mime)) return "PDF";
  if (ATTACHMENT_POLICY.VIDEO.mimes.includes(mime)) return "VIDEO";
  return null;
}

/**
 * Validates per-type size, uploads to Cloudinary, returns the persisted
 * attachment shape. Cleans up temp files in every path.
 */
export async function processSupportAttachments(files) {
  if (!files?.length) return null;

  const results = [];

  for (const file of files) {
    const type = classify(file.mimetype);
    if (!type) {
      await fs.unlink(file.path).catch(() => {});
      throw Object.assign(
        new Error(`Unsupported file type: ${file.mimetype}`),
        { status: 400 },
      );
    }

    const policy = ATTACHMENT_POLICY[type];
    if (file.size > policy.maxBytes) {
      await fs.unlink(file.path).catch(() => {});
      throw Object.assign(
        new Error(
          `${type} exceeds ${(policy.maxBytes / 1024 / 1024).toFixed(0)} MB limit: ${file.originalname}`,
        ),
        { status: 400 },
      );
    }

    try {
      const uploaded = await cloudinary.uploader.upload(file.path, {
        folder: "support/attachments",
        resource_type: policy.cloudinaryResourceType,
        ...(type === "IMAGE" && {
          eager: [{ width: 400, height: 400, crop: "limit", quality: "auto" }],
        }),
        ...(type === "VIDEO" && {
          eager: [{ format: "jpg", width: 400, height: 400, crop: "limit" }],
        }),
      });

      results.push({
        url: uploaded.secure_url,
        name: file.originalname,
        mime: file.mimetype,
        size: file.size,
        type,
        ...(type === "VIDEO" && {
          thumbnailUrl: uploaded.eager?.[0]?.secure_url || null,
          duration: uploaded.duration ?? null,
        }),
        publicId: uploaded.public_id,
      });
    } finally {
      await fs.unlink(file.path).catch(() => {});
    }
  }

  return results;
}

export async function deleteSupportAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return;

  await Promise.allSettled(
    attachments
      .filter((a) => a?.publicId)
      .map((a) => {
        const type = classify(a.mime) || "IMAGE";
        return cloudinary.uploader.destroy(a.publicId, {
          resource_type: ATTACHMENT_POLICY[type].cloudinaryResourceType,
        });
      }),
  );
}
