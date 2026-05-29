// src/routes/search.routes.js
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

const router = Router();

// All search routes are public (workers must be discoverable without login)
// Rate limited to prevent scraping and abuse

// 60 / min — allows fast typing/autocomplete without friction
router.get("/", searchLimiter, globalSearch);

// 20 / min — most expensive: haversine + multi-radius DB expansion
router.get("/nearby", nearbyLimiter, nearbyWorkers);

// 30 / min — aggregation query, moderately expensive
router.get("/trending", trendingLimiter, getTrending);

// 30 / min — filter options don't change often, light query
router.get("/filters", filterLimiter, getFilterOptions);

export default router;
