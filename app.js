const STORAGE_KEY = "simple_project_tracker_v2";

const els = {
  list: document.getElementById("taskList"),
  empty: document.getElementById("emptyState"),
  input: document.getElementById("taskInput"),
  form: document.getElementById("addForm"),
  barFill: document.getElementById("barFill"),
  progressText: document.getElementById("progressText"),
  progressPct: document.getElementById("progressPct"),
  resetBtn: document.getElementById("resetBtn"),
  projectSelect: document.getElementById("projectSelect"),
  newProjectBtn: document.getElementById("newProjectBtn"),
};

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return bootstrapState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return bootstrapState();
    if (!parsed.activeProjectId) parsed.activeProjectId = parsed.projects[0]?.id || null;
    return parsed;
  }catch{
    return bootstrapState();
  }
}

function bootstrapState(){
  const p = { id: uid(), name: "My Project", tasks: [] };
  return { projects: [p], activeProjectId: p.id };
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getActiveProject(state){
  return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];
}

function sortTasks(tasks){
  return [...tasks].sort((a,b) => (a.position ?? 0) - (b.position ?? 0));
}

function calcProgress(tasks){
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
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

function renderProjectPicker(state){
  const active = getActiveProject(state);

  els.projectSelect.innerHTML = "";
  for (const p of state.projects){
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "Untitled";
    if (p.id === active.id) opt.selected = true;
    els.projectSelect.appendChild(opt);
  }
}

function render(){
  const state = loadState();
  const project = getActiveProject(state);
  const tasks = sortTasks(project.tasks || []);

  renderProjectPicker(state);

  const { total, done, pct } = calcProgress(tasks);
  els.progressText.textContent = `${done} / ${total} complete`;
  els.progressPct.textContent = `${pct}%`;
  els.barFill.style.width = `${pct}%`;

  els.empty.style.display = tasks.length ? "none" : "block";
  els.list.innerHTML = "";

  for (const t of tasks){
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
    cb.addEventListener("change", () => {
      const s = loadState();
      const pr = getActiveProject(s);
      const task = pr.tasks.find(x => x.id === t.id);
      if (!task) return;
      task.done = cb.checked;
      saveState(s);
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
    delBtn.addEventListener("click", () => {
      const s = loadState();
      const pr = getActiveProject(s);
      pr.tasks = pr.tasks.filter(x => x.id !== t.id);
      saveState(s);
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

function addTask(text, mode="bottom", refId=null){
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const state = loadState();
  const project = getActiveProject(state);
  project.tasks = project.tasks || [];

  const sorted = sortTasks(project.tasks);
  const position = pickPositionForInsert(sorted, mode, refId);

  project.tasks.push({
    id: uid(),
    text: trimmed,
    done: false,
    position,
    createdAt: new Date().toISOString(),
  });

  saveState(state);
  render();
}

function quickInsert(mode, refId){
  const txt = prompt("Task:");
  if (txt === null) return;
  addTask(txt, mode, refId);
}

// Events
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(els.input.value, "bottom");
  els.input.value = "";
  els.input.focus();
});

els.projectSelect.addEventListener("change", () => {
  const state = loadState();
  state.activeProjectId = els.projectSelect.value;
  saveState(state);
  render();
});

els.newProjectBtn.addEventListener("click", () => {
  const name = prompt("New project name:");
  if (name === null) return;

  const trimmed = name.trim() || "Untitled";
  const state = loadState();
  const p = { id: uid(), name: trimmed, tasks: [] };
  state.projects.push(p);
  state.activeProjectId = p.id;
  saveState(state);
  render();
});

els.resetBtn.addEventListener("click", () => {
  const state = loadState();
  const project = getActiveProject(state);
  const ok = confirm(`Reset and delete all tasks in "${project.name}"?`);
  if (!ok) return;
  project.tasks = [];
  saveState(state);
  render();
});

render();
