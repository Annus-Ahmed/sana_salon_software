"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>We couldn’t load this workspace.</h1>
      <p>
        Check that the database is running and migrations have been applied.
        Your saved records are retained.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
      <a href="/login" className="btn">
        Sign in
      </a>
    </main>
  );
}
