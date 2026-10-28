/* =====================================================
   Rouge & Rosa – Autenticação com Supabase Auth
   ===================================================== */

// ---- 1) CONFIGURAÇÃO DO SUPABASE -------------------------------------------
const SUPABASE_URL = "https://shdaqwwuuermgfnkprob.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZGFxd3d1dWVybWdmbmtwcm9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODUyNjEsImV4cCI6MjEwODc2MTI2MX0.qhf4UsD1NA3GXi_Fzl4LP37iGApuim6Q8E1fdN8ab9o";

// (a chave "anon" é pública por design; a segurança real vem das regras RLS no banco.
//  NUNCA coloque a senha do banco nem a chave "service_role" neste arquivo.)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2) ATALHOS DO DOM -----------------------------------------------------
const $ = (id) => document.getElementById(id);

const authView = $("auth-view");
const appView = $("app-view");
const loading = $("loading");
const messageBox = $("message");
const tabsBox = document.querySelector(".tabs");

const forms = {
  "form-login": $("form-login"),
  "form-signup": $("form-signup"),
  "form-forgot": $("form-forgot"),
  "form-reset": $("form-reset"),
};

let recoveryMode = false; // true quando o usuário veio do link "esqueci minha senha"

// ---- 3) UTILITÁRIOS DE INTERFACE -------------------------------------------
function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message " + type;
  messageBox.hidden = false;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
}

function showForm(id) {
  Object.entries(forms).forEach(([key, form]) => (form.hidden = key !== id));
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.target === id;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  // Abas só aparecem em login/cadastro
  tabsBox.hidden = id === "form-forgot" || id === "form-reset";
  clearMessage();
  document.querySelectorAll("input.invalid").forEach((i) => i.classList.remove("invalid"));
}

function setLoading(form, isLoading, label) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (isLoading) btn.dataset.label = btn.textContent;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? label || "Aguarde…" : btn.dataset.label;
}

function invalidate(input, text) {
  input.classList.add("invalid");
  input.focus();
  showMessage(text);
}

function translateError(error) {
  const msg = (error && error.message ? error.message : "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (msg.includes("user already registered")) return "Este e-mail já tem cadastro. Tente entrar.";
  if (msg.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (msg.includes("same password")) return "A nova senha precisa ser diferente da atual.";
  if (msg.includes("network") || msg.includes("failed to fetch")) return "Sem conexão com o servidor. Verifique sua internet.";
  return "Não foi possível concluir. Tente novamente.";
}

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// ---- 4) ÁREA RESTRITA (só montada com sessão ativa) ------------------------
function renderApp(user) {
  const tpl = $("app-template");
  appView.replaceChildren(tpl.content.cloneNode(true));

  const name = (user.user_metadata && user.user_metadata.full_name) || user.email.split("@")[0];
  const since = new Date(user.created_at).toLocaleDateString("pt-BR");

  $("welcome-title").textContent = "Olá, " + name;
  $("user-email").textContent = user.email;
  $("acc-name").textContent = name;
  $("acc-email").textContent = user.email;
  $("acc-since").textContent = since;

  $("btn-logout").addEventListener("click", async () => {
    $("btn-logout").disabled = true;
    await sb.auth.signOut();
  });

  document.title = "Rouge & Rosa | Minha conta";
  authView.hidden = true;
  appView.hidden = false;
}

function renderAuth() {
  appView.replaceChildren(); // remove todo conteúdo restrito do DOM
  appView.hidden = true;
  authView.hidden = false;
  document.title = "Rouge & Rosa | Entrar";
}

// ---- 5) CONTROLE DE SESSÃO -------------------------------------------------
// Chamado no carregamento e sempre que o estado de autenticação muda.
function handleSession(session) {
  loading.classList.add("done");

  if (recoveryMode) {
    renderAuth();
    showForm("form-reset");
    return;
  }

  if (session && session.user) {
    renderApp(session.user);
  } else {
    renderAuth();
    if (Object.values(forms).every((f) => f.hidden)) showForm("form-login");
  }
}

sb.auth.onAuthStateChange((event, session) => {
  // Importante: não use await de chamadas do Supabase dentro deste callback.
  if (event === "PASSWORD_RECOVERY") recoveryMode = true;
  if (event === "SIGNED_OUT") {
    recoveryMode = false;
    showForm("form-login");
  }
  handleSession(session);
});

// ---- 6) EVENTOS: NAVEGAÇÃO ENTRE FORMULÁRIOS -------------------------------
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => showForm(tab.dataset.target))
);
$("go-forgot").addEventListener("click", () => {
  $("forgot-email").value = $("login-email").value;
  showForm("form-forgot");
});
$("back-login").addEventListener("click", () => showForm("form-login"));

