const STORAGE_KEY = "simple_project_tracker_v1";

const els = {
  list: document.getElementById("taskList"),
  empty: document.getElementById("emptyState"),
  input: document.getElementById("taskInput"),
  form: document.getElementById("addForm"),
  barFill: document.getElementById("barFill"),
  progressText: document.getElementById("progressText"),
  progressPct: document.getElementById("progressPct"),
  resetBtn: document.getElementById("resetBtn"),
};

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tasks: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return { tasks: [] };
    return parsed;
  }catch{
    return { tasks: [] };
  }
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  // mode: "top" | "bottom" | "above" | "below"
  const STEP = 1000;

  if (sortedTasks.length === 0) return STEP;

  if (mode === "top") {
    const first = sortedTasks[0].position ?? STEP;
    return first - STEP;
  }
  if (mode === "bottom") {
    const last = sortedTasks[sortedTasks.length - 1].position ?? STEP;
    return last + STEP;
  }

  const idx = sortedTasks.findIndex(t => t.id === refId);
  if (idx === -1) {
    // fallback: bottom
    const last = sortedTasks[sortedTasks.length - 1].position ?? STEP;
    return last + STEP;
  }

  if (mode === "above") {
    const current = sortedTasks[idx].position ?? STEP;
    const prev = idx > 0 ? (sortedTasks[idx - 1].position ?? (current - STEP)) : (current - STEP);
    return (prev + current) / 2;
  }

  if (mode === "below") {
    const current = sortedTasks[idx].position ?? STEP;
    const next = idx < sortedTasks.length - 1 ? (sortedTasks[idx + 1].position ?? (current + STEP)) : (current + STEP);
    return (current + next) / 2;
  }

  // default bottom
  const last = sortedTasks[sortedTasks.length - 1].position ?? STEP;
  return last + STEP;
}

function render(){
  const state = loadState();
  const tasks = sortTasks(state.tasks);

  // progress UI
  const { total, done, pct } = calcProgress(tasks);
  els.progressText.textContent = `${done} / ${total} complete`;
  els.progressPct.textContent = `${pct}%`;
  els.barFill.style.width = `${pct}%`;

  // empty state
  els.empty.style.display = tasks.length ? "none" : "block";
  els.list.innerHTML = "";

  // list UI
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
      const task = s.tasks.find(x => x.id === t.id);
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
      s.tasks = s.tasks.filter(x => x.id !== t.id);
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
  const sorted = sortTasks(state.tasks);
  const position = pickPositionForInsert(sorted, mode, refId);

  state.tasks.push({
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
  // Use a tiny inline prompt to keep UI minimal
  const txt = prompt("Task:");
  if (txt === null) return;
  addTask(txt, mode, refId);
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(els.input.value, "bottom");
  els.input.value = "";
  els.input.focus();
});

els.resetBtn.addEventListener("click", () => {
  const ok = confirm("Reset and delete all tasks?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

render();
