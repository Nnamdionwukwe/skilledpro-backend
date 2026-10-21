export const ATTACHMENT_POLICY = {
  IMAGE: {
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 10 * 1024 * 1024,
    cloudinaryResourceType: "image",
  },
  PDF: {
    mimes: ["application/pdf"],
    maxBytes: 20 * 1024 * 1024,
    cloudinaryResourceType: "raw",
  },
  VIDEO: {
    mimes: ["video/mp4", "video/webm", "video/quicktime"],
    maxBytes: 100 * 1024 * 1024,
    cloudinaryResourceType: "video",
  },
};

export const ALLOWED_MIMES = new Set([
  ...ATTACHMENT_POLICY.IMAGE.mimes,
  ...ATTACHMENT_POLICY.PDF.mimes,
  ...ATTACHMENT_POLICY.VIDEO.mimes,
]);

export const MULTER_CEILING_BYTES = 100 * 1024 * 1024;

export const SUPPORT_POLICY = {
  ticket: {
    maxFilesPerRequest: 5,
  },
  chat: {
    maxFilesPerRequest: 3,
  },
  sla: {
    urgentFirstResponseMinutes: 15,
    highFirstResponseMinutes: 60,
    normalFirstResponseMinutes: 240,
    autoCloseResolvedDays: 7,
  },
};