document.querySelectorAll(".toggle-pass").forEach((btn) =>
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.for);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Ocultar" : "Mostrar";
    btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  })
);

// ---- 7) EVENTOS: LOGIN -----------------------------------------------------
forms["form-login"].addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  if (!emailOk(email)) return invalidate($("login-email"), "Digite um e-mail válido.");
  if (!password) return invalidate($("login-password"), "Digite sua senha.");

  setLoading(forms["form-login"], true, "Entrando…");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setLoading(forms["form-login"], false);

  if (error) showMessage(translateError(error));
  // Em caso de sucesso, onAuthStateChange abre a área restrita.
});

// ---- 8) EVENTOS: CADASTRO --------------------------------------------------
forms["form-signup"].addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const confirm = $("signup-confirm").value;

  if (name.length < 2) return invalidate($("signup-name"), "Digite seu nome.");
  if (!emailOk(email)) return invalidate($("signup-email"), "Digite um e-mail válido.");
  if (password.length < 6) return invalidate($("signup-password"), "A senha precisa ter pelo menos 6 caracteres.");
  if (password !== confirm) return invalidate($("signup-confirm"), "As senhas não são iguais.");

  setLoading(forms["form-signup"], true, "Criando conta…");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  setLoading(forms["form-signup"], false);

  if (error) return showMessage(translateError(error));

  // Se a confirmação por e-mail estiver ativa no Supabase, não há sessão ainda.
  if (!data.session) {
    forms["form-signup"].reset();
    showForm("form-login");
    showMessage("Conta criada! Enviamos um link de confirmação para " + email + ". Depois de confirmar, é só entrar.", "success");
  }
});

// ---- 9) EVENTOS: ESQUECI A SENHA -------------------------------------------
forms["form-forgot"].addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const email = $("forgot-email").value.trim();
  if (!emailOk(email)) return invalidate($("forgot-email"), "Digite um e-mail válido.");

  setLoading(forms["form-forgot"], true, "Enviando…");
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  setLoading(forms["form-forgot"], false);

  if (error) return showMessage(translateError(error));
  showMessage("Se este e-mail tiver cadastro, você receberá o link em instantes.", "success");
});

// ---- 10) EVENTOS: NOVA SENHA -----------------------------------------------
forms["form-reset"].addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const password = $("reset-password").value;
  if (password.length < 6) return invalidate($("reset-password"), "A senha precisa ter pelo menos 6 caracteres.");

  setLoading(forms["form-reset"], true, "Salvando…");
  const { error } = await sb.auth.updateUser({ password });
  setLoading(forms["form-reset"], false);

  if (error) return showMessage(translateError(error));

  recoveryMode = false;
  forms["form-reset"].reset();
  const { data } = await sb.auth.getSession();
  handleSession(data.session); // entra direto na área restrita
});

// ---- 11) INÍCIO ------------------------------------------------------------
// Garante que a tela correta apareça mesmo se o evento inicial demorar.
sb.auth.getSession().then(({ data }) => handleSession(data.session));
