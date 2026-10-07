// src/middleware/upload.middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Multer + Cloudinary upload middleware.
//
// Cloudinary treats PDFs as "raw" resources (not "image"), which matters
// because:
//   • Image resources are served as <img>-loadable blobs and browsers can't
//     render them as PDFs.
//   • Raw resources get Content-Type: application/pdf, so both <iframe> and
//     direct navigation render them correctly.
//
// We set resource_type per file:
//   • application/pdf           → "raw"
//   • video/*                   → "video"
//   • image/*                   → "image"
//   • anything else             → "auto" (fallback)
//
// Allowed formats are also enforced via `allowed_formats`, and a fileFilter
// rejects unsupported MIME types before we hit Cloudinary.
// ─────────────────────────────────────────────────────────────────────────────

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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
const VIDEO_FORMATS = ["mp4", "mov", "webm", "avi", "mkv"];
const DOC_FORMATS = ["pdf"];

function cloudinaryResourceType(mimetype) {
  if (mimetype === "application/pdf") return "raw";
  if (mimetype?.startsWith("video/")) return "video";
  if (mimetype?.startsWith("image/")) return "image";
  return "auto";
}

function allowedFormatsFor(mimetype) {
  if (mimetype === "application/pdf") return DOC_FORMATS;
  if (mimetype?.startsWith("video/")) return VIDEO_FORMATS;
  if (mimetype?.startsWith("image/")) return IMAGE_FORMATS;
  return undefined; // let Cloudinary decide for anything else
}

const MIME_ALLOWLIST = [
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  // Documents
  "application/pdf",
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared Cloudinary storage factory
// ─────────────────────────────────────────────────────────────────────────────
const makeStorage = () =>
  new CloudinaryStorage({
    cloudinary,
    params: (_req, file) => {
      const resourceType = cloudinaryResourceType(file.mimetype);
      return {
        folder: "skilledpro",
        resource_type: resourceType,
        allowed_formats: allowedFormatsFor(file.mimetype),
        // Preserve the original filename so admins see meaningful names in
        // Cloudinary's console.
        use_filename: true,
        unique_filename: true,
      };
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// Shared file filter — rejects unsupported MIME types early
// ─────────────────────────────────────────────────────────────────────────────
const fileFilter = (_req, file, cb) => {
  if (!MIME_ALLOWLIST.includes(file.mimetype)) {
    return cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed: images, videos, PDF.`,
      ),
    );
  }
  cb(null, true);
};

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS — same names, same signatures
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LEGACY: accepts any single file (any field name).
 * Populates req.files[] — use normaliseFile to also set req.file.
 */
export const uploadSingle = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter,
}).any();

/**
 * LEGACY: accepts up to 15 files under field name "files".
 */
export const uploadMultiple = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).array("files", 15);

/**
 * LEGACY: normalise req.files[0] → req.file.
 */
export const normaliseFile = (req, _res, next) => {
  if (!req.file && req.files && req.files.length > 0) {
    req.file = req.files[0];
  }
  next();
};

// ═════════════════════════════════════════════════════════════════════════════
// NEW EXPORTS — same as before, now with the file filter
// ═════════════════════════════════════════════════════════════════════════════

/** Video — single file, field name "file", 100MB */
export const uploadVideo = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).single("file");

/** Image — single file, field name "image", 20MB */
export const uploadImage = multer({
  storage: makeStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter,
}).single("image");

/** Certification — single file, field name "document", 10MB */
export const uploadCertification = multer({
  storage: makeStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).single("document");

/**
 * Campaign screenshot — single image, field name "screenshot", 5MB.
 */
export const uploadScreenshot = multer({
  storage: makeStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for screenshots"));
    }
    cb(null, true);
  },
}).single("screenshot");
