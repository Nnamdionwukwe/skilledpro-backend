// src/middleware/upload.middleware.js
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared Cloudinary storage factory
// ─────────────────────────────────────────────────────────────────────────────
const makeStorage = () =>
  new CloudinaryStorage({
    cloudinary,
    params: (_req, file) => {
      const isVideo = file.mimetype.startsWith("video/");
      return {
        folder: "skilledpro",
        resource_type: isVideo ? "video" : "auto",
        allowed_formats: isVideo
          ? ["mp4", "mov", "webm", "avi", "mkv"] // unchanged for compatibility
          : ["jpg", "jpeg", "png", "webp", "pdf"],
      };
    },
  });

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS — IDENTICAL NAMES & SIGNATURES
// Only change: fileSize 10MB → 100MB (fixes the 413 on videos)
//
// Every existing consumer keeps working exactly as before.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LEGACY: accepts any single file (any field name).
 * Populates req.files[] — use normaliseFile to also set req.file.
 */
export const uploadSingle = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (was 10MB)
}).any();

/**
 * LEGACY: accepts up to 15 files under field name "files".
 */
export const uploadMultiple = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (was 10MB)
}).array("files", 15);

/**
 * LEGACY: normalise req.files[0] → req.file.
 * Signature unchanged.
 */
export const normaliseFile = (req, _res, next) => {
  if (!req.file && req.files && req.files.length > 0) {
    req.file = req.files[0];
  }
  next();
};

// ═════════════════════════════════════════════════════════════════════════════
// NEW EXPORTS — OPT-IN ONLY
//
// Nothing imports these yet. Add them to a route only when you want the
// stricter/dedicated uploader (proper req.file, tighter limits per file type).
// ═════════════════════════════════════════════════════════════════════════════

/** Video — single file, field name "file", 100MB */
export const uploadVideo = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("file");

/** Image — single file, field name "image", 20MB */
export const uploadImage = multer({
  storage: makeStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("image");

/** Certification — single file, field name "document", 10MB */
export const uploadCertification = multer({
  storage: makeStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("document");

/**
 * Campaign screenshot — single image, field name "screenshot", 5MB.
 * Used by referred users to prove they followed a social platform.
 * Rejects non-image mimetypes early (before Cloudinary upload).
 */
export const uploadScreenshot = multer({
  storage: makeStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for screenshots"));
    }
    cb(null, true);
  },
}).single("screenshot");
