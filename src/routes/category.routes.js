import { Router } from "express";
const router = Router();

router.get("/test", (req, res) =>
  res.json({ message: "Category routes working" }),
);

export default router;
