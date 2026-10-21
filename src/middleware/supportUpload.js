import multer from "multer";
import path from "path";
import fs from "fs";
import {
  ALLOWED_MIMES,
  MULTER_CEILING_BYTES,
  SUPPORT_POLICY,
} from "../config/supportConfig.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "support-tmp");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(
      Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), {
        status: 400,
      }),
    );
  }
  cb(null, true);
}

export function supportUpload(scope = "ticket") {
  const maxFiles =
    SUPPORT_POLICY[scope]?.maxFilesPerRequest ||
    SUPPORT_POLICY.ticket.maxFilesPerRequest;

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MULTER_CEILING_BYTES, files: maxFiles },
  }).array("attachments", maxFiles);
}
