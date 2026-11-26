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
const jam = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

function say(el, text, isError = false) {
  $(el).textContent = text;
  $(el).className = isError ? "error" : "";
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // textContent supaya input pengguna tidak dibaca sebagai HTML
  return e;
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
    route();
    throw new Error("sesi login habis, silakan masuk lagi");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

// ------------------------------------------------------------------ peran dan halaman
// Peran diambil dari token login. Ini hanya mengatur tampilan; aturan sebenarnya
// (siapa boleh membuat/mengubah acara) diperiksa ulang oleh event-service.
const role = (user) => (!user ? "tamu" : user.isOrganizer ? "penyelenggara" : "peserta");

function route() {
  const user = Auth.user();
  const r = role(user);
  let view = location.hash.slice(1) || "katalog";
  if (view === "dasbor" && r === "tamu") view = "katalog";

  $("who").hidden = !user;
  $("who").textContent = user ? `${user.email} · ${r}` : "";
  $("login-btn").hidden = !!user;
  $("logout-btn").hidden = !user;
  $("nav-dasbor").hidden = !user;
  if (user) $("auth-panel").hidden = true;

  $("view-katalog").hidden = view !== "katalog";
  $("view-peserta").hidden = !(view === "dasbor" && r === "peserta");
  $("view-penyelenggara").hidden = !(view === "dasbor" && r === "penyelenggara");
  for (const a of document.querySelectorAll(".views a")) {
    if (a.getAttribute("href") === "#" + view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  if (view === "katalog") render();
  if (view === "dasbor" && r === "peserta") renderPeserta();
  if (view === "dasbor" && r === "penyelenggara") loadMine();
}
window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ akun
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === mode));
  document.querySelectorAll("[data-only]").forEach((n) => {
    n.hidden = !n.dataset.only.split(" ").includes(mode);
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
      afterLogin();
    }
  } catch (e) {
    say("auth-message", e.message, true);
  }
});

document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => setAuthMode(t.dataset.tab)));
$("login-btn").onclick = () => { $("auth-panel").hidden = false; setAuthMode("login"); $("auth-email").focus(); };
$("auth-close").onclick = () => { $("auth-panel").hidden = true; };
$("logout-btn").onclick = () => {
  Auth.signOut();
  resetForm();
  myEvents = [];
  say("message", "Kamu sudah keluar.");
  if (location.hash === "#katalog") route(); else location.hash = "katalog";
};

// Masuk dengan Google (SSO). Tombol hanya muncul jika deploy diberi GOOGLE_CLIENT_ID.
async function afterLogin() {
  $("auth-form").reset();
  say("message", "");
  if (location.hash === "#dasbor") route(); else location.hash = "dasbor";
}
function initGoogle() {
  if (!CFG.googleClientId || !window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: CFG.googleClientId,
    callback: async ({ credential }) => {
      try { await Auth.signInGoogle(credential); afterLogin(); } catch (e) { say("auth-message", e.message, true); }
    },
  });
  google.accounts.id.renderButton($("google-btn"), { theme: "outline", size: "large", text: "signin_with", locale: "id", width: 300 });
  $("sso").hidden = false;
}
window.onGoogleLibraryLoad = initGoogle;

// ------------------------------------------------------------------ acara tersimpan (peserta)
// ponytail: disimpan di browser per akun; pindah ke S3 (users/{email}.json) kalau perlu lintas perangkat
const savedKey = () => "eventory-saved-" + (Auth.user()?.sub || "");
function savedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(savedKey())) || []); } catch (e) { return new Set(); }
}
function toggleSaved(id) {
  const s = savedIds();
  if (s.has(id)) s.delete(id); else s.add(id);
  try { localStorage.setItem(savedKey(), JSON.stringify([...s])); } catch (e) { /* storage tidak tersedia */ }
  return s.has(id);
}

