import { useCallback, useEffect, useRef, useState } from "react";

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/* ─── Inline SVG icons (Lucide-style, stroke-based) ─── */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: { flexShrink: 0 },
};

const VideoIcon = () => (
  <svg {...iconProps}>
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const PhoneIcon = () => (
  <svg {...iconProps}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const PhoneOffIcon = () => (
  <svg {...iconProps}>
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67" />
    <path d="M14.68 14.68a19.5 19.5 0 0 1-6-6" />
    <path d="M2.12 4.18A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const XIcon = () => (
  <svg {...iconProps}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MicIcon = () => (
  <svg {...iconProps}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const MicOffIcon = () => (
  <svg {...iconProps}>
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const CameraIcon = () => (
  <svg {...iconProps}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const CameraOffIcon = () => (
  <svg {...iconProps}>
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
    <path d="M15.28 15.28A4 4 0 1 1 8.72 8.72" />
  </svg>
);

const CheckIcon = () => (
  <svg {...iconProps}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ─── Component ─── */
export default function VideoCall({ socket, roomId, onClose }) {
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callIdRef = useRef(`call-${Date.now()}`);
  const [callState, setCallState] = useState("idle");
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Capture active call room ID.
  const callRoomIdRef = useRef(roomId);

  // Sync callRoomIdRef with the roomId prop only when not in an active call.
  // This allows switching rooms to change the call target while idle, but keeps
  // the ongoing call bound to its original room if the user navigates elsewhere.
  useEffect(() => {
    if (callState === "idle") {
      callRoomIdRef.current = roomId;
    }
  }, [roomId, callState]);

  /* ── Shared cleanup: stops all media tracks & closes peer connection ── */
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
  }, []);

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    return stream;
  };

  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(STUN);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("call_ice_candidate", {
          callId: callIdRef.current,
          roomId: callRoomIdRef.current,
          candidate: e.candidate,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) hangup();
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    setCallState("calling");
    try {
      const stream = await getLocalStream();
      const pc = createPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call_offer", { callId: callIdRef.current, roomId: callRoomIdRef.current, offer });
    } catch {
      cleanup();
      setCallState("idle");
    }
  };

  const answerCall = async () => {
    const { offer, call_id: callId } = incomingOffer;
    callIdRef.current = callId;
    setCallState("connected");
    try {
      const stream = await getLocalStream();
      const pc = createPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call_answer", { callId, roomId: callRoomIdRef.current, answer });
    } catch {
      hangup();
    }
  };

  /* ── Hangup: cleanup + notify remote + close UI ── */
  const hangup = useCallback(() => {
    cleanup();
    socket.emit("call_end", { callId: callIdRef.current, roomId: callRoomIdRef.current });
    setCallState("idle");
    onClose();
  }, [socket, onClose, cleanup]);

  /* ── Close button: cleanup tracks then close UI (no remote signal when idle) ── */
  const handleClose = useCallback(() => {
    cleanup();
    if (callState === "calling" || callState === "connected") {
      socket.emit("call_end", { callId: callIdRef.current, roomId: callRoomIdRef.current });
    }
    setCallState("idle");
    onClose();
  }, [cleanup, callState, socket, onClose]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOff((c) => !c);
  };

  /* ── Socket event listeners ── */
  useEffect(() => {
    if (!socket) return;
    const onOffer = (data) => { setIncomingOffer(data); setCallState("incoming"); };
    const onAnswer = async (data) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
    };
    const onIce = async (data) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch { /* ignore stale candidates */ }
    };
    const onEnd = () => hangup();

    socket.on("call_offer", onOffer);
    socket.on("call_answer", onAnswer);
    socket.on("call_ice_candidate", onIce);
    socket.on("call_end", onEnd);

    return () => {
      socket.off("call_offer", onOffer);
      socket.off("call_answer", onAnswer);
      socket.off("call_ice_candidate", onIce);
      socket.off("call_end", onEnd);
    };
  }, [socket, hangup]);

  /* ── Escape key handler ── */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  /* ── Unmount cleanup: guarantee tracks are stopped ── */
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, []);

  const stateLabel = {
    idle: "Ready",
    calling: "Calling…",
    connected: "Live",
    incoming: "Incoming call",
  };

  return (
    <div className={`video-overlay${minimized ? " minimized" : ""}`}>
      <div className="video-modal">
        <div className="video-header">
          <span className="video-header-title">
            <VideoIcon /> Video Call
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`call-badge ${callState}`}>
              <span className="call-dot" />
              {stateLabel[callState]}
            </span>
            <button
              type="button"
              className="icon-btn minimize-call-btn"
              onClick={() => setMinimized((m) => !m)}
              title={minimized ? "Restore window" : "Minimize window"}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-3)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-3)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              {minimized ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="10" y1="14" x2="3" y2="21" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="video-grid">
          <div className="video-box">
            <video ref={localRef} autoPlay muted playsInline />
            <span className="video-label">You {muted ? "(muted)" : ""} {cameraOff ? "(cam off)" : ""}</span>
          </div>
          <div className="video-box">
            <video ref={remoteRef} autoPlay playsInline />
            <span className="video-label">Remote</span>
          </div>
        </div>

        <div className="video-controls">
          {callState === "idle" && (
            <button type="button" className="btn-call-action start" onClick={startCall}>
              <PhoneIcon /> Call Room
            </button>
          )}
          {callState === "calling" && (
            <button type="button" className="btn-call-action cancel" onClick={hangup}>
              <XIcon /> Cancel
            </button>
          )}
          {(callState === "connected" || callState === "incoming") && (
            <>
              <button
                type="button"
                className={`btn-call-action mute-btn${muted ? " active" : ""}`}
                onClick={toggleMute}
              >
                {muted ? <><MicOffIcon /> Unmute</> : <><MicIcon /> Mute</>}
              </button>
              <button
                type="button"
                className={`btn-call-action cam-btn${cameraOff ? " active" : ""}`}
                onClick={toggleCamera}
              >
                {cameraOff ? <><CameraOffIcon /> Camera On</> : <><CameraIcon /> Camera Off</>}
              </button>
            </>
          )}
          {callState === "connected" && (
            <button type="button" className="btn-call-action end" onClick={hangup}>
              <PhoneOffIcon /> End
            </button>
          )}
          {callState === "incoming" && (
            <>
              <button type="button" className="btn-call-action answer" onClick={answerCall}>
                <CheckIcon /> Answer
              </button>
              <button type="button" className="btn-call-action end" onClick={hangup}>
                <XIcon /> Decline
              </button>
            </>
          )}
          {callState !== "incoming" && (
            <button type="button" className="btn-call-action close" onClick={handleClose}>
              <XIcon /> Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
