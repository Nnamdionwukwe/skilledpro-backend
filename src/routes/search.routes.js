import { Router } from "express";
import {
  globalSearch,
  nearbyWorkers,
  getTrending,
  getFilterOptions,
} from "../controllers/search.controller.js";

const router = Router();

// All search routes are public (no auth required)
router.get("/", globalSearch);
router.get("/nearby", nearbyWorkers);
router.get("/trending", getTrending);
router.get("/filters", getFilterOptions);

export default router;