// ------------------------------------------------------------------ agenda
function card(e) {
  const user = Auth.user();
  const art = el("article", "card" + (e.status === "CANCELLED" ? " muted" : ""));
  const d = new Date(e.startAt);
  const date = el("div", "date");
  date.append(el("b", null, d.getDate()),
              el("small", null, d.toLocaleString("id-ID", { weekday: "short" }) + " " + jam(e.startAt)));
  art.append(date);

  const poster = el("div", "poster");
  if (e.posterUrl) {
    const img = el("img", "thumb");
    img.src = e.posterUrl;
    img.alt = "Poster " + e.title;
    img.loading = "lazy";
    poster.append(img);
  } else {
    poster.append(el("div", "thumb", LABEL[e.category] || e.category));
  }
  art.append(poster);

  const body = el("div", "card-body");
  const tags = el("div", "tags");
  tags.append(el("span", "pill", LABEL[e.category] || e.category));
  if (e.status === "CANCELLED") tags.append(el("span", "badge cancelled", "Dibatalkan"));
  body.append(tags, el("h3", null, e.title));
  body.append(el("p", "meta", e.venue + (e.organizerName ? " · " + e.organizerName : "")));
  if (e.description) body.append(el("p", "desc", e.description));
  art.append(body);

  const foot = el("div", "card-foot");
  foot.append(el("span", "price" + (Number(e.price) === 0 ? " free" : ""), rupiah(e.price)));
  const quota = Number(e.quota);
  const left = quota - Number(e.sold || 0);
  const q = el("div", "quota" + (left > 0 ? "" : " out"), left > 0 ? `${left}/${quota} kursi tersisa` : "Tiket habis");
  const bar = el("div", "bar" + (left / quota <= 0.2 ? " low" : ""));
  const fill = el("i");
  fill.style.width = Math.max(0, Math.min(100, (left / quota) * 100)) + "%";
  bar.append(fill);
  q.append(bar);
  foot.append(q);
  if (role(user) === "peserta" && e.status === "PUBLISHED") {
    const on = savedIds().has(e.eventId);
    const b = el("button", "save" + (on ? " on" : ""), on ? "Tersimpan" : "Simpan");
    b.setAttribute("aria-pressed", String(on));
    b.onclick = () => {
      const now = toggleSaved(e.eventId);
      b.textContent = now ? "Tersimpan" : "Simpan";
      b.classList.toggle("on", now);
      b.setAttribute("aria-pressed", String(now));
      if (!$("view-peserta").hidden) renderPeserta();
    };
    foot.append(b);
  }
  art.append(foot);
  return art;
}

// daftar acara dikelompokkan per bulan, seperti agenda cetak
function agenda(list) {
  const out = [];
  let month = "";
  for (const e of list) {
    const m = new Date(e.startAt).toLocaleString("id-ID", { month: "long", year: "numeric" });
    if (m !== month) { out.push(el("h3", "month", m)); month = m; }
    out.push(card(e));
  }
  return out;
}

const byDate = (a, b) => a.startAt.localeCompare(b.startAt);

function render() {
  const cat = document.querySelector('input[name="cat"]:checked').value;
  const onlyFree = $("only-free").checked;
  const shown = events
    .filter((e) => !cat || e.category === cat)
    .filter((e) => !onlyFree || Number(e.price) === 0)
    .sort(byDate);
  $("list").setAttribute("aria-busy", "false");
  $("count").textContent = events.length ? `${shown.length} acara` : "";
  $("list").replaceChildren(...agenda(shown));
  if (!shown.length) {
    $("list").replaceChildren(el("p", "empty", events.length
      ? "Tidak ada acara yang cocok dengan filter ini."
      : "Belum ada acara yang terbit."));
  }
}

async function load() {
  try {
    events = await api("GET", "/events");
    route();
  } catch (e) {
    $("list").replaceChildren(el("p", "empty", "Katalog tidak bisa dimuat. Muat ulang halaman sebentar lagi."));
    say("message", "Gagal memuat acara: " + e.message, true);
  }
}

function stats(dlId, pairs) {
  $(dlId).replaceChildren(...pairs.map(([k, v]) => {
    const box = el("div");
    box.append(el("dt", null, k), el("dd", null, v));
    return box;
  }));
}

