import { useState } from "react";

function getInitials(name = "") {
  return name.slice(0, 2).toUpperCase() || "##";
}

/* ── Inline SVG icon helpers ── */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ChatBubbleIcon = (
  <svg {...svgProps} width="20" height="20">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const JoinRoomIcon = (
  <svg {...svgProps} width="18" height="18">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const PlusIcon = (
  <svg {...svgProps} width="18" height="18">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SearchIcon = (
  <svg {...svgProps} width="16" height="16">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ClearIcon = (
  <svg {...svgProps} width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const LockIcon = (
  <svg {...svgProps} width="14" height="14">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const GlobeIcon = (
  <svg {...svgProps} width="14" height="14">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const LogOutIcon = (
  <svg {...svgProps} width="18" height="18">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/* ── Room list item ── */
function RoomItem({ room, isActive, onClick, unread = 0 }) {
  return (
    <div className={`room-item ${isActive ? "active" : ""}`} onClick={() => onClick(room.id)}>
      <div className="room-avatar">
        <span className="room-avatar-text">{getInitials(room.name)}</span>
      </div>
      <div className="room-info">
        <div className="room-name">{room.name}</div>
        <div className="room-last">
          {room.room_type === "private" ? (
            <>{LockIcon} Private</>
          ) : (
            <>{GlobeIcon} Public</>
          )}
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

/* ── Sidebar ── */
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
            <div className="sidebar-brand-icon">{ChatBubbleIcon}</div>
            <span className="sidebar-brand-name">WebChat</span>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="icon-btn" onClick={onJoinRoom} title="Join room">{JoinRoomIcon}</button>
            <button type="button" className="icon-btn" onClick={onCreateRoom} title="New room">{PlusIcon}</button>
          </div>
        </div>

        <div className="search-box">
          <span className="search-icon">{SearchIcon}</span>
          <input
            className="search-input"
            placeholder="Search rooms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear" onClick={() => setSearch("")}>{ClearIcon}</button>
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
            <div className="sidebar-empty-icon">{search ? SearchIcon : ChatBubbleIcon}</div>
            <div className="sidebar-empty-text">
              {search ? "No rooms match your search" : "No rooms yet. Create one!"}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-quick-actions">
        <button type="button" className="add-room-btn" onClick={onCreateRoom}>
          {PlusIcon} New Room
        </button>
        <button type="button" className="join-room-btn" onClick={onJoinRoom}>
          {JoinRoomIcon} Join Room
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
          <div className="user-status">
            {isConnected ? (
              <><span className="status-dot" /> Online</>
            ) : (
              "Connecting…"
            )}
          </div>
        </div>
        <button type="button" className="logout-btn" onClick={onLogout} title="Log out">{LogOutIcon}</button>
      </div>
    </div>
  );
}
