export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Page not found.</h1>
      <p>This record or page is unavailable.</p>
      <a href="/dashboard" className="btn primary">
        Back to dashboard
      </a>
    </main>
  );
}
