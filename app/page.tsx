import DemoPopup from "@/components/DemoPopup";

export default function Home() {
  return (
    <main className="odp-preview">
      {/* This shell is only a preview. On the real site, drop <DemoPopup /> into
          your global layout and trigger it from any button:
          <button data-demo-popup>Schedule a demo</button> */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, color: "#0b1b2b" }}>Opmaint — demo preview</h1>
        <p style={{ margin: "0 0 20px", color: "#5b6b7b" }}>Click the button to open the booking popup.</p>
        <button data-demo-popup>Schedule a demo</button>
        <p style={{ marginTop: 18, fontSize: 13 }}>
          <a href="/admin" style={{ color: "#0b1b2b" }}>
            Admin dashboard →
          </a>
        </p>
      </div>

      <DemoPopup />
    </main>
  );
}
