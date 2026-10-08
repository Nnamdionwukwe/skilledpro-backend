// src/middleware/upload.middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Multer + Cloudinary upload middleware.
//
// PDFs are uploaded as IMAGE resources (not RAW). Cloudinary serves image
// resources with the correct Content-Type so browsers render them inline.
//
// Why not "raw"?
//   Cloudinary's raw-resource delivery sends `Content-Type:
//   application/octet-stream`, which forces the browser to DOWNLOAD the file
//   instead of rendering it. That breaks in-app <iframe> previews and mobile
//   browsers (which don't have Mac Preview to save the day).
//
// Why "image" for a PDF?
//   Cloudinary accepts PDFs as image resources. When it does, the delivered
//   URL returns `Content-Type: application/pdf` and `Content-Disposition:
//   inline`, so <iframe>, mobile Chrome, and mobile Safari all render the
//   PDF in place — no download prompt.
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

function cloudinaryResourceType(mimetype) {
  // PDFs go to IMAGE resource type so Cloudinary serves them with
  // Content-Type: application/pdf + Content-Disposition: inline.
  if (mimetype === "application/pdf") return "image";
  if (mimetype?.startsWith("video/")) return "video";
  if (mimetype?.startsWith("image/")) return "image";
  return "auto";
}

function allowedFormatsFor(mimetype) {
  if (mimetype === "application/pdf") return ["pdf"];
  if (mimetype?.startsWith("video/")) return VIDEO_FORMATS;
  if (mimetype?.startsWith("image/")) return IMAGE_FORMATS;
  return undefined;
}

const MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  "application/pdf",
];

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary storage factory
// ─────────────────────────────────────────────────────────────────────────────
const makeStorage = () =>
  new CloudinaryStorage({
    cloudinary,
    params: (_req, file) => ({
      folder: "skilledpro",
      resource_type: cloudinaryResourceType(file.mimetype),
      allowed_formats: allowedFormatsFor(file.mimetype),
      use_filename: true,
      unique_filename: true,
    }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// File filter
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
// LEGACY EXPORTS
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

export const uploadVideo = multer({
  storage: makeStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter,
}).single("file");

export const uploadImage = multer({
  storage: makeStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter,
}).single("image");

export const uploadCertification = multer({
  storage: makeStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
}).single("document");

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
