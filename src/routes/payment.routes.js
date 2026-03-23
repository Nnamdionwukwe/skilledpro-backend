import { Router } from "express";
const router = Router();

router.get("/test", (req, res) =>
  res.json({ message: "Payment routes working" }),
);

export default router;
