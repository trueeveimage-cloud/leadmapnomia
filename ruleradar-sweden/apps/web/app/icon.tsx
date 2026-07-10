import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "#071d2b", borderRadius: "6px", color: "white", fontSize: "11px", fontWeight: 800 }}>RR</div>,
    size
  );
}
