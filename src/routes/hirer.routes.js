import { Router } from "express";
const router = Router();

router.get("/test", (req, res) =>
  res.json({ message: "Hirer routes working" }),
);

export default router;
