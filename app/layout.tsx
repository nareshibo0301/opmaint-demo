import type { Metadata } from "next";
import "./demo-popup.css";

export const metadata: Metadata = {
  title: "Opmaint — Book a demo",
  description: "CMMS for plants. Book a walkthrough of work orders, preventive maintenance and asset history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