// ------------------------------------------------------------------ dasbor peserta
function renderPeserta() {
  const user = Auth.user();
  $("peserta-hello").textContent = "Halo, " + user.email.split("@")[0];
  const ids = savedIds();
  const saved = events.filter((e) => ids.has(e.eventId)).sort(byDate);
  const next = saved.find((e) => new Date(e.startAt) > new Date());
  const free = events.filter((e) => Number(e.price) === 0).length;
  stats("peserta-stats", [
    ["Tersimpan", String(saved.length)],
    ["Acara terdekat", next ? new Date(next.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "-"],
    ["Acara terbit", String(events.length)],
    ["Gratis", String(free)],
  ]);
  $("saved-list").replaceChildren(...agenda(saved));
  if (!saved.length) {
    const p = el("p", "empty", "Belum ada acara tersimpan. ");
    const a = el("a", null, "Buka katalog");
    a.href = "#katalog";
    p.append(a);
    $("saved-list").replaceChildren(p);
  }
}

// ------------------------------------------------------------------ dasbor penyelenggara
function row(e) {
  const r = el("div", "mine-row");
  const info = el("div", "mine-info");
  info.append(el("span", `badge ${e.status.toLowerCase()}`, LABEL[e.status]), el("strong", null, e.title),
              el("span", "meta", `${tanggal(e.startAt)} · ${rupiah(e.price)} · ${Number(e.sold || 0)}/${e.quota} terjual`));
  const actions = el("div", "card-actions");
  const add = (text, cls, fn) => { const b = el("button", cls, text); b.onclick = () => fn(b); actions.append(b); };
  if (e.status !== "CANCELLED") add("Ubah", "secondary", () => startEdit(e));
  if (e.status === "DRAFT") {
    add("Terbitkan", null, () => setStatus(e, "PUBLISHED", "Acara diterbitkan."));
    add("Hapus", "danger", (b) => confirmThen(b, () => remove(e)));
  }
  if (e.status === "PUBLISHED") add("Batalkan", "danger", (b) => confirmThen(b, () => setStatus(e, "CANCELLED", "Acara dibatalkan.")));
  r.append(info, actions);
  return r;
}

function renderMine() {
  const user = Auth.user();
  $("org-hello").textContent = "Halo, " + user.email.split("@")[0];
  const count = (s) => myEvents.filter((e) => e.status === s).length;
  const live = myEvents.filter((e) => e.status === "PUBLISHED");
  const quota = live.reduce((n, e) => n + Number(e.quota), 0);
  const sold = live.reduce((n, e) => n + Number(e.sold || 0), 0);
  stats("org-stats", [
    ["Terbit", String(count("PUBLISHED"))],
    ["Draf", String(count("DRAFT"))],
    ["Dibatalkan", String(count("CANCELLED"))],
    ["Tiket terjual", `${sold}/${quota}`],
  ]);
  const sorted = [...myEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("my-list").replaceChildren(...sorted.map(row));
  if (!sorted.length) $("my-list").replaceChildren(el("p", "empty", "Kamu belum membuat acara. Klik Buat acara untuk mulai."));
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
  events = await api("GET", "/events").catch(() => events);
  await loadMine();
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
  $("organizer-panel").hidden = true;
}

function openForm() {
  $("organizer-panel").hidden = false;
  $("organizer-panel").scrollIntoView({ behavior: "smooth" });
  $("title").focus({ preventScroll: true });
}

function startEdit(e) {
  resetForm();
  for (const f of FIELDS) $(f).value = e[f] ?? "";
  $("startAt").value = String(e.startAt).slice(0, 16);
  $("eventId").value = e.eventId;
  $("poster-preview").hidden = !e.posterUrl;
  if (e.posterUrl) $("poster-preview").src = e.posterUrl;
  $("form-title").textContent = "Ubah acara";
  $("submit-btn").textContent = "Simpan perubahan";
  openForm();
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

$("new-btn").onclick = () => { resetForm(); openForm(); };
$("cancel-btn").onclick = resetForm;
$("filter-category").onchange = render; // satu listener untuk semua kategori + "Gratis saja"
setAuthMode("login");
route();
initGoogle(); // jika library Google sudah termuat lebih dulu
load();
