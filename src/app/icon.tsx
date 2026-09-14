import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#267867",
          borderRadius: "10px",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg fill="none" height="24" viewBox="0 0 32 32" width="24">
          <path
            d="M16 26V10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.4"
          />
          <path
            d="M16 15c-5.8 0-9-3.1-9-8 5.8 0 9 3.1 9 8Z"
            fill="currentColor"
            opacity=".86"
          />
          <path
            d="M16 20c5.8 0 9-3.1 9-8-5.8 0-9 3.1-9 8Z"
            fill="currentColor"
            opacity=".58"
          />
        </svg>
      </div>
    ),
    size,
  );
}
