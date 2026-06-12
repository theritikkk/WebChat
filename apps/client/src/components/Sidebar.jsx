import { useState } from "react";

function getInitials(name = "") {
  return name.slice(0, 2).toUpperCase() || "##";
}

function RoomItem({ room, isActive, onClick, unread = 0 }) {
  return (
    <div className={`room-item ${isActive ? "active" : ""}`} onClick={() => onClick(room.id)}>
      <div className="room-avatar">
        <span className="room-avatar-text">{getInitials(room.name)}</span>
      </div>
      <div className="room-info">
        <div className="room-name">{room.name}</div>
        <div className="room-last">
          {room.room_type === "private" ? "🔒 Private" : "🌐 Public"}
        </div>
      </div>
      <div className="room-meta">
        {unread > 0 && (
          <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  className = "",
  rooms,
  activeRoomId,
  onSelectRoom,
  onCreateRoom,
  onJoinRoom,
  onLogout,
  username,
  isConnected,
  loadingRooms,
  unread = {},
  onlineUsers,
}) {
  const [search, setSearch] = useState("");

  const filtered = rooms.filter((r) =>
    r.name?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = onlineUsers?.size ?? 0;

  return (
    <div className={`sidebar ${className}`}>
      <div className="sidebar-header">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">💬</div>
            <span className="sidebar-brand-name">WebChat</span>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="icon-btn" onClick={onJoinRoom} title="Join room">⤵</button>
            <button type="button" className="icon-btn" onClick={onCreateRoom} title="New room">✚</button>
          </div>
        </div>

        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            placeholder="Search rooms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear" onClick={() => setSearch("")}>✕</button>
          )}
        </div>
      </div>

      <div className="rooms-list">
        {loadingRooms ? (
          <div className="rooms-skeleton">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton-room" />)}
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="rooms-section-label">
              Rooms {onlineCount > 0 && `· ${onlineCount} users online`}
            </div>
            {filtered.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                isActive={room.id === activeRoomId}
                onClick={onSelectRoom}
                unread={unread[room.id] || 0}
              />
            ))}
          </>
        ) : (
          <div className="sidebar-empty">
            <div className="sidebar-empty-icon">{search ? "🔍" : "💬"}</div>
            <div className="sidebar-empty-text">
              {search ? "No rooms match your search" : "No rooms yet. Create one!"}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-quick-actions">
        <button type="button" className="add-room-btn" onClick={onCreateRoom}>
          ＋ New Room
        </button>
        <button type="button" className="join-room-btn" onClick={onJoinRoom}>
          ⤵ Join Room
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="user-avatar">
          {getInitials(username)}
          <span
            className="online-dot"
            style={!isConnected ? { background: "var(--danger)" } : undefined}
          />
        </div>
        <div className="user-info">
          <div className="user-name">{username || "You"}</div>
          <div className="user-status">{isConnected ? "● Online" : "○ Connecting…"}</div>
        </div>
        <button type="button" className="logout-btn" onClick={onLogout} title="Log out">⎋</button>
      </div>
    </div>
  );
}
