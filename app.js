// =====================
// Supabase config
// =====================
const SUPABASE_URL = "https://yfyddckvjfeqkwoiqcix.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmeWRkY2t2amZlcWt3b2lxY2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzM0MDIsImV4cCI6MjA4MjYwOTQwMn0.K2qiN7vqRfPwN7WCL3j102wxYWzwQ7bp7_LtSGVfEqw";

// Grab the global Supabase client factory from the CDN
const { createClient } = window.supabase || {};
if (!createClient) {
  throw new Error("Supabase library not loaded. Check the <script> tag and its order in index.html.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================
// DOM
// =====================
const els = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  userInput: document.getElementById("userInput"),
  passInput: document.getElementById("passInput"),
  loginMsg: document.getElementById("loginMsg"),

  signOutBtn: document.getElementById("signOutBtn"),
  resetBtn: document.getElementById("resetBtn"),
  projectSelect: document.getElementById("projectSelect"),
  newProjectBtn: document.getElementById("newProjectBtn"),

  list: document.getElementById("taskList"),
  empty: document.getElementById("emptyState"),
  input: document.getElementById("taskInput"),
  form: document.getElementById("addForm"),
  barFill: document.getElementById("barFill"),
  progressText: document.getElementById("progressText"),
  progressPct: document.getElementById("progressPct"),
};

// =====================
// State
// =====================
let sessionUser = null;
let activeProjectId = null;
let projects = [];
let tasks = []; // tasks for active project only

// =====================
// Helpers
// =====================
function showLogin(msg = "") {
  if (els.appView) els.appView.style.display = "none";
  if (els.loginView) els.loginView.style.display = "block";
  if (els.loginMsg) els.loginMsg.textContent = msg;
}

function showApp() {
  if (els.loginView) els.loginView.style.display = "none";
  if (els.appView) els.appView.style.display = "block";
}

function sortTasks(arr) {
  return [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function calcProgress(arr) {
  const total = arr.length;
  const done = arr.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

// Insert ordering by position gaps
function pickPositionForInsert(sortedTasks, mode, refId) {
  const STEP = 1000;
  if (sortedTasks.length === 0) return STEP;

  if (mode === "top") return (sortedTasks[0].position ?? STEP) - STEP;
  if (mode === "bottom") return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;

  const idx = sortedTasks.findIndex((t) => t.id === refId);
  if (idx === -1) return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;

  const current = sortedTasks[idx].position ?? STEP;

  if (mode === "above") {
    const prev = idx > 0 ? (sortedTasks[idx - 1].position ?? (current - STEP)) : (current - STEP);
    return (prev + current) / 2;
  }

  if (mode === "below") {
    const next =
      idx < sortedTasks.length - 1 ? (sortedTasks[idx + 1].position ?? (current + STEP)) : (current + STEP);
    return (current + next) / 2;
  }

  return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;
}

function usernameToEmail(username) {
  // Convert username to a "fake" email so we never collect real emails.
  const clean = (username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  return `${clean}@project-tracker.local`;
}

// =====================
// Supabase data
// =====================
async function fetchProjects() {
  const { data, error } = await sb
    .from("projects")
    .select("id, name, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  projects = data || [];
}

async function fetchTasks(projectId) {
  const { data, error } = await sb
    .from("tasks")
    .select("id, text, done, position, created_at, updated_at")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  tasks = data || [];
}

async function ensureDefaultProject() {
  if (projects.length) return;

  const { error } = await sb.from("projects").insert([
    {
      owner_id: sessionUser.id,
      name: "My Project",
    },
  ]);

  if (error) throw error;

  await fetchProjects();
}

async function setActiveProject(projectId) {
  activeProjectId = projectId;
  await fetchTasks(activeProjectId);
  render();
}

// =====================
// UI render
// =====================
function renderProjectPicker() {
  if (!els.projectSelect) return;

  els.projectSelect.innerHTML = "";
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "Untitled";
    if (p.id === activeProjectId) opt.selected = true;
    els.projectSelect.appendChild(opt);
  }
}

function render() {
  const sorted = sortTasks(tasks);

  renderProjectPicker();

  const { total, done, pct } = calcProgress(sorted);
  if (els.progressText) els.progressText.textContent = `${done} / ${total} complete`;
  if (els.progressPct) els.progressPct.textContent = `${pct}%`;
  if (els.barFill) els.barFill.style.width = `${pct}%`;

  if (els.empty) els.empty.style.display = sorted.length ? "none" : "block";
  if (!els.list) return;

  els.list.innerHTML = "";

  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "task";

    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "check";
    cb.checked = !!t.done;

    cb.addEventListener("change", async () => {
      const { error } = await sb.from("tasks").update({ done: cb.checked }).eq("id", t.id);
      if (error) return alert("Could not update task.");
      t.done = cb.checked;
      render();
    });

    const text = document.createElement("div");
    text.className = "text" + (t.done ? " done" : "");
    text.textContent = t.text;

    left.appendChild(cb);
    left.appendChild(text);

    const controls = document.createElement("div");
    controls.className = "controls";

    const aboveBtn = document.createElement("button");
    aboveBtn.className = "small";
    aboveBtn.type = "button";
    aboveBtn.textContent = "+ above";
    aboveBtn.addEventListener("click", () => quickInsert("above", t.id));

    const belowBtn = document.createElement("button");
    belowBtn.className = "small";
    belowBtn.type = "button";
    belowBtn.textContent = "+ below";
    belowBtn.addEventListener("click", () => quickInsert("below", t.id));

    const delBtn = document.createElement("button");
    delBtn.className = "small danger";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const { error } = await sb.from("tasks").delete().eq("id", t.id);
      if (error) return alert("Could not delete task.");
      tasks = tasks.filter((x) => x.id !== t.id);
      render();
    });

    controls.appendChild(aboveBtn);
    controls.appendChild(belowBtn);
    controls.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(controls);
    li.appendChild(row);

    els.list.appendChild(li);
  }
}

// =====================
// Actions
// =====================
async function addProject() {
  const name = prompt("New project name:");
  if (name === null) return;
  const trimmed = name.trim() || "Untitled";

  const { error } = await sb.from("projects").insert([
    {
      owner_id: sessionUser.id,
      name: trimmed,
    },
  ]);

  if (error) return alert("Could not create project.");

  await fetchProjects();
  await setActiveProject(projects[projects.length - 1].id);
}

async function addTask(text, mode = "bottom", refId = null) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const sorted = sortTasks(tasks);
  const position = pickPositionForInsert(sorted, mode, refId);

  const { data, error } = await sb
    .from("tasks")
    .insert([
      {
        owner_id: sessionUser.id,
        project_id: activeProjectId,
        text: trimmed,
        done: false,
        position,
      },
    ])
    .select("id, text, done, position, created_at, updated_at")
    .single();

  if (error) return alert("Could not add task.");

  tasks.push(data);
  render();
}

function quickInsert(mode, refId) {
  const txt = prompt("Task:");
  if (txt === null) return;
  addTask(txt, mode, refId);
}

async function resetProject() {
  const project = projects.find((p) => p.id === activeProjectId);
  const ok = confirm(`Reset and delete all tasks in "${project?.name || "this project"}"?`);
  if (!ok) return;

  const { error } = await sb.from("tasks").delete().eq("project_id", activeProjectId);
  if (error) return alert("Could not reset project.");

  tasks = [];
  render();
}

// =====================
// Login (username + password)
// =====================
async function signInOrSignUp(username, password) {
  const email = usernameToEmail(username);

  // Try sign in
  let { data, error } = await sb.auth.signInWithPassword({ email, password });

  // If no account yet, create it and sign in
  if (error && /invalid login credentials/i.test(error.message)) {
    const signup = await sb.auth.signUp({ email, password });
    if (signup.error) throw signup.error;

    const signin2 = await sb.auth.signInWithPassword({ email, password });
    if (signin2.error) throw signin2.error;
    data = signin2.data;
  } else if (error) {
    throw error;
  }

  return data;
}

// =====================
// Wire up events
// =====================
if (els.loginForm) {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = (els.userInput?.value || "").trim();
    const password = els.passInput?.value || "";

    if (!username || !password) {
      if (els.loginMsg) els.loginMsg.textContent = "Enter username + password.";
      return;
    }

    if (els.loginMsg) els.loginMsg.textContent = "Signing in…";

    try {
      await signInOrSignUp(username, password);
      if (els.loginMsg) els.loginMsg.textContent = "Signed in.";
      // onAuthStateChange will load the app
    } catch (err) {
      if (els.loginMsg) els.loginMsg.textContent = err?.message || "Login failed.";
    }
  });
}

if (els.form) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(els.input.value, "bottom");
    els.input.value = "";
    els.input.focus();
  });
}

if (els.projectSelect) {
  els.projectSelect.addEventListener("change", async () => {
    await setActiveProject(els.projectSelect.value);
  });
}

if (els.newProjectBtn) els.newProjectBtn.addEventListener("click", addProject);
if (els.resetBtn) els.resetBtn.addEventListener("click", resetProject);

if (els.signOutBtn) {
  els.signOutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
    sessionUser = null;
    showLogin("Signed out.");
  });
}

// =====================
// Startup
// =====================
async function loadAndShowApp() {
  showApp();
  await fetchProjects();
  await ensureDefaultProject();
  activeProjectId = projects[0].id;
  await setActiveProject(activeProjectId);
}

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  sessionUser = session?.user || null;

  sb.auth.onAuthStateChange(async (_event, newSession) => {
    sessionUser = newSession?.user || null;
    if (sessionUser) await loadAndShowApp();
    else showLogin();
  });

  if (!sessionUser) return showLogin();
  await loadAndShowApp();
}

start();

