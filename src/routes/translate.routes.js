import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/translate
router.post("/", protect, async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || !targetLang) {
      return res
        .status(400)
        .json({ success: false, message: "text and targetLang required" });
    }

    // Use Google Translate free endpoint (same one GT widget uses)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Translation API failed");

    const data = await response.json();
    // GT returns nested arrays: [[["translated", "original", null, null, null]...]]
    const translated = data[0]?.map((chunk) => chunk[0]).join("") || text;
    const detectedLang = data[2] || "en";

    return res.json({ success: true, data: { translated, detectedLang } });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Translation failed" });
  }
});

export default router;
