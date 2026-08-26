/**
 * Phase 1 landing page: a deliberately minimal status screen. No features yet —
 * its job is to prove the deployment boots, serves, and reaches the database.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>Commute</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Self-hosted, location-aware auto-scheduling calendar.
      </p>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem 1.25rem",
          borderRadius: 12,
          background: "#111a2e",
          border: "1px solid #1e293b",
          lineHeight: 1.6,
        }}
      >
        <strong>Phase 1 — skeleton.</strong>
        <p style={{ margin: "0.5rem 0 0", color: "#cbd5e1" }}>
          Deployment plumbing only: config validation, migrations, first-boot
          bootstrap, and a schema-verifying health check. Calendar features arrive
          in later phases.
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          Health endpoint:{" "}
          <a href="/api/health" style={{ color: "#7dd3fc" }}>
            /api/health
          </a>
        </p>
      </div>
    </main>
  );
}
