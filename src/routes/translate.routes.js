import { Router } from "express";
import { protect, optionalProtect } from "../middleware/auth.middleware.js";
import { validateTranslateRequest } from "../utils/validators.js";

const router = Router();

// POST /api/translate - Public route with optional auth
router.post("/", validateTranslateRequest, async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;

    if (!text || !targetLang) {
      return res
        .status(400)
        .json({ success: false, message: "text and targetLang are required" });
    }

    // Use Google Translate free endpoint
    const source = sourceLang || "auto";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Translation API failed");

    const data = await response.json();
    // GT returns nested arrays: [[["translated", "original", null, null, null]...]]
    const translated = data[0]?.map((chunk) => chunk[0]).join("") || text;
    const detectedLang = data[2] || "en";

    return res.json({
      success: true,
      data: {
        translated,
        detectedLang,
        original: text,
        targetLang,
      },
    });
  } catch (err) {
    console.error("Translation error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Translation failed" });
  }
});

// Protected route for authenticated users (higher limits)
router.post(
  "/protected",
  protect,
  validateTranslateRequest,
  async (req, res) => {
    try {
      const { text, targetLang, sourceLang } = req.body;

      if (!text || !targetLang) {
        return res.status(400).json({
          success: false,
          message: "text and targetLang are required",
        });
      }

      const source = sourceLang || "auto";
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Translation API failed");

      const data = await response.json();
      const translated = data[0]?.map((chunk) => chunk[0]).join("") || text;
      const detectedLang = data[2] || "en";

      return res.json({
        success: true,
        data: {
          translated,
          detectedLang,
          original: text,
          targetLang,
        },
      });
    } catch (err) {
      console.error("Translation error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Translation failed" });
    }
  },
);

export default router;
