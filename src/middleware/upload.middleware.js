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
  params: { folder: "skilledpro", allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"] },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

export const uploadSingle = upload.single("file");
export const uploadMultiple = upload.array("files", 5);
