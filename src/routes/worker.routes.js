import { Router } from "express";
const router = Router();

router.get("/test", (req, res) =>
  res.json({ message: "Worker routes working" }),
);

export default router;
