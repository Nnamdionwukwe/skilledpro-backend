// src/config/helmet.config.js
// Enhanced Security Headers Configuration

export const helmetConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: [
        "'self'",
        "data:",
        "https://*.cloudinary.com",
        "https://*.googleapis.com",
      ],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      upgradeInsecureRequests: [],
      connectSrc: [
        "'self'",
        process.env.CLIENT_URL || "https://skilledproz.com",
        "https://api.flutterwave.com",
        "https://api.paystack.co",
      ],
    },
  },

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false,

  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: {
    policy: "same-origin-allow-popups",
  },

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: "same-site",
  },

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // Expect-CT (Certificate Transparency)
  expectCt: {
    maxAge: 86400,
    enforce: true,
  },

  // Frameguard (X-Frame-Options)
  frameguard: {
    action: "sameorigin",
  },

  // Hide Powered-By (X-Powered-By)
  hidePoweredBy: true,

  // HSTS (Strict-Transport-Security)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // IE No Open (X-Download-Options)
  ieNoOpen: true,

  // No Sniff (X-Content-Type-Options)
  noSniff: true,

  // Origin Agent Cluster
  originAgentCluster: true,

  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: "none",
  },

  // Referrer Policy
  referrerPolicy: {
    policy: "no-referrer",
  },

  // XSS Filter (X-XSS-Protection)
  xssFilter: true,
};

// Strict CSP for API routes (no unsafe-inline)
export const strictCSP = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
};

// Relaxed CSP for frontend (allows inline styles/scripts)
export const relaxedCSP = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        process.env.CLIENT_URL || "https://skilledproz.com",
      ],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
};
