import crypto from "node:crypto";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...extra}
  });
}
function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function makeCookie() {
  const payload = Buffer.from(JSON.stringify({
    admin:true,
    exp: Date.now() + 8 * 60 * 60 * 1000
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  return Object.fromEntries(raw.split(";").map(x => x.trim()).filter(Boolean).map(x => {
    const i=x.indexOf("=");
    return [i>=0?x.slice(0,i):x, i>=0?decodeURIComponent(x.slice(i+1)):""];
  }));
}
function validSession(request) {
  const token = parseCookies(request).tm_admin;
  if (!token) return false;
  const [payload,sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected=sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return false;
  try {
    const d=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return d.admin===true && d.exp>Date.now();
  } catch { return false; }
}

export async function GET(request) {
  try { return json({admin: validSession(request)}); }
  catch (e) { return json({admin:false,error:e.message},500); }
}

export async function POST(request) {
  try {
    const {password} = await request.json();
    if (!process.env.ADMIN_PASSWORD) return json({error:"ADMIN_PASSWORD is not configured."},500);
    const supplied = Buffer.from(typeof password === "string" ? password : "");
    const expected = Buffer.from(process.env.ADMIN_PASSWORD);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return json({error:"Incorrect admin password."},401);
    }

    const cookie = makeCookie();
    return json({ok:true},200,{
      "Set-Cookie": `tm_admin=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
    });
  } catch (e) {
    return json({error:e.message},500);
  }
}

export async function DELETE() {
  return json({ok:true},200,{
    "Set-Cookie":"tm_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  });
}
