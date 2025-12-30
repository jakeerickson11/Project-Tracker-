// =====================
// Supabase config
// =====================
const SUPABASE_URL = "https://yfyddckvjfeqkwoiqcix.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmeWRkY2t2amZlcWt3b2lxY2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzM0MDIsImV4cCI6MjA4MjYwOTQwMn0.K2qiN7vqRfPwN7WCL3j102wxYWzwQ7bp7_LtSGVfEqw";

const { createClient } = window.supabase || {};
if (!createClient) {
  throw new Error("Supabase library not loaded. Check your <script> order in index.html.");
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
let tasks = [];
let subtasks = [];

// =====================
// UI helpers
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

function sortByPosition(arr) {
  return [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function calcProgress(arr) {
  const total = arr.length;
  const done = arr.filter((x) => x.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

function pickPositionForInsert(sortedItems, mode, refId) {
  const STEP = 1000;
  if (sortedItems.length === 0) return STEP;

  if (mode === "top") return (sortedItems[0].position ?? STEP) - STEP;
  if (mode === "bottom") return (sortedItems[sortedItems.length - 1].position ?? STEP) + STEP;

  const idx = sortedItems.findIndex((x) => x.id === refId);
  if (idx === -1) return (sortedItems[sortedItems.length - 1].position ?? STEP) + STEP;

  const current = sortedItems[idx].position ?? STEP;

  if (mode === "above") {
    const prev = idx > 0 ? (sortedItems[idx - 1].position ?? (current - STEP)) : (current - STEP);
    return (prev + current) / 2;
  }

  if (mode === "below") {
    const next =
      idx < sortedItems.length - 1 ? (sortedItems[idx + 1].position ?? (current + STEP)) : (current + STEP);
    return (current + next) / 2;
  }

  return (sortedItems[sortedItems.length - 1].position ?? STEP) + STEP;
}

function groupSubtasksByTaskId(all) {
  const map = new Map();
  for (const st of all) {
    if (!map.has(st.task_id)) map.set(st.task_id, []);
    map.get(st.task_id).push(st);
  }
  for (const [k, v] of map.entries()) {
    map.set(k, sortByPosition(v));
  }
  return map;
}

// =====================
// Auth (username+password)
// =====================
function usernameToEmail(username) {
  const clean = (username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  return `${clean}@project-tracker.local`;
}

async function signInOrSignUp(username, password) {
  const email = usernameToEmail(username);

  let { error } = await sb.auth.signInWithPassword({ email, password });

  if (error && /invalid login credentials/i.test(error.message)) {
    const signup = await sb.auth.signUp({ email, password });
    if (signup.error) throw signup.error;

    const signin2 = await sb.auth.signInWithPassword({ email, password });
    if (signin2.error) throw signin2.error;

    return;
  }

  if (error) throw error;
}

// =====================
// Data fetch
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

async function fetchSubtasks(projectId) {
  const { data, error } = await sb
    .from("subtasks")
    .select("id, task_id, text, done, position, created_at, updated_at")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  subtasks = data || [];
}

async function ensureDefaultProject() {
  if (projects.length) return;

  const { error } = await sb.from("projects").insert([
    { owner_id: sessionUser.id, name: "My Project" }
  ]);

  if (error) throw error;
  await fetchProjects();
}

async function setActiveProject(projectId) {
  activeProjectId = projectId;
  await fetchTasks(activeProjectId);
  await fetchSubtasks(activeProjectId);
  render();
}

// =====================
// Actions (projects/tasks/subtasks)
// =====================
async function addProject() {
  const name = prompt("New project name:");
  if (name === null) return;
  const trimmed = name.trim() || "Untitled";

  const { error } = await sb.from("projects").insert([
    { owner_id: sessionUser.id, name: trimmed }
  ]);

  if (error) return alert("Could not create project.");
  await fetchProjects();
  await setActiveProject(projects[projects.length - 1].id);
}

async function addTask(text, mode = "bottom", refId = null) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const sorted = sortByPosition(tasks);
  const position = pickPositionForInsert(sorted, mode, refId);

  const { data, error } = await sb
    .from("tasks")
    .insert([{
      owner_id: sessionUser.id,
      project_id: activeProjectId,
      text: trimmed,
      done: false,
      position
    }])
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

  const delTasks = await sb.from("tasks").delete().eq("project_id", activeProjectId);
  if (delTasks.error) return alert("Could not reset project.");

  // cascades remove subtasks server-side; clear local
  tasks = [];
  subtasks = [];
  render();
}

async function addSubtask(taskId) {
  const txt = prompt("Subtask:");
  if (txt === null) return;
  const trimmed = txt.trim();
  if (!trimmed) return;

  const current = subtasks.filter((s) => s.task_id === taskId);
  const sorted = sortByPosition(current);
  const position = sorted.length ? (sorted[sorted.length - 1].position + 1000) : 1000;

  const { data, error } = await sb
    .from("subtasks")
    .insert([{
      owner_id: sessionUser.id,
      project_id: activeProjectId,
      task_id: taskId,
      text: trimmed,
      done: false,
      position
    }])
    .select("id, task_id, text, done, position, created_at, updated_at")
    .single();

  if (error) return alert("Could not add subtask.");

  subtasks.push(data);
  render();
}

async function toggleSubtask(id, done) {
  const { error } = await sb.from("subtasks").update({ done }).eq("id", id);
  if (error) return alert("Could not update subtask.");
  const st = subtasks.find((s) => s.id === id);
  if (st) st.done = done;
  render();
}

async function deleteSubtask(id) {
  const { error } = await sb.from("subtasks").delete().eq("id", id);
  if (error) return alert("Could not delete subtask.");
  subtasks = subtasks.filter((s) => s.id !== id);
  render();
}

// =====================
// Render
// =====================
function renderProjectPicker() {
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
  const sortedTasks = sortByPosition(tasks);
  const stByTask = groupSubtasksByTaskId(subtasks);

  renderProjectPicker();

  const allItems = [...sortedTasks, ...subtasks];
  const { total, done, pct } = calcProgress(allItems);

  els.progressText.textContent = `${done} / ${total} complete`;
  els.progressPct.textContent = `${pct}%`;
  els.barFill.style.width = `${pct}%`;

  els.empty.style.display = sortedTasks.length ? "none" : "block";
  els.list.innerHTML = "";

  for (const t of sortedTasks) {
    const li = document.createElement("li");
    li.className = "task";

    // Task Row
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
      subtasks = subtasks.filter((s) => s.task_id !== t.id);
      render();
    });

    controls.appendChild(aboveBtn);
    controls.appendChild(belowBtn);
    controls.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(controls);
    li.appendChild(row);

    // Subtasks
    const stList = stByTask.get(t.id) || [];

    const subWrap = document.createElement("div");
    subWrap.style.display = "flex";
    subWrap.style.flexDirection = "column";
    subWrap.style.gap = "8px";

    const subHeader = document.createElement("div");
    subHeader.style.display = "flex";
    subHeader.style.justifyContent = "space-between";
    subHeader.style.alignItems = "center";
    subHeader.style.gap = "10px";

    const subLabel = document.createElement("div");
    subLabel.className = "muted";
    subLabel.style.fontSize = "12px";
    subLabel.textContent = stList.length
      ? `Subtasks (${stList.filter((x) => x.done).length}/${stList.length})`
      : "Subtasks";

    const addSubBtn = document.createElement("button");
    addSubBtn.className = "small";
    addSubBtn.type = "button";
    addSubBtn.textContent = "+ subtask";
    addSubBtn.addEventListener("click", () => addSubtask(t.id));

    subHeader.appendChild(subLabel);
    subHeader.appendChild(addSubBtn);
    subWrap.appendChild(subHeader);

    for (const st of stList) {
      const subRow = document.createElement("div");
      subRow.style.display = "flex";
      subRow.style.alignItems = "center";
      subRow.style.justifyContent = "space-between";
      subRow.style.gap = "10px";
      subRow.style.paddingLeft = "34px";

      const left2 = document.createElement("div");
      left2.style.display = "flex";
      left2.style.alignItems = "flex-start";
      left2.style.gap = "10px";
      left2.style.minWidth = "0";

      const cb2 = document.createElement("input");
      cb2.type = "checkbox";
      cb2.className = "check";
      cb2.checked = !!st.done;
      cb2.addEventListener("change", () => toggleSubtask(st.id, cb2.checked));

      const tx2 = document.createElement("div");
      tx2.className = "text" + (st.done ? " done" : "");
      tx2.textContent = st.text;

      left2.appendChild(cb2);
      left2.appendChild(tx2);

      const del2 = document.createElement("button");
      del2.className = "small danger";
      del2.type = "button";
      del2.textContent = "Delete";
      del2.addEventListener("click", () => deleteSubtask(st.id));

      subRow.appendChild(left2);
      subRow.appendChild(del2);
      subWrap.appendChild(subRow);
    }

    li.appendChild(subWrap);
    els.list.appendChild(li);
  }
}

// =====================
// Events
// =====================
if (els.loginForm) {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = (els.userInput?.value || "").trim();
    const password = els.passInput?.value || "";

    if (!username || !password) {
      els.loginMsg.textContent = "Enter username + password.";
      return;
    }

    els.loginMsg.textContent = "Signing in…";
    try {
      await signInOrSignUp(username, password);
      els.loginMsg.textContent = "Signed in.";
      // auth listener loads app
    } catch (err) {
      els.loginMsg.textContent = err?.message || "Login failed.";
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

