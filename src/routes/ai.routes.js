import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/ai/assist — proxy to Anthropic
router.post("/assist", protect, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt)
      return res
        .status(400)
        .json({ success: false, message: "Prompt required" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error("AI proxy error:", err);
    res.status(500).json({ success: false, message: "AI request failed" });
  }
});

export default router;
