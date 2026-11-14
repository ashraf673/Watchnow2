const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLOUD_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function fail(message, status = 400) { return json({ error: message }, status); }
function cors(request, response, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const headers = new Headers(response.headers);
  if (allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,Content-Range");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers });
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}
async function ownerUid(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !env.FIREBASE_WEB_API_KEY) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const result = await response.json();
  const user = result.users?.[0];
  return user?.localId || null;
}
async function deviceAuth(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const hash = await sha256(token);
  return await env.DB.prepare(
    "SELECT device_id, owner_uid, device_name, drive_folder_id FROM devices WHERE token_hash = ? AND revoked_at IS NULL AND token_expires_at > ?"
  ).bind(hash, Date.now()).first();
}
async function googleAccessToken(env) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google Drive authorization failed: " + (data.error || response.status));
  return data.access_token;
}
async function driveFetch(env, path, options = {}) {
  const accessToken = await googleAccessToken(env);
  return fetch("https://www.googleapis.com/drive/v3" + path, {
    ...options, headers: { ...(options.headers || {}), Authorization: "Bearer " + accessToken }
  });
}
async function ensureDeviceFolder(env, device) {
  if (device.drive_folder_id) return device.drive_folder_id;
  const q = encodeURIComponent(`name='Device-${device.device_id}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const list = await driveFetch(env, `/files?q=${q}&fields=files(id,name)&pageSize=10`);
  const listed = await list.json();
  if (!list.ok) throw new Error("Drive folder lookup failed");
  let folderId = listed.files?.[0]?.id;
  if (!folderId) {
    const create = await driveFetch(env, "/files?fields=id", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Device-" + device.device_id, mimeType: "application/vnd.google-apps.folder", ...(env.DRIVE_ROOT_FOLDER_ID ? { parents: [env.DRIVE_ROOT_FOLDER_ID] } : {}) })
    });
    const created = await create.json();
    if (!create.ok || !created.id) throw new Error("Drive device folder creation failed");
    folderId = created.id;
  }
  await env.DB.prepare("UPDATE devices SET drive_folder_id=? WHERE device_id=?").bind(folderId, device.device_id).run();
  return folderId;
}
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/health" && request.method === "GET") return json({ ok: true, service: "partypark-backend", version: 1 });
  if (!env.DB) return fail("D1 binding DB is missing", 503);

  if (path === "/v1/activation-codes" && request.method === "POST") {
    const uid = await ownerUid(request, env);
    if (!uid) return fail("Owner authentication required", 401);
    const input = await bodyJson(request);
    if (!input || typeof input.deviceName !== "string" || input.deviceName.length > 80) return fail("deviceName is required (max 80 characters)");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, "0");
    const now = Date.now();
    await env.DB.prepare("INSERT OR IGNORE INTO owners(uid,created_at) VALUES(?,?)").bind(uid, now).run();
    await env.DB.prepare("INSERT INTO activation_codes(code_hash,owner_uid,expires_at,created_at) VALUES(?,?,?,?)").bind(await sha256(code), uid, now + CODE_TTL_MS, now).run();
    return json({ code, expiresAt: now + CODE_TTL_MS, expiresInSeconds: 600 }, 201);
  }

  if (path === "/v1/devices/redeem" && request.method === "POST") {
    const input = await bodyJson(request);
    if (!input || !/^\d{8}$/.test(input.code || "") || typeof input.deviceId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(input.deviceId)) return fail("Valid 8-digit code and deviceId are required");
    const now = Date.now();
    const codeHash = await sha256(input.code);
    const claimed = await env.DB.prepare(
      "UPDATE activation_codes SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING owner_uid"
    ).bind(now, codeHash, now).first();
    if (!claimed?.owner_uid) return fail("Activation code is invalid, expired, or already used", 401);
    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const deviceName = String(input.deviceName || "Android device").slice(0, 80);
    try {
      await env.DB.prepare(
        "INSERT INTO devices(device_id,owner_uid,device_name,token_hash,created_at,last_seen_at,token_expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET owner_uid=excluded.owner_uid,device_name=excluded.device_name,token_hash=excluded.token_hash,created_at=excluded.created_at,last_seen_at=excluded.last_seen_at,token_expires_at=excluded.token_expires_at,revoked_at=NULL"
      ).bind(input.deviceId,claimed.owner_uid,deviceName,tokenHash,now,now,now+DEVICE_TOKEN_TTL_MS).run();
    } catch { return fail("Could not register device", 409); }
    return json({ deviceId: input.deviceId, deviceToken: token, tokenExpiresAt: now + DEVICE_TOKEN_TTL_MS }, 201);
  }

  if (path === "/v1/devices" && request.method === "GET") {
    const uid = await ownerUid(request, env);
    if (!uid) return fail("Owner authentication required", 401);
    const result = await env.DB.prepare("SELECT device_id AS deviceId,device_name AS deviceName,created_at AS createdAt,last_seen_at AS lastSeenAt FROM devices WHERE owner_uid=? AND revoked_at IS NULL ORDER BY created_at DESC").bind(uid).all();
    return json({ devices: result.results || [] });
  }

  const revokeMatch = path.match(/^\/v1\/devices\/([A-Za-z0-9_-]+)$/);
  if (revokeMatch && request.method === "DELETE") {
    const uid = await ownerUid(request, env);
    if (!uid) return fail("Owner authentication required", 401);
    await env.DB.prepare("UPDATE devices SET revoked_at=? WHERE device_id=? AND owner_uid=?").bind(Date.now(),revokeMatch[1],uid).run();
    return json({ ok: true });
  }

  const photoListMatch = path.match(/^\/v1\/devices\/([A-Za-z0-9_-]+)\/photos$/);
  if (photoListMatch && request.method === "GET") {
    const uid = await ownerUid(request, env);
    if (!uid) return fail("Owner authentication required", 401);
    const result = await env.DB.prepare("SELECT photo_id AS photoId,device_id AS deviceId,file_name AS fileName,mime_type AS mimeType,byte_size AS byteSize,captured_at AS capturedAt,uploaded_at AS uploadedAt,expires_at AS expiresAt,width,height FROM photos WHERE owner_uid=? AND device_id=? AND status='ready' ORDER BY uploaded_at DESC LIMIT 500").bind(uid,photoListMatch[1]).all();
    return json({ photos: result.results || [] });
  }

  if (path === "/v1/photos/upload-sessions" && request.method === "POST") {
    const device = await deviceAuth(request, env);
    if (!device) return fail("Device authentication required", 401);
    const input = await bodyJson(request);
    if (!input || typeof input.fileName !== "string" || input.fileName.length > 240) return fail("fileName is required");
    const mimeType = String(input.mimeType || "image/jpeg");
    if (!mimeType.startsWith("image/")) return fail("Only image uploads are supported");
    const folderId = await ensureDeviceFolder(env, device);
    const metadata = { name: input.fileName.replace(/[\\/]/g,"_"), mimeType, parents: [folderId], appProperties: { partyparkDeviceId: device.device_id } };
    const response = await driveFetch(env, "/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime", {
      method: "POST", headers: { "content-type": "application/json", "x-upload-content-type": mimeType }, body: JSON.stringify(metadata)
    });
    if (!response.ok) return fail("Google Drive could not start upload", 502);
    const sessionUrl = response.headers.get("Location");
    if (!sessionUrl) return fail("Drive did not return an upload session", 502);
    const sessionId = randomToken(18), now = Date.now();
    await env.DB.prepare("INSERT INTO upload_sessions(session_id,owner_uid,device_id,drive_session_url,file_name,mime_type,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(sessionId,device.owner_uid,device.device_id,sessionUrl,metadata.name,mimeType,now,now+UPLOAD_SESSION_TTL_MS).run();
    return json({ sessionId, maxChunkBytes: MAX_CHUNK_BYTES }, 201);
  }

  const chunkMatch = path.match(/^\/v1\/photos\/upload-sessions\/([A-Za-z0-9_-]+)$/);
  if (chunkMatch && request.method === "PUT") {
    const device = await deviceAuth(request, env);
    if (!device) return fail("Device authentication required", 401);
    const session = await env.DB.prepare("SELECT * FROM upload_sessions WHERE session_id=? AND device_id=? AND expires_at>?").bind(chunkMatch[1],device.device_id,Date.now()).first();
    if (!session) return fail("Upload session not found or expired", 404);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > MAX_CHUNK_BYTES) return fail("Chunk must be between 1 byte and 8 MiB", 413);
    const headers = {};
    for (const name of ["content-range","content-type"]) if (request.headers.has(name)) headers[name] = request.headers.get(name);
    const response = await fetch(session.drive_session_url,{method:"PUT",headers,body:data});
    const textBody = await response.text();
    return new Response(textBody || null,{status:response.status,headers:{"content-type":response.headers.get("content-type") || "application/json","cache-control":"no-store"}});
  }

  const completeMatch = path.match(/^\/v1\/photos\/upload-sessions\/([A-Za-z0-9_-]+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    const device = await deviceAuth(request, env);
    if (!device) return fail("Device authentication required", 401);
    const session = await env.DB.prepare("SELECT * FROM upload_sessions WHERE session_id=? AND device_id=? AND expires_at>?").bind(completeMatch[1],device.device_id,Date.now()).first();
    if (!session) return fail("Upload session not found or expired",404);
    const input = await bodyJson(request) || {};
    const fileId = String(input.driveFileId || "");
    if (!fileId) return fail("driveFileId is required");
    const metaResponse = await driveFetch(env, "/files/"+encodeURIComponent(fileId)+"?fields=id,name,mimeType,size,createdTime,imageMediaMetadata,parents,appProperties");
    const file = await metaResponse.json();
    if (!metaResponse.ok || !file.id || !(file.parents || []).includes(await ensureDeviceFolder(env, device)) || file.appProperties?.partyparkDeviceId !== device.device_id) return fail("Uploaded Drive file does not belong to this device",403);
    const now = Date.now(), photoId = randomToken(18);
    await env.DB.prepare("INSERT INTO photos(photo_id,owner_uid,device_id,drive_file_id,file_name,mime_type,byte_size,captured_at,uploaded_at,expires_at,width,height,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'ready')")
      .bind(photoId,device.owner_uid,device.device_id,file.id,file.name,file.mimeType || session.mime_type,Number(file.size||0),Number(input.capturedAt||0)||null,now,now+CLOUD_RETENTION_MS,Number(file.imageMediaMetadata?.width||0)||null,Number(file.imageMediaMetadata?.height||0)||null).run();
    await env.DB.prepare("DELETE FROM upload_sessions WHERE session_id=?").bind(session.session_id).run();
    return json({ photoId, uploadedAt: now, expiresAt: now+CLOUD_RETENTION_MS },201);
  }

  const contentMatch = path.match(/^\/v1\/photos\/([A-Za-z0-9_-]+)\/content$/);
  if (contentMatch && request.method === "GET") {
    const uid = await ownerUid(request, env);
    if (!uid) return fail("Owner authentication required",401);
    const photo = await env.DB.prepare("SELECT drive_file_id,file_name,mime_type FROM photos WHERE photo_id=? AND owner_uid=? AND status='ready'").bind(contentMatch[1],uid).first();
    if (!photo) return fail("Photo not found",404);
    const response = await driveFetch(env,"/files/"+encodeURIComponent(photo.drive_file_id)+"?alt=media");
    if (!response.ok) return fail("Google Drive download failed",502);
    const headers = new Headers({ "content-type": photo.mime_type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(photo.file_name)}`, "cache-control":"private, no-store" });
    return new Response(response.body,{headers});
  }

  return fail("Not found",404);
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request, env); }
    catch (error) { console.error("Partypark backend error", error); response = fail("Internal backend error",500); }
    return cors(request,response,env);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const expired = await env.DB.prepare("SELECT photo_id,drive_file_id FROM photos WHERE expires_at<=? LIMIT 100").bind(Date.now()).all();
      for (const item of expired.results || []) {
        const response = await driveFetch(env,"/files/"+encodeURIComponent(item.drive_file_id),{method:"DELETE"});
        if (response.ok || response.status===404) await env.DB.prepare("DELETE FROM photos WHERE photo_id=?").bind(item.photo_id).run();
        else await env.DB.prepare("UPDATE photos SET status='delete_pending' WHERE photo_id=?").bind(item.photo_id).run();
      }
      await env.DB.prepare("DELETE FROM activation_codes WHERE expires_at<=? OR consumed_at IS NOT NULL").bind(Date.now()-CODE_TTL_MS).run();
      await env.DB.prepare("DELETE FROM upload_sessions WHERE expires_at<=?").bind(Date.now()).run();
    })());
  }
};
