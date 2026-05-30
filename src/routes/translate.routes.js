// src/routes/translate.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validateTranslate } from "../utils/validators.js";

const router = Router();
router.use(protect);

// POST /api/translate
// Body: { text, targetLanguage, sourceLanguage? }
router.post("/", validateTranslate, async (req, res) => {
  const { text, targetLanguage, sourceLanguage } = req.body;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res
      .status(503)
      .json({ success: false, message: "Translation service unavailable" });
  }

  try {
    const systemPrompt = [
      `You are a professional translator.`,
      `Translate the user's text to ${targetLanguage}${sourceLanguage ? ` from ${sourceLanguage}` : ""}.`,
      `Return ONLY the translated text. No explanations, no preamble, no quotes.`,
      `Preserve the original tone, formatting (line breaks, bullet points), and intent exactly.`,
    ].join(" ");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // fast + cheap for translation
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Translation API error:", err);
      return res
        .status(502)
        .json({ success: false, message: "Translation failed" });
    }

    const result = await response.json();
    const translated = result.content?.[0]?.text?.trim();

    if (!translated) {
      return res
        .status(502)
        .json({ success: false, message: "Empty translation response" });
    }

    return res.json({
      success: true,
      data: {
        original: text,
        translated,
        targetLanguage,
        sourceLanguage: sourceLanguage || "auto",
        characters: text.length,
      },
    });
  } catch (err) {
    console.error("translate route error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Translation failed" });
  }
});

export default router;
