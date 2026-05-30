// src/utils/response.js
// ─────────────────────────────────────────────────────────────────────────────
// Standardised HTTP response helpers used across all 25 controllers.
//
// Every response follows the same envelope:
//   { success, message, data?, errors?, meta? }
//
// Backward-compatible: sendResponse and sendError signatures unchanged.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// § 1  CORE HELPERS (used everywhere)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard success response.
 *
 * @example
 *   return sendResponse(res, { data: { user } });
 *   return sendResponse(res, { status: 201, message: "Created", data: { item } });
 */
export const sendResponse = (
  res,
  {
    status = 200,
    success = true,
    message = "Success",
    data = null,
    meta = null, // pagination, counts, etc.
    errors = null, // validation error array (rarely on success, but available)
  } = {},
) => {
  const body = { success, message };

  if (data !== null && data !== undefined) body.data = data;
  if (meta !== null && meta !== undefined) body.meta = meta;
  if (errors !== null && errors !== undefined) body.errors = errors;

  return res.status(status).json(body);
};

/**
 * Standard error response.
 *
 * @example
 *   return sendError(res, "User not found", 404);
 *   return sendError(res, "Validation failed", 400, validationErrors);
 */
export const sendError = (
  res,
  message = "Something went wrong",
  status = 500,
  errors = null,
) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  SEMANTIC SHORTCUTS  (DRY wrappers for common HTTP statuses)
// ─────────────────────────────────────────────────────────────────────────────

/** 201 Created */
export const sendCreated = (res, data, message = "Created successfully") =>
  sendResponse(res, { status: 201, message, data });

/** 204 No Content */
export const sendNoContent = (res) => res.status(204).send();

/** 400 Bad Request */
export const sendBadRequest = (res, message = "Bad request", errors = null) =>
  sendError(res, message, 400, errors);

/** 401 Unauthorized */
export const sendUnauthorized = (res, message = "Authentication required") =>
  sendError(res, message, 401);

/** 403 Forbidden */
export const sendForbidden = (
  res,
  message = "You do not have permission to perform this action",
) => sendError(res, message, 403);

/** 404 Not Found */
export const sendNotFound = (res, resource = "Resource") =>
  sendError(res, `${resource} not found`, 404);

/** 409 Conflict */
export const sendConflict = (res, message = "Resource already exists") =>
  sendError(res, message, 409);

/** 422 Unprocessable Entity (validation) */
export const sendValidationError = (
  res,
  errors,
  message = "Validation failed",
) => sendError(res, message, 422, errors);

/** 429 Too Many Requests */
export const sendTooManyRequests = (
  res,
  message = "Too many requests. Please try again later.",
) => sendError(res, message, 429);

/** 503 Service Unavailable */
export const sendServiceUnavailable = (
  res,
  message = "Service temporarily unavailable",
) => sendError(res, message, 503);

// ─────────────────────────────────────────────────────────────────────────────
// § 3  PAGINATED LIST RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a standardised paginated list response.
 *
 * @param {object} res
 * @param {object} opts
 * @param {Array}  opts.items     - The array of results
 * @param {number} opts.total     - Total records matching the query
 * @param {number} opts.page      - Current page (1-based)
 * @param {number} opts.limit     - Page size
 * @param {string} [opts.message] - Optional message
 * @param {string} [opts.key]     - Data key name (default: "items")
 *
 * @example
 *   return sendPaginated(res, { items: users, total, page, limit });
 *   // → { success, message, data: { users: [...], total, page, pages, hasNextPage } }
 *
 *   return sendPaginated(res, { items: bookings, total, page, limit, key: "bookings" });
 */
export const sendPaginated = (
  res,
  {
    items = [],
    total = 0,
    page = 1,
    limit = 20,
    message = "Success",
    key = "items",
    extra = {}, // any extra fields to merge into data (e.g. stats)
  } = {},
) => {
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 20;
  const pages = Math.ceil(total / l) || 1;

  return sendResponse(res, {
    message,
    data: {
      [key]: items,
      ...extra,
    },
    meta: {
      total,
      page: p,
      limit: l,
      pages,
      hasNextPage: p < pages,
      hasPrevPage: p > 1,
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  ASYNC ROUTE WRAPPER (optional — removes try/catch boilerplate)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps an async route handler and forwards any unhandled error to sendError.
 * Use in routes that don't need custom error handling per-catch.
 *
 * @example
 *   router.get("/", catchAsync(async (req, res) => {
 *     const users = await prisma.user.findMany();
 *     return sendResponse(res, { data: { users } });
 *   }));
 */
export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error("[Unhandled route error]", err?.message || err);
    return sendError(
      res,
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err?.message || "Something went wrong",
      err?.statusCode || 500,
    );
  });
};
