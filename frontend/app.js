const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);
const FIELDS = ["title", "category", "venue", "startAt", "price", "quota", "description", "posterUrl", "organizerName"];
const LABEL = {
  SEMINAR: "Seminar", WORKSHOP: "Workshop", KONSER: "Konser", LOMBA: "Lomba", LAINNYA: "Lainnya",
  DRAFT: "Draf", PUBLISHED: "Terbit", CANCELLED: "Dibatalkan",
};
let events = [];
let myEvents = [];
let authMode = "login";

const rupiah = (n) => (Number(n) === 0 ? "Gratis" : "Rp" + Number(n).toLocaleString("id-ID"));
const tanggal = (iso) => new Date(iso).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function say(el, text, isError = false) {
  $(el).textContent = text;
  $(el).className = isError ? "error" : "";
}

async function api(method, path, body) {
  const headers = {};
  const user = Auth.user();
  if (user) headers.Authorization = `Bearer ${user.token}`;
  if (body) headers["content-type"] = "application/json";
  const base = path === "/uploads" ? CFG.mediaUrl : CFG.eventsUrl; // tiap service punya Function URL sendiri
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && user) {
    Auth.signOut();
    refreshAccount();
    throw new Error("sesi login habis, silakan masuk lagi");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

// ------------------------------------------------------------------ akun
function refreshAccount() {
  const user = Auth.user();
  $("who").hidden = !user;
  $("who").textContent = user ? user.email + (user.isOrganizer ? " (penyelenggara)" : "") : "";
  $("login-btn").hidden = !!user;
  $("logout-btn").hidden = !user;
  $("organizer-panel").hidden = !user?.isOrganizer;
  if (user) $("auth-panel").hidden = true;
  if (user?.isOrganizer) loadMine(); else myEvents = [];
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === mode));
  document.querySelectorAll("[data-only]").forEach((el) => {
    el.hidden = !el.dataset.only.split(" ").includes(mode);
  });
  $("auth-submit").textContent = { login: "Masuk", signup: "Daftar" }[mode];
  say("auth-message", "");
}

$("auth-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  try {
    if (authMode === "signup") {
      await Auth.signUp(email, password);
      setAuthMode("login");
      say("auth-message", "Akun dibuat. Silakan masuk.");
    } else {
      await Auth.signIn(email, password);
      $("auth-form").reset();
      refreshAccount();
      say("message", "Berhasil masuk.");
    }
  } catch (e) {
    say("auth-message", e.message, true);
  }
});

document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => setAuthMode(t.dataset.tab)));
$("login-btn").onclick = () => { $("auth-panel").hidden = false; setAuthMode("login"); $("auth-email").focus(); };
$("auth-close").onclick = () => { $("auth-panel").hidden = true; };
$("logout-btn").onclick = () => { Auth.signOut(); resetForm(); refreshAccount(); say("message", "Kamu sudah keluar."); };

// ------------------------------------------------------------------ katalog publik
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // textContent supaya input pengguna tidak dibaca sebagai HTML
  return e;
}

function card(e) {
  const art = el("article", "card" + (e.status === "CANCELLED" ? " muted" : ""));
  if (e.posterUrl) {
    const img = el("img", "thumb");
    img.src = e.posterUrl;
    img.alt = "Poster " + e.title;
    img.loading = "lazy";
    art.append(img);
  } else {
    art.append(el("div", "thumb", LABEL[e.category] || e.category));
  }
  const body = el("div", "card-body");
  const tags = el("div", "tags");
  tags.append(el("span", "pill", LABEL[e.category] || e.category));
  if (e.status === "CANCELLED") tags.append(el("span", "badge cancelled", "Dibatalkan"));
  body.append(tags, el("h3", null, e.title));
  body.append(el("p", "meta", tanggal(e.startAt)));
  body.append(el("p", "meta", e.venue + (e.organizerName ? " · " + e.organizerName : "")));
  const foot = el("div", "card-foot");
  foot.append(el("span", "price", rupiah(e.price)));
  const left = Number(e.quota) - Number(e.sold || 0);
  foot.append(el("span", "quota", left > 0 ? `Sisa ${left} dari ${e.quota} tiket` : "Tiket habis"));
  body.append(foot);
  if (e.description) body.append(el("p", "desc", e.description));
  art.append(body);
  return art;
}

function render() {
  const cat = $("filter-category").value;
  const onlyFree = $("only-free").checked;
  const shown = events
    .filter((e) => !cat || e.category === cat)
    .filter((e) => !onlyFree || Number(e.price) === 0)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  $("list").replaceChildren(...shown.map(card));
  if (!shown.length) $("list").innerHTML = '<p class="empty">Belum ada acara.</p>';
}

async function load() {
  try {
    events = await api("GET", "/events");
    render();
  } catch (e) {
    say("message", "Gagal memuat acara: " + e.message, true);
  }
}

