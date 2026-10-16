export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#0b1b2b" }}>
      <h1>Privacy notice</h1>
      <p>
        When you visit this site we record technical information that your browser sends automatically: IP address,
        approximate location (city/country), device type, browser, referring page and campaign parameters. We use a
        first-party cookie to keep your visit together.
      </p>
      <p>
        As you fill in the demo form, what you type is saved progressively so you can continue later. Every change is
        stored, including values you later delete. If you submit the form, the request is marked as submitted.
      </p>
      <p>
        If you allow it, we may look up your company from your work email domain (and, where a provider is configured,
        your public professional profile). You can decline this with “Essential only”.
      </p>
      <p>
        To request access or deletion of your data, contact us at privacy@opmaint.example.
      </p>
      <p>
        <a href="/">← Back</a>
      </p>
    </main>
  );
}
