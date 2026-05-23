import { verifyToken } from "../lib/tokens.js";

export function verifyJwt(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.typ === "refresh") {
      return res.status(401).json({ error: "Use access token" });
    }
    req.user = { id: decoded.sub, email: decoded.email, username: decoded.username };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
