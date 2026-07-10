import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#071d2b", color: "white", padding: "64px 70px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "58%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#9fdce7", fontSize: "15px", fontWeight: 700 }}><span style={{ width: "30px", height: "3px", background: "#f2c84b" }}></span>RULERADAR SWEDEN</div>
        <div style={{ marginTop: "28px", fontSize: "62px", lineHeight: 1.04, fontWeight: 760 }}>Fånga regeländringen innan den blir ett kundfel.</div>
        <div style={{ marginTop: "26px", maxWidth: "600px", color: "#c8dce2", fontSize: "23px", lineHeight: 1.45 }}>Regelbevakning för svenska löne- och redovisningsteam.</div>
      </div>
      <div style={{ position: "absolute", top: "72px", right: "-40px", width: "470px", height: "486px", display: "flex", flexDirection: "column", background: "#f8fbfa", color: "#071a23", borderTop: "7px solid #f2c84b", padding: "42px", boxShadow: "0 28px 70px rgba(0,0,0,.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#0b6f95", fontSize: "14px", fontWeight: 700 }}><span>SKATTEVERKET · AGI</span><span style={{ color: "#b73e36" }}>HÖG</span></div>
        <div style={{ marginTop: "54px", fontSize: "37px", lineHeight: 1.08, fontWeight: 750 }}>Ändring upptäckt i officiell källa</div>
        <div style={{ marginTop: "23px", color: "#5b6d74", fontSize: "18px", lineHeight: 1.5 }}>Sammanfattning, påverkan, evidens och granskningsstatus på ett ställe.</div>
        <div style={{ marginTop: "auto", borderLeft: "4px solid #0b6f95", background: "#edf5f7", padding: "18px", color: "#07506d", fontSize: "16px", fontWeight: 700 }}>Primärkällan följer alltid med</div>
      </div>
    </div>,
    size
  );
}
