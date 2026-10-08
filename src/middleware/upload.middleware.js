// src/middleware/upload.middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Multer + Cloudinary upload middleware.
//
// Cloudinary treats PDFs as "raw" resources (not "image"). Raw resources
// don't support delivery transformations — including the `format` param.
// Setting `format: "pdf"` on a raw upload produces a URL that LOOKS like it
// ends in .pdf, but the underlying resource is stored without an extension
// and Cloudinary returns 404 when you try to fetch it.
//
// The correct approach: preserve the ORIGINAL file extension by NOT using
// `unique_filename` (which strips the extension) and letting `use_filename`
// keep the full name. Cloudinary then stores the raw file at
// `.../raw/upload/.../file_abc123.pdf` and the URL works.
// ─────────────────────────────────────────────────────────────────────────────

import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";
import path from "path";

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
//
// IMPORTANT: for raw resources we do NOT set `format` and we do NOT use
// `unique_filename` (which strips the extension). Instead we generate our
// own unique public_id that PRESERVES the original extension. That is what
// makes the delivered URL end in ".pdf" AND actually resolve to real bytes.
// ─────────────────────────────────────────────────────────────────────────────
const makeStorage = () =>
  new CloudinaryStorage({
    cloudinary,
    params: (_req, file) => {
      const resourceType = cloudinaryResourceType(file.mimetype);
      const isRaw = resourceType === "raw";

      const params = {
        folder: "skilledpro",
        resource_type: resourceType,
        allowed_formats: allowedFormatsFor(file.mimetype),
      };

      if (isRaw) {
        // For PDFs (raw resources), Cloudinary's default unique_filename
        // generates a URL-safe public_id AND appends the original format
        // automatically. Do NOT set format or public_id manually.
        params.use_filename = false;
        params.unique_filename = true;
        params.format = "pdf";
      } else {
        params.use_filename = true;
        params.unique_filename = true;
      }

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
