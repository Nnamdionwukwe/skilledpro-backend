import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/database.js";

export const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

export const generateRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });

export const generateRandomToken = () => crypto.randomBytes(32).toString("hex");

export const saveRefreshToken = async (userId, token) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: token },
  });
};

export const clearRefreshToken = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
};

export const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

export const generateTokenPair = async (userId) => {
  const token = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  await saveRefreshToken(userId, refreshToken);
  return { token, refreshToken };
};
