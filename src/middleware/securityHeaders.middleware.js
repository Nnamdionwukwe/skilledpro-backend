// src/middleware/securityHeaders.middleware.js
// Additional security headers middleware

export const securityHeaders = (req, res, next) => {
  // Remove X-Powered-By header
  res.removeHeader("X-Powered-By");

  // Additional security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), " +
      "usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  );

  // Strict-Transport-Security (only in production)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Content-Security-Policy (additional CSP for API)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' https:; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' https: data:; " +
      "connect-src 'self'; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "upgrade-insecure-requests",
  );

  next();
};

// CORS security headers
export const corsSecurityHeaders = (req, res, next) => {
  // Prevent caching of authenticated requests
  if (req.headers.authorization) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  next();
};
