// src/routes/search.routes.js  (final version — rate limiting + validators)
import { Router } from "express";
import {
  globalSearch,
  nearbyWorkers,
  getTrending,
  getFilterOptions,
} from "../controllers/search.controller.js";
import {
  searchLimiter,
  nearbyLimiter,
  trendingLimiter,
  filterLimiter,
} from "../middleware/rateLimit.middleware.js";
import { validateSearch, validateNearby } from "../utils/validators.js";

const router = Router();

// All routes are public — rate limited to prevent scraping
router.get("/", searchLimiter, validateSearch, globalSearch);
router.get("/nearby", nearbyLimiter, validateNearby, nearbyWorkers);
router.get("/trending", trendingLimiter, getTrending);
router.get("/filters", filterLimiter, getFilterOptions);

export default router;
