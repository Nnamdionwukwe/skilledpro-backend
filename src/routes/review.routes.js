import { Router } from "express";
const router = Router();

router.get("/test", (req, res) =>
  res.json({ message: "Review routes working" }),
);

export default router;
