import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg width="180" height="180" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="15" fill="#242725" />
        <circle cx="32" cy="32" r="23" fill="none" stroke="#B75C3D" strokeWidth="3" />
        <path
          d="M15 42V22L23 32L31 22V42M37 42V22H43C48 22 51 25 51 30C51 35 48 38 43 38H37"
          fill="none"
          stroke="#FCFBF8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    size,
  );
}
