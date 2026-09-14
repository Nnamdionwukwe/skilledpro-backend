// src/services/google.service.js
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

/**
 * Exchange an OAuth code for user info.
 */
export async function getGoogleUserFromCode(code) {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    firstName: payload.given_name || "",
    lastName: payload.family_name || "",
    avatar: payload.picture || null,
  };
}

/**
 * Verify a Google ID token (from Google Sign-In on mobile/frontend).
 */
export async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    firstName: payload.given_name || "",
    lastName: payload.family_name || "",
    avatar: payload.picture || null,
  };
}

/**
 * Generate the Google OAuth consent URL.
 */
export function getGoogleAuthUrl(state = "") {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "consent",
  });
}
