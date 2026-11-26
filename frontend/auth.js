// Daftar dan masuk lewat auth-service (Lambda Function URL).
const Auth = (() => {
  const url = window.APP_CONFIG.authUrl;
  const KEY = "eventory-session";

  async function call(path, email, password) {
    const res = await fetch(url + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Terjadi kesalahan.");
    return data;
  }

  function save(session) {
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* storage tidak tersedia */ }
    current = session;
  }

  let current = null;
  try { current = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { current = null; }

  return {
    signUp: (email, password) => call("/auth/register", email, password),
    async signIn(email, password) {
      save(await call("/auth/login", email, password)); // { token, sub, email, isOrganizer, exp }
    },
    signOut() {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
      current = null;
    },
    // null jika belum login atau token sudah kedaluwarsa
    user() {
      if (current && current.token && current.exp * 1000 > Date.now() + 30000) return current;
      return null;
    },
  };
})();
