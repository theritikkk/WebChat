import { useCallback, useEffect, useRef, useState } from "react";

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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
          roomId,
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
      socket.emit("call_offer", { callId: callIdRef.current, roomId, offer });
    } catch {
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
      socket.emit("call_answer", { callId, roomId, answer });
    } catch {
      hangup();
    }
  };

  const hangup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    socket.emit("call_end", { callId: callIdRef.current, roomId });
    setCallState("idle");
    onClose();
  }, [socket, roomId, onClose]);

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

  const stateLabel = {
    idle: "Ready",
    calling: "Calling…",
    connected: "● Live",
    incoming: "Incoming call",
  };

  return (
    <div className="video-overlay">
      <div className="video-modal">
        <div className="video-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            📹 Video Call
          </span>
          <span className={`call-badge ${callState}`}>{stateLabel[callState]}</span>
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
            <button type="button" className="btn-call-action start" onClick={startCall}>📞 Call Room</button>
          )}
          {callState === "calling" && (
            <button type="button" className="btn-call-action cancel" onClick={hangup}>✕ Cancel</button>
          )}
          {(callState === "connected" || callState === "incoming") && (
            <>
              <button type="button" className={`btn-call-action ${muted ? "muted" : ""}`} onClick={toggleMute}>
                {muted ? "🔇 Unmute" : "🎤 Mute"}
              </button>
              <button type="button" className={`btn-call-action ${cameraOff ? "cam-off" : ""}`} onClick={toggleCamera}>
                {cameraOff ? "📷 Camera On" : "📷 Camera Off"}
              </button>
            </>
          )}
          {callState === "connected" && (
            <button type="button" className="btn-call-action end" onClick={hangup}>📵 End</button>
          )}
          {callState === "incoming" && (
            <>
              <button type="button" className="btn-call-action answer" onClick={answerCall}>✔ Answer</button>
              <button type="button" className="btn-call-action end" onClick={hangup}>✕ Decline</button>
            </>
          )}
          {callState !== "incoming" && (
            <button type="button" className="btn-call-action close" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
