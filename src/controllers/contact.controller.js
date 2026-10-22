// src/controllers/contact.controller.js
import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

export async function submitContactForm(req, res, next) {
  try {
    const { name, email, subject, message } = req.body;

    // 1. Basic Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required fields.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // 2. Extract metadata
    const ipAddress =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers["user-agent"]?.slice(0, 255) || null;

    // 3. Save to database
    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject?.trim() || null,
        message: message.trim(),
        ipAddress,
        userAgent,
      },
    });

    // 4. Respond to frontend
    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: {
        id: contactMessage.id,
        createdAt: contactMessage.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Optional: Admin endpoint to view messages
export async function getAllContactMessages(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = status ? { status } : {};

    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.contactMessage.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        messages,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateContactMessageStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body; // "PENDING" | "REVIEWED" | "RESOLVED"

    if (!["PENDING", "REVIEWED", "RESOLVED"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
