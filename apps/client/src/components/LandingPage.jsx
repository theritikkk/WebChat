import { useState } from "react";

export default function LandingPage({ onGetStarted }) {
  const [activeTab, setActiveTab] = useState("chat");

  const features = {
    chat: {
      title: "Real-time Workspace Chat",
      desc: "Connect your team with instant messages, rich media sharing, read receipts, and powerful Elasticsearch-backed search to find anything in seconds.",
      details: ["Instant delivery & read statuses", "Elasticsearch full-text search", "Emoji reactions & rich formatting", "Robust network reconnect recovery"],
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    },
    video: {
      title: "Premium Video & Audio Calls",
      desc: "High-quality, low-latency video calling built right into your rooms. Seamlessly minimize calls into Picture-in-Picture mode to keep browsing while talking.",
      details: ["WebRTC crystal clear audio & video", "Built-in Picture-in-Picture mode", "One-click toggle mute & camera", "Zero setup required"],
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      )
    },
    canvas: {
      title: "Infinite Canvas Whiteboard",
      desc: "Brainstorm and design in real-time with your team. Draw, add shapes, text, and edit collaboratively on an infinite workspace.",
      details: ["Real-time collaborative editing", "Vector drawing tools & shapes", "Export options & sticky notes", "Infinite zooming workspace"],
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      )
    },
    sharing: {
      title: "Expressive File Sharing",
      desc: "Share your ideas through documents, images, and videos. Files render directly in the message history with inline playback controls.",
      details: ["Direct image & video rendering", "Drag & drop file upload support", "Secure storage and downloading", "Progress tracking indicators"],
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      )
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-glow-1" />
      <div className="landing-glow-2" />

      {/* Header */}
      <header className="landing-header">
        <div className="landing-logo">
          <div className="landing-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="landing-logo-text">WebChat</span>
        </div>
        <nav className="landing-nav">
          <a href="#features" className="landing-nav-link">Features</a>
          <a href="#availability" className="landing-nav-link">Availability</a>
          <a href="#pricing" className="landing-nav-link">Pricing</a>
        </nav>
        <button type="button" className="btn-primary-glow btn-header-login" onClick={onGetStarted}>
          Sign In
        </button>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-badge-promo">
          <span className="badge-pulse" />
          <span>WebChat Beta is now Live! Free for teams</span>
        </div>
        <h1 className="landing-hero-title">
          Unified Real-time Workspace <br />
          <span className="text-gradient">For Modern Teams</span>
        </h1>
        <p className="landing-hero-subtitle">
          Bring your team together with secure messaging, interactive whiteboards, crystal clear video calls, and instant media sharing — all in one unified client.
        </p>
        <div className="landing-hero-actions">
          <button type="button" className="btn-primary-gradient btn-lg" onClick={onGetStarted}>
            Get Started Free
          </button>
          <a href="#features" className="btn-secondary btn-lg">
            Explore Features
          </a>
        </div>
      </section>

      {/* Features Detail tabs */}
      <section id="features" className="landing-features">
        <div className="section-header">
          <h2 className="section-title">Everything you need, in one place</h2>
          <p className="section-subtitle">No more jumping between separate tabs for chat, calls, and diagrams.</p>
        </div>

        <div className="features-tab-nav">
          {Object.entries(features).map(([key, value]) => (
            <button
              key={key}
              type="button"
              className={`features-tab-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {value.icon}
              <span>{value.title.split(" ")[1] || value.title.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        <div className="features-tab-content">
          <div className="feature-showcase-card">
            <div className="feature-showcase-info">
              <div className="feature-icon-wrapper">{features[activeTab].icon}</div>
              <h3 className="feature-showcase-title">{features[activeTab].title}</h3>
              <p className="feature-showcase-desc">{features[activeTab].desc}</p>
              <ul className="feature-showcase-list">
                {features[activeTab].details.map((d, index) => (
                  <li key={index} className="feature-showcase-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="feature-showcase-visual">
              <div className="visual-mockup">
                <div className="mockup-header">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <div className="mockup-body">
                  {activeTab === "chat" && (
                    <div className="mockup-chat">
                      <div className="mockup-msg other">
                        <div className="mockup-avatar">JD</div>
                        <div className="mockup-bubble">Hey team! Are we ready for the sprint review?</div>
                      </div>
                      <div className="mockup-msg own">
                        <div className="mockup-bubble">Yes, I updated the presentation slides!</div>
                      </div>
                      <div className="mockup-msg other">
                        <div className="mockup-avatar">AL</div>
                        <div className="mockup-bubble">Awesome! Direct message index is working great too.</div>
                      </div>
                    </div>
                  )}
                  {activeTab === "video" && (
                    <div className="mockup-video">
                      <div className="mockup-video-box">
                        <div className="mockup-avatar-lg">You</div>
                        <span className="label">You</span>
                      </div>
                      <div className="mockup-video-box">
                        <div className="mockup-avatar-lg">JD</div>
                        <span className="label">John Doe</span>
                      </div>
                      <div className="mockup-video-pip">
                        <div className="pip-avatar">AL</div>
                        <span className="label">Alice</span>
                      </div>
                    </div>
                  )}
                  {activeTab === "canvas" && (
                    <div className="mockup-canvas">
                      <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
                        <rect x="10" y="20" width="30" height="20" rx="3" stroke="var(--accent)" strokeWidth="1.5" fill="var(--accent-dim)" />
                        <text x="14" y="32" fill="var(--text)" fontSize="4" fontWeight="600">User Story</text>
                        <circle cx="70" cy="50" r="15" stroke="var(--accent-2)" strokeWidth="1.5" fill="var(--accent-2-dim)" />
                        <text x="64" y="52" fill="var(--text)" fontSize="4" fontWeight="600">Feature</text>
                        <path d="M40 30 L55 50" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 3" />
                      </svg>
                    </div>
                  )}
                  {activeTab === "sharing" && (
                    <div className="mockup-sharing">
                      <div className="file-preview-card">
                        <div className="file-preview-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                          </svg>
                        </div>
                        <div className="file-preview-meta">
                          <span className="name">sprint_demo.mp4</span>
                          <span className="size">14.8 MB · Completed</span>
                        </div>
                      </div>
                      <div className="image-preview-card">
                        <div className="image-aspect">
                          <div className="mock-image-content">Screenshot_Final.png</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section id="availability" className="landing-availability">
        <div className="availability-card">
          <div className="availability-info">
            <h2 className="availability-title">Access anywhere, anytime</h2>
            <p className="availability-desc">
              WebChat is built for modern browsers and optimized for devices of all sizes. Enjoy instant sync between your phone, tablet, and workstation.
            </p>
            <div className="availability-badges">
              <div className="avail-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Web App (Chrome, Safari, Firefox)</span>
              </div>
              <div className="avail-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                <span>Mobile Optimized Responsive Layout</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Promotions */}
      <section id="pricing" className="landing-pricing">
        <div className="pricing-card">
          <div className="pricing-header">
            <span className="pricing-badge">LIMITED PROMOTION</span>
            <h3 className="pricing-title">Early Adopter Tier</h3>
            <div className="pricing-price">
              <span className="amount">$0</span>
              <span className="period">/ user / month</span>
            </div>
            <p className="pricing-tagline">Get fully featured team workspaces for free while in beta.</p>
          </div>
          <div className="pricing-features">
            <div className="p-feat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Up to 50 active room members</span>
            </div>
            <div className="p-feat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Unlimited messages & chat search</span>
            </div>
            <div className="p-feat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>WebRTC Video Call rooms included</span>
            </div>
            <div className="p-feat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>100MB File sharing uploads</span>
            </div>
          </div>
          <button type="button" className="btn-primary-gradient btn-pricing-cta" onClick={onGetStarted}>
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-brand">
          <div className="landing-logo">
            <div className="landing-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="landing-logo-text">WebChat</span>
          </div>
          <span className="footer-copyright">© 2026 WebChat. All rights reserved. Built with love for modern workspaces.</span>
        </div>
      </footer>
    </div>
  );
}
