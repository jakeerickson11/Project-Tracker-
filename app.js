const SUPABASE_URL = "https://yfyddckvjfeqkwoiqcix.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmeWRkY2t2amZlcWt3b2lxY2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzM0MDIsImV4cCI6MjA4MjYwOTQwMn0.K2qiN7vqRfPwN7WCL3j102wxYWzwQ7bp7_LtSGVfEqw";


// Grab the global Supabase client factory from the CDN
const { createClient } = window.supabase || {};
if (!createClient) {
  throw new Error("Supabase library not loaded. Check the <script> tag and its order in index.html.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const els = {
  loginView: document.getElementById("loginView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("emailInput"),
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

let sessionUser = null;
let activeProjectId = null;
let projects = [];
let tasks = []; // tasks for active project only

function showLogin(msg=""){
  els.appView.style.display = "none";
  els.loginView.style.display = "block";
  els.loginMsg.textContent = msg;
}

function showApp(){
  els.loginView.style.display = "none";
  els.appView.style.display = "block";
}

function sortTasks(arr){
  return [...arr].sort((a,b) => (a.position ?? 0) - (b.position ?? 0));
}

function calcProgress(arr){
  const total = arr.length;
  const done = arr.filter(t => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

function pickPositionForInsert(sortedTasks, mode, refId){
  const STEP = 1000;
  if (sortedTasks.length === 0) return STEP;

  if (mode === "top") return (sortedTasks[0].position ?? STEP) - STEP;
  if (mode === "bottom") return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;

  const idx = sortedTasks.findIndex(t => t.id === refId);
  if (idx === -1) return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;

  const current = sortedTasks[idx].position ?? STEP;

  if (mode === "above") {
    const prev = idx > 0 ? (sortedTasks[idx - 1].position ?? (current - STEP)) : (current - STEP);
    return (prev + current) / 2;
  }

  if (mode === "below") {
    const next = idx < sortedTasks.length - 1 ? (sortedTasks[idx + 1].position ?? (current + STEP)) : (current + STEP);
    return (current + next) / 2;
  }

  return (sortedTasks[sortedTasks.length - 1].position ?? STEP) + STEP;
}

async function fetchProjects(){
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  projects = data || [];
}

async function fetchTasks(projectId){
  const { data, error } = await supabase
    .from("tasks")
    .select("id, text, done, position, created_at, updated_at")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  tasks = data || [];
}

function renderProjectPicker(){
  els.projectSelect.innerHTML = "";
  for (const p of projects){
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "Untitled";
    if (p.id === activeProjectId) opt.selected = true;
    els.projectSelect.appendChild(opt);
  }
}

function render(){
  const sorted = sortTasks(tasks);

  renderProjectPicker();

  const { total, done, pct } = calcProgress(sorted);
  els.progressText.textContent = `${done} / ${total} complete`;
  els.progressPct.textContent = `${pct}%`;
  els.barFill.style.width = `${pct}%`;

  els.empty.style.display = sorted.length ? "none" : "block";
  els.list.innerHTML = "";

  for (const t of sorted){
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
      const { error } = await supabase
        .from("tasks")
        .update({ done: cb.checked })
        .eq("id", t.id);
      if (!error) {
        t.done = cb.checked;
        render();
      } else {
        alert("Could not update task.");
      }
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
      if (!error) {
        tasks = tasks.filter(x => x.id !== t.id);
        render();
      } else {
        alert("Could not delete task.");
      }
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

async function ensureDefaultProject(){
  if (projects.length) return;
  const { error } = await sb.from("projects").insert([{
    owner_id: sessionUser.id,
    name: "My Project"
  }]);
  if (error) throw error;
  await fetchProjects();
}

async function setActiveProject(projectId){
  activeProjectId = projectId;
  await fetchTasks(activeProjectId);
  render();
}

async function addProject(){
  const name = prompt("New project name:");
  if (name === null) return;
  const trimmed = name.trim() || "Untitled";

  const { error } = await sb.from("projects").insert([{
    owner_id: sessionUser.id,
    name: trimmed
  }]);
  if (error) return alert("Could not create project.");

  await fetchProjects();
  await setActiveProject(projects[projects.length - 1].id);
}

async function addTask(text, mode="bottom", refId=null){
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const sorted = sortTasks(tasks);
  const position = pickPositionForInsert(sorted, mode, refId);

  const { data, error } = await supabase
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

function quickInsert(mode, refId){
  const txt = prompt("Task:");
  if (txt === null) return;
  addTask(txt, mode, refId);
}

async function resetProject(){
  const project = projects.find(p => p.id === activeProjectId);
  const ok = confirm(`Reset and delete all tasks in "${project?.name || "this project"}"?`);
  if (!ok) return;

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("project_id", activeProjectId);

  if (error) return alert("Could not reset project.");

  tasks = [];
  render();
}

// Auth: login via magic link
els.loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (els.emailInput.value || "").trim();
  if (!email) return;

  els.loginMsg.textContent = "Sending link… check your email.";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("#")[0] }

  });

  els.loginMsg.textContent = error
    ? "Could not send link. Check your Supabase Auth URL settings."
    : "Link sent! Open your email and tap the sign-in link.";
});

// App events
els.form?.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(els.input.value, "bottom");
  els.input.value = "";
  els.input.focus();
});

els.projectSelect?.addEventListener("change", async () => {
  await setActiveProject(els.projectSelect.value);
});

els.newProjectBtn?.addEventListener("click", addProject);
els.resetBtn?.addEventListener("click", resetProject);

els.signOutBtn?.addEventListener("click", async () => {
  await sb.auth.signOut();
  sessionUser = null;
  showLogin("Signed out.");
});

// Startup
async function start(){
  await handleAuthCallback();

  const { data: { session } } = await sb.auth.getSession();
  sessionUser = session?.user || null;

  sb.auth.onAuthStateChange(async (_event, newSession) => {
    sessionUser = newSession?.user || null;

    // Clean hash tokens after login (nice + avoids weird loops)
    if (window.location.hash && window.location.hash.includes("access_token=")) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }

    if (sessionUser) await loadAndShowApp();
    else showLogin();
  });

  if (!sessionUser) return showLogin();
  await loadAndShowApp();
}

async function handleAuthCallback() {
  // If the magic link brought us back with auth params in the URL,
  // exchange them for a session (so you don't get stuck on login screen).
  const url = new URL(window.location.href);

  const hasCode = url.searchParams.get("code");
  const hasTokenHash = window.location.hash && window.location.hash.includes("access_token=");

  try {
    if (hasCode) {
      // PKCE flow
      await sb.auth.exchangeCodeForSession(window.location.href);
      // Clean URL
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } else if (hasTokenHash) {
      // Implicit flow (older links)
      // Supabase JS usually auto-detects this, but we’ll clean the hash after session is set.
      // We'll just let getSession() pick it up, then clean later.
    }
  } catch (e) {
    // If exchange fails, you’ll land on login again.
    console.warn("Auth callback handling failed:", e);
  }
}




  
  const { data: { session } } = await sb.auth.getSession();
  sessionUser = session?.user || null;

  // react to auth changes (magic link completes here)
  sb.auth.onAuthStateChange(async (_event, newSession) => {
    sessionUser = newSession?.user || null;
    if (sessionUser) await loadAndShowApp();
    else showLogin();
  });

  if (!sessionUser) return showLogin();
  await loadAndShowApp();
}

async function loadAndShowApp(){
  showApp();
  await fetchProjects();
  await ensureDefaultProject();
  // pick first project by default
  activeProjectId = projects[0].id;
  await setActiveProject(activeProjectId);
}

start();