// ------------------------------------------------------------------ panel penyelenggara
function row(e) {
  const r = el("div", "mine-row");
  const info = el("div", "mine-info");
  info.append(el("span", `badge ${e.status.toLowerCase()}`, LABEL[e.status]), el("strong", null, e.title),
              el("span", "meta", `${tanggal(e.startAt)} · ${rupiah(e.price)} · kuota ${e.quota}`));
  const actions = el("div", "card-actions");
  const add = (text, cls, fn) => { const b = el("button", cls, text); b.onclick = () => fn(b); actions.append(b); };
  if (e.status !== "CANCELLED") add("Ubah", "secondary", () => startEdit(e));
  if (e.status === "DRAFT") {
    add("Terbitkan", null, () => setStatus(e, "PUBLISHED", "Acara diterbitkan."));
    add("Hapus", "danger", (b) => confirmThen(b, () => remove(e)));
  }
  if (e.status === "PUBLISHED") add("Batalkan acara", "danger", (b) => confirmThen(b, () => setStatus(e, "CANCELLED", "Acara dibatalkan.")));
  r.append(info, actions);
  return r;
}

function renderMine() {
  const sorted = [...myEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("my-list").replaceChildren(...sorted.map(row));
  if (!sorted.length) $("my-list").innerHTML = '<p class="empty">Kamu belum membuat acara.</p>';
}

async function loadMine() {
  try {
    myEvents = await api("GET", "/me/events");
    renderMine();
  } catch (e) {
    say("message", "Gagal memuat acara saya: " + e.message, true);
  }
}

function confirmThen(btn, fn) {
  // tombol dua langkah, tanpa dialog browser
  if (btn.dataset.confirm !== "1") {
    const label = btn.textContent;
    btn.dataset.confirm = "1";
    btn.textContent = "Yakin?";
    setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = label; }, 3000);
    return;
  }
  fn();
}

async function refreshAll() {
  await Promise.all([load(), loadMine()]);
}

async function setStatus(e, status, msg) {
  try {
    await api("PUT", `/events/${e.eventId}`, { status });
    say("message", msg);
    await refreshAll();
  } catch (err) {
    say("message", "Gagal: " + err.message, true);
  }
}

async function remove(e) {
  try {
    await api("DELETE", `/events/${e.eventId}`);
    say("message", `Draf "${e.title}" dihapus.`);
    await refreshAll();
  } catch (err) {
    say("message", "Gagal menghapus: " + err.message, true);
  }
}

async function uploadPoster(file) {
  const { uploadUrl, photoUrl } = await api("POST", "/uploads", { contentType: file.type });
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!res.ok) throw new Error(`upload poster gagal (HTTP ${res.status})`);
  return photoUrl;
}

function formData() {
  const data = {};
  for (const f of FIELDS) {
    const v = $(f).value.trim();
    if (v === "") continue;
    data[f] = f === "price" || f === "quota" ? parseInt(v, 10) : v;
  }
  return data;
}

function resetForm() {
  $("event-form").reset();
  $("eventId").value = "";
  $("posterUrl").value = "";
  $("poster-preview").hidden = true;
  $("form-title").textContent = "Buat acara";
  $("submit-btn").textContent = "Simpan sebagai draf";
  $("cancel-btn").hidden = true;
}

function startEdit(e) {
  for (const f of FIELDS) $(f).value = e[f] ?? "";
  $("startAt").value = String(e.startAt).slice(0, 16);
  $("eventId").value = e.eventId;
  $("poster-preview").hidden = !e.posterUrl;
  if (e.posterUrl) $("poster-preview").src = e.posterUrl;
  $("form-title").textContent = "Ubah acara";
  $("submit-btn").textContent = "Simpan perubahan";
  $("cancel-btn").hidden = false;
  $("organizer-panel").scrollIntoView({ behavior: "smooth" });
}

$("poster").onchange = () => {
  const file = $("poster").files[0];
  $("poster-preview").hidden = !file;
  if (file) $("poster-preview").src = URL.createObjectURL(file);
};

$("event-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = $("eventId").value;
  $("submit-btn").disabled = true;
  try {
    const file = $("poster").files[0];
    if (file) {
      say("message", "Mengunggah poster...");
      $("posterUrl").value = await uploadPoster(file);
    }
    const data = formData();
    if (id) {
      await api("PUT", `/events/${id}`, data);
      say("message", "Perubahan disimpan.");
    } else {
      await api("POST", "/events", data);
      say("message", "Acara disimpan sebagai draf. Klik Terbitkan supaya muncul di katalog.");
    }
    resetForm();
    await refreshAll();
  } catch (e) {
    say("message", "Gagal menyimpan: " + e.message, true);
  } finally {
    $("submit-btn").disabled = false;
  }
});

$("cancel-btn").onclick = resetForm;
$("filter-category").onchange = render;
$("only-free").onchange = render;
setAuthMode("login");
refreshAccount();
load();
