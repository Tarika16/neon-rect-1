import Link from "next/link";
import { Shield, ArrowRight, Users, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="hero">
      {/* Background glows */}
      <div
        className="glow-bg"
        style={{ top: "-100px", left: "-100px", background: "#6c63ff" }}
      />
      <div
        className="glow-bg"
        style={{ bottom: "-100px", right: "-100px", background: "#22c55e" }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(108,99,255,0.1)",
            border: "1px solid rgba(108,99,255,0.25)",
            borderRadius: "20px",
            padding: "0.4rem 1rem",
            fontSize: "0.85rem",
            color: "#6c63ff",
            marginBottom: "1.5rem",
          }}
        >
          <Shield size={14} />
          Secure Role-Based Access
        </div>

        <h1>Your Command Center for User Management</h1>
        <p>
          A sleek dashboard with admin approval workflows, role-based access
          control, and real-time user management — powered by Neon DB.
        </p>

        <div className="hero-buttons">
          <Link href="#features" className="btn btn-primary">
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="btn btn-outline">
            Sign In
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            gap: "2.5rem",
            marginTop: "3.5rem",
            color: "var(--text-secondary)",
            fontSize: "0.88rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Users size={16} />
            Role Management
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Lock size={16} />
            Admin Approval
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Shield size={16} />
            Secure Auth
          </div>
        </div>

        {/* Features Section */}
        <div id="features" style={{ marginTop: "8rem", textAlign: "left" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "2rem", textAlign: "center" }}>Why Choose This Dashboard?</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2rem" }}>
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <Shield size={32} color="#6c63ff" style={{ marginBottom: "1rem" }} />
              <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Admin Console</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Full control over user accounts. Approve, reject, or delete users with a single click.
              </p>
            </div>

            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <Lock size={32} color="#22c55e" style={{ marginBottom: "1rem" }} />
              <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Role-Based Access</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Secure roles (Admin vs User). Critical actions are protected and validated on the server.
              </p>
            </div>

            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <Users size={32} color="#f59e0b" style={{ marginBottom: "1rem" }} />
              <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>User Workflows</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Seamless signup flow with "Pending Approval" state handling to prevent unauthorized access.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
