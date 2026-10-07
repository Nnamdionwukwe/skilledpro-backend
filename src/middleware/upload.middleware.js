// src/middleware/upload.middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Multer + Cloudinary upload middleware.
//
// Cloudinary treats PDFs as "raw" resources (not "image"). To make browsers
// render them inline via <iframe>, we MUST force the format to ".pdf" so
// Cloudinary serves Content-Type: application/pdf. Without this, raw URLs
// have no extension, get served as application/octet-stream, and download
// instead of rendering.
//
// Resource type routing:
//   • application/pdf  → "raw"  + format:"pdf"
//   • video/*          → "video"
//   • image/*          → "image"
//   • anything else    → "auto" (fallback)
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
  return undefined;
}

/**
 * Returns the forced format for a given mimetype. Only set for PDFs so
 * Cloudinary appends ".pdf" to the delivered URL — this is what makes the
 * browser use Content-Type: application/pdf and render inline.
 */
function forcedFormatFor(mimetype) {
  if (mimetype === "application/pdf") return "pdf";
  return undefined;
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
      const params = {
        folder: "skilledpro",
        resource_type: resourceType,
        allowed_formats: allowedFormatsFor(file.mimetype),
        use_filename: true,
        unique_filename: true,
      };

      // ── CRITICAL: force the format for PDFs so the delivered URL ends
      // in ".pdf". This is what makes the browser render the file inline
      // instead of downloading it as application/octet-stream.
      const forced = forcedFormatFor(file.mimetype);
      if (forced) params.format = forced;

      return params;
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

export const uploadSingle = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).any();

export const uploadMultiple = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).array("files", 15);

export const normaliseFile = (req, _res, next) => {
  if (!req.file && req.files && req.files.length > 0) {
    req.file = req.files[0];
  }
  next();
};

// ═════════════════════════════════════════════════════════════════════════════
// NEW EXPORTS
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

/** Campaign screenshot — single image, field name "screenshot", 5MB */
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
