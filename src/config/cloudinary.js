import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Avatar / profile photos ───────────────────────────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "skilledpro/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 400, height: 400, crop: "fill", gravity: "face" },
    ],
  },
});

// ── Portfolio images ──────────────────────────────────────────────────
const portfolioStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "skilledpro/portfolio",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 800, crop: "limit" }],
  },
});

// ── Certification / ID documents ──────────────────────────────────────
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "skilledpro/documents",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
    resource_type: "auto",
  },
});

// ── Message attachments ───────────────────────────────────────────────
const messageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "skilledpro/messages",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
    resource_type: "auto",
  },
});

export const uploadAvatar = multer({ storage: avatarStorage });
export const uploadPortfolio = multer({ storage: portfolioStorage });
export const uploadDocument = multer({ storage: documentStorage });
export const uploadMessage = multer({ storage: messageStorage });

export const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
};

export default cloudinary;
