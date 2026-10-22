// src/utils/linkify.js
import React from "react";

export function linkify(text) {
  if (!text) return null;
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
          onClick={(e) => e.stopPropagation()} // Prevent triggering reply on link click
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
