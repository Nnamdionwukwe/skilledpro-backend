import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallStatus,
} from "../controllers/videocall.controller.js";

const router = Router();

router.use(protect);

router.post("/:bookingId/initiate", initiateCall);
router.patch("/:bookingId/accept", acceptCall);
router.patch("/:bookingId/decline", declineCall);
router.patch("/:bookingId/end", endCall);
router.get("/:bookingId", getCallStatus);

export default router;
