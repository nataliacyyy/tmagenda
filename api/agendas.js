import { get, put } from "@vercel/blob";
import crypto from "node:crypto";

const DATA_PATH = "tangara/agenda-data.json";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  return Object.fromEntries(raw.split(";").map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf("=");
    return [i >= 0 ? x.slice(0,i) : x, i >= 0 ? decodeURIComponent(x.slice(i+1)) : ""];
  }));
}

function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function validSession(request) {
  const token = parseCookies(request).tm_admin;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.admin === true && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function readData() {
  const result = await get(DATA_PATH, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return { agendas: [], revision: "0", updatedAt: null };
  }
  const text = await new Response(result.stream).text();
  try {
    const data = JSON.parse(text);
    return {
      agendas: Array.isArray(data.agendas) ? data.agendas : [],
      revision: data.revision || "0",
      updatedAt: data.updatedAt || null,
    };
  } catch {
    return { agendas: [], revision: "0", updatedAt: null };
  }
}

async function writeData(agendas) {
  const updatedAt = new Date().toISOString();
  const revision = crypto.createHash("sha256")
    .update(JSON.stringify(agendas) + updatedAt)
    .digest("hex");

  const payload = JSON.stringify({ agendas, revision, updatedAt });
  await put(DATA_PATH, payload, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return { agendas, revision, updatedAt };
}

function cleanItem(item) {
  const allowed = ["id","director","title","date","startTime","endTime","location","picInternal","picExternal","status","notes"];
  const out = {};
  for (const key of allowed) out[key] = typeof item?.[key] === "string" ? item[key].trim() : (item?.[key] ?? "");
  out.status = ["CONFIRMED","TBC","POSTPONE","CANCELLED","DONE"].includes(out.status) ? out.status : "CONFIRMED";
  return out;
}

export async function GET(request) {
  try {
    const data = await readData();
    return json(data);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function POST(request) {
  if (!validSession(request)) return json({ error: "Unauthorized. Admin login required." }, 401);

  try {
    const body = await request.json();
    const data = await readData();

    if (body.action === "upsert") {
      const item = cleanItem(body.item);
      if (!item.id || !item.title || !item.date || !item.startTime) {
        return json({ error: "Missing required agenda fields." }, 400);
      }
      const idx = data.agendas.findIndex(a => a.id === item.id);
      if (idx >= 0) data.agendas[idx] = item;
      else data.agendas.push(item);
    } else if (body.action === "delete") {
      if (!body.id) return json({ error: "Missing agenda id." }, 400);
      data.agendas = data.agendas.filter(a => a.id !== body.id);
    } else {
      return json({ error: "Unknown action." }, 400);
    }

    const saved = await writeData(data.agendas);
    return json(saved);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
