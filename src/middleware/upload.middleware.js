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

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: "skilledpro",
      resource_type: isVideo ? "video" : "auto",
      allowed_formats: isVideo
        ? ["mp4", "mov", "webm", "avi", "mkv"]
        : ["jpg", "jpeg", "png", "webp", "pdf"],
    };
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Accepts any single file regardless of field name
// Previously locked to "avatar" which broke portfolio ("image") and certifications ("document")
export const uploadSingle = upload.any();

export const uploadMultiple = upload.array("files", 15);

// Normalise req.files → req.file for controllers that use req.file
export const normaliseFile = (req, res, next) => {
  if (!req.file && req.files && req.files.length > 0) {
    req.file = req.files[0];
  }
  next();
};
