"use strict";
// Tether mobile web client. Zero-build vanilla JS against the Tether HTTP API.
const TOKEN_KEY = "tether.token";
let token = localStorage.getItem(TOKEN_KEY) || "";
let sessionId = null;
let lastMsgId = "";
let stream = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

async function api(path, opts = {}) {
  const url = new URL(path, location.origin);
  if (token) url.searchParams.set("token", token);
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { logout(); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------------- Pairing ---------------- */
async function pair() {
  const code = $("#code").value.trim();
  $("#pairErr").textContent = "";
  if (!/^\d{6}$/.test(code)) { $("#pairErr").textContent = "Enter the 6-digit code."; return; }
  try {
    const res = await fetch("/pair", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { $("#pairErr").textContent = data.error || "Pairing failed."; return; }
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    enterApp();
  } catch (e) { $("#pairErr").textContent = String(e.message || e); }
}

function logout() {
  token = ""; localStorage.removeItem(TOKEN_KEY);
  if (stream) { stream.close(); stream = null; }
  $("#app").classList.add("hidden");
  $("#pair").classList.remove("hidden");
}

/* ---------------- App shell ---------------- */
function enterApp() {
  $("#pair").classList.add("hidden");
  $("#app").classList.remove("hidden");
  loadSessions().then(connectStream);
  showTab("chat");
}

function showTab(name) {
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.tab === name);
  for (const p of ["chat", "files", "git"]) $("#tab-" + p).classList.toggle("hidden", p !== name);
  if (name === "files") loadDir("");
}

/* ---------------- Chat ---------------- */
async function loadSessions() {
  const { sessions } = await api("/sessions");
  sessionId = sessions[0] ? sessions[0].id : null;
  if (sessionId) await loadMessages();
}

async function loadMessages() {
  if (!sessionId) return;
  const { messages } = await api(`/sessions/${encodeURIComponent(sessionId)}/messages`);
  const box = $("#messages"); box.innerHTML = "";
  for (const m of messages) addBubble(m);
  if (messages.length) lastMsgId = messages[messages.length - 1].id;
  box.scrollTop = box.scrollHeight;
}

function addBubble(m) {
  const who = m.source === "mobile" ? "you" : "agent";
  const b = el("div", { className: `bubble ${m.source === "mobile" ? "mobile" : "agent"}` },
    el("div", { className: "who", textContent: who }),
    el("div", { textContent: m.text || "" }));
  $("#messages").append(b);
}

async function sendChat(e) {
  e.preventDefault();
  const input = $("#chatInput"); const text = input.value.trim();
  if (!text || !sessionId) return;
  input.value = "";
  const { message } = await api(`/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: "POST", body: { text, kind: "chat" } });
  if (message) { addBubble(message); $("#messages").scrollTop = 1e9; }
}

function connectStream() {
  if (!token) return;
  stream = new EventSource(`/stream?token=${encodeURIComponent(token)}`);
  stream.addEventListener("message", () => { loadMessages().catch(() => {}); });
  stream.onerror = () => {/* browser auto-reconnects */};
}

/* ---------------- Files ---------------- */
async function loadDir(path) {
  $("#fileView").classList.add("hidden");
  $("#fileList").classList.remove("hidden");
  const data = await api(`/files?path=${encodeURIComponent(path)}`);
  renderCrumbs(path);
  const ul = $("#fileList"); ul.innerHTML = "";
  for (const en of data.entries) {
    const li = el("li", { className: en.masked ? "masked" : "" });
    li.append(el("span", { textContent: en.type === "dir" ? "📁" : "📄" }));
    li.append(el("span", { textContent: en.name + (en.type === "dir" ? "/" : "") }));
    if (en.type === "file" && typeof en.size === "number") li.append(el("span", { className: "sz", textContent: en.size + " B" }));
    if (en.masked) li.append(el("span", { className: "sz", textContent: "masked" }));
    else li.onclick = () => (en.type === "dir" ? loadDir(en.path) : openFile(en.path));
    ul.append(li);
  }
}

function renderCrumbs(path) {
  const c = $("#crumbs"); c.innerHTML = "";
  const root = el("a", { href: "#", textContent: "root" }); root.onclick = (e) => { e.preventDefault(); loadDir(""); };
  c.append(root);
  let acc = "";
  for (const part of path.split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part;
    const here = acc;
    c.append(el("span", { textContent: "/" }));
    const a = el("a", { href: "#", textContent: part }); a.onclick = (e) => { e.preventDefault(); loadDir(here); };
    c.append(a);
  }
}

async function openFile(path) {
  try {
    const data = await api(`/files/content?path=${encodeURIComponent(path)}`);
    const v = $("#fileView");
    v.textContent = data.truncated ? `[${data.binary ? "binary" : "large"} file — ${data.size} bytes, not shown]` : (data.content || "");
    $("#fileList").classList.add("hidden");
    v.classList.remove("hidden");
  } catch (e) { alert(String(e.message || e)); }
}

/* ---------------- Git ---------------- */
async function gitStatus() {
  const d = await api("/git/status");
  const v = $("#gitView");
  if (!d.ok) { v.textContent = d.reason || "not a git repository"; return; }
  v.textContent = (d.entries || []).map((e) => `${e.x}${e.y}\t${e.path}`).join("\n") || "(clean working tree)";
}

async function gitDiff() {
  const d = await api("/git/diff");
  const v = $("#gitView"); v.innerHTML = "";
  if (!d.ok) { v.textContent = d.reason || "not a git repository"; return; }
  const text = d.text || "";
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : "";
    v.append(el("span", { className: cls, textContent: line + "\n" }));
  }
  if (!text.trim()) v.textContent = "(no changes)";
}

/* ---------------- wire up ---------------- */
$("#pairBtn").onclick = pair;
$("#code").addEventListener("keydown", (e) => { if (e.key === "Enter") pair(); });
$("#logout").onclick = logout;
$("#chatForm").addEventListener("submit", sendChat);
$("#gitStatusBtn").onclick = () => gitStatus().catch((e) => alert(e.message));
$("#gitDiffBtn").onclick = () => gitDiff().catch((e) => alert(e.message));
for (const b of document.querySelectorAll(".tab")) b.onclick = () => showTab(b.dataset.tab);

if (token) enterApp(); // resume a stored pairing
