/* game.js — game workspace: scenes, story map, play test */
const GID = new URLSearchParams(location.search).get("id");
if (!GID) location.href = "index.html";

let game = null;
let scenes = [];

/* ---------- load ---------- */
async function loadGame() {
  try {
    game = await withWake(call("/v1/games/" + GID));
    scenes = game.scenes || [];
    document.title = game.title + " — Game Prototype Builder";
    document.getElementById("g-title").textContent = game.title;
    const chip = document.getElementById("g-genre");
    chip.style.display = game.genre ? "inline-block" : "none";
    chip.textContent = game.genre || "";
    const desc = document.getElementById("g-desc");
    desc.style.display = game.description ? "block" : "none";
    desc.textContent = game.description || "";
    renderScenes();
    renderMap();
    renderPlay();
  } catch (err) { showErr(err); }
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab-btn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    ["scenes", "map", "play"].forEach((t) => {
      document.getElementById("tab-" + t).style.display = t === b.dataset.tab ? "block" : "none";
    });
  });
});

/* ---------- game edit / delete ---------- */
document.getElementById("btn-edit").addEventListener("click", async () => {
  const t = prompt("Game title:", game.title);
  if (t === null) return;
  const g = prompt("Genre:", game.genre || "");
  if (g === null) return;
  const d = prompt("Description:", game.description || "");
  if (d === null) return;
  try {
    await call("/v1/games/" + GID, {
      method: "PATCH",
      body: JSON.stringify({ title: t.trim() || game.title, genre: g.trim(), description: d.trim() }),
    });
    setStatus("Game updated ✓", "ok");
    loadGame();
  } catch (err) { showErr(err); }
});

document.getElementById("btn-delete").addEventListener("click", async () => {
  if (!confirm("Delete this game and all its scenes?")) return;
  try {
    await call("/v1/games/" + GID, { method: "DELETE" });
    location.href = "index.html";
  } catch (err) { showErr(err); }
});

/* ---------- choices builder ---------- */
const choicesEl = document.getElementById("choices");
function addChoiceRow(label = "", target = "", outcome = "") {
  if (choicesEl.querySelectorAll(".choice-row").length >= 6) return;
  const row = document.createElement("div");
  row.className = "choice-row";
  row.innerHTML = `
    <input type="text" class="c-label" placeholder="Choice label (what the player picks)" maxlength="120" value="${escapeHtml(label)}">
    <select class="c-target"><option value="">— path not written yet —</option></select>
    <input type="text" class="c-outcome" placeholder="Outcome note (optional)" maxlength="300" value="${escapeHtml(outcome)}">
    <button type="button" class="x" title="Remove choice">×</button>`;
  row.querySelector(".x").onclick = () => row.remove();
  choicesEl.appendChild(row);
  refreshTargets();
}
function refreshTargets() {
  const other = scenes.filter((s) => s.id !== editingSceneId);
  choicesEl.querySelectorAll(".c-target").forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— path not written yet —</option>' +
      other.map((s) => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join("");
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  });
}
document.getElementById("btn-add-choice").addEventListener("click", () => addChoiceRow());
function readChoices() {
  return [...choicesEl.querySelectorAll(".choice-row")].map((row) => ({
    label: row.querySelector(".c-label").value.trim(),
    target: row.querySelector(".c-target").value || null,
    outcome: row.querySelector(".c-outcome").value.trim(),
  })).filter((c) => c.label);
}

/* ---------- add scene ---------- */
document.getElementById("f-scene").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("s-title").value.trim();
  const narrative = document.getElementById("s-narr").value.trim();
  if (!title || !narrative) return;
  const btn = document.getElementById("btn-scene");
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    const d = await call(`/v1/games/${GID}/scenes`, {
      method: "POST",
      body: JSON.stringify({ title, narrative, choices: readChoices() }),
    });
    if (editingSceneId) { setStatus("Scene updated ✓", "ok"); cancelEdit(); }
    else setStatus(d.note === "this is the start scene" ? "Scene added ✓ — this is your start scene" : "Scene added ✓", "ok");
    document.getElementById("f-scene").reset();
    choicesEl.innerHTML = "";
    await loadGame();
  } catch (err) { showErr(err); }
  btn.disabled = false; btn.textContent = editingSceneId ? "Save Scene" : "Add Scene";
});

/* ---------- scene list ---------- */
let editingSceneId = null;

function sceneCard(s) {
  const isStart = game && game.start_scene === s.id;
  const div = document.createElement("div");
  div.className = "scene" + (isStart ? " start" : "");
  const chips = (s.choices || []).map((c) => {
    const t = scenes.find((x) => x.id === c.target);
    const bad = !t;
    return `<span class="chip${bad ? " bad" : ""}">${escapeHtml(c.label)}<span class="arrow">→</span>${bad ? "unwritten path" : escapeHtml(t.title)}</span>`;
  }).join("");
  div.innerHTML = `
    <div class="scene-head">
      <span class="scene-title">${escapeHtml(s.title)}</span>
      ${isStart ? '<span class="badge-start">START</span>' : ""}
    </div>
    <div class="scene-narr">${escapeHtml(s.narrative)}</div>
    ${s.image_url ? `<img class="scene-art" src="${escapeHtml(s.image_url)}" alt="Scene art">` : ""}
    ${chips ? `<div class="chips">${chips}</div>` : ""}
    <div class="scene-actions">
      <button class="ghost" data-art>✦ Generate Art</button>
      <button class="ghost" data-edit>Edit</button>
      ${!isStart ? '<button class="ghost" data-start>Set as Start</button>' : ""}
      <button class="danger" data-del>Delete</button>
    </div>`;

  div.querySelector("[data-art]").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = "✦ Generating…";
    setBusy("Painting your scene — this can take up to a minute on the free tier…");
    try {
      await call(`/v1/games/${GID}/scenes/${s.id}/assets`, {
        method: "POST",
        body: JSON.stringify({ prompt: (s.narrative || s.title).slice(0, 200) }),
      });
      setStatus("Scene art generated ✓", "ok");
      await loadGame();
    } catch (err) { showErr(err); b.disabled = false; b.textContent = "✦ Generate Art"; }
    setBusy("");
  });

  div.querySelector("[data-edit]").addEventListener("click", () => {
    editingSceneId = s.id;
    document.getElementById("s-title").value = s.title;
    document.getElementById("s-narr").value = s.narrative;
    choicesEl.innerHTML = "";
    (s.choices || []).forEach((c) => addChoiceRow(c.label, c.target, c.outcome));
    refreshTargets();
    const btn = document.getElementById("btn-scene");
    btn.textContent = "Save Scene";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const startBtn = div.querySelector("[data-start]");
  if (startBtn) startBtn.addEventListener("click", async () => {
    try {
      await call("/v1/games/" + GID, { method: "PATCH", body: JSON.stringify({ start_scene: s.id }) });
      setStatus("Start scene set ✓", "ok");
      loadGame();
    } catch (err) { showErr(err); }
  });

  div.querySelector("[data-del]").addEventListener("click", async () => {
    if (!confirm("Delete scene “" + s.title + "”?")) return;
    try { await call(`/v1/games/${GID}/scenes/${s.id}`, { method: "DELETE" }); loadGame(); }
    catch (err) { showErr(err); }
  });
  return div;
}

function cancelEdit() {
  editingSceneId = null;
  document.getElementById("f-scene").reset();
  choicesEl.innerHTML = "";
  document.getElementById("btn-scene").textContent = "Add Scene";
}

function renderScenes() {
  const list = document.getElementById("scenes-list");
  list.innerHTML = "";
  document.getElementById("scenes-empty").style.display = scenes.length ? "none" : "block";
  scenes.forEach((s) => list.appendChild(sceneCard(s)));
}

/* ---------- story map ---------- */
async function renderMap() {
  const mapEl = document.getElementById("map");
  mapEl.innerHTML = "";
  if (!scenes.length) {
    document.getElementById("map-empty").style.display = "block";
    return;
  }
  document.getElementById("map-empty").style.display = "none";
  try {
    const d = await call(`/v1/games/${GID}/story-map`);
    const byId = new Map(scenes.map((s) => [s.id, s]));
    const unresolved = new Set((d.unresolved_targets || []).map((u) => u.scene));
    const unreachable = new Set((d.unreachable_scenes || []).map((u) => u.id));

    /* BFS depth columns from start */
    const depth = new Map();
    const seen = new Set();
    if (d.start_scene) { depth.set(d.start_scene, 0); seen.add(d.start_scene); }
    let frontier = d.start_scene ? [d.start_scene] : [];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        const sc = byId.get(id);
        for (const c of (sc && sc.choices) || []) {
          if (c.target && byId.has(c.target) && !seen.has(c.target)) {
            seen.add(c.target); depth.set(c.target, depth.get(id) + 1); next.push(c.target);
          }
        }
      }
      frontier = next;
    }
    /* unreachable + detached scenes go in a last column */
    const cols = new Map();
    for (const s of scenes) {
      if (unreachable.has(s.id)) continue;
      const dep = depth.has(s.id) ? depth.get(s.id) : 999;
      if (!cols.has(dep)) cols.set(dep, []);
      cols.get(dep).push(s);
    }
    const order = [...cols.keys()].sort((a, b) => a - b);
    if (unreachable.size) cols.set("x", scenes.filter((s) => unreachable.has(s.id)));

    for (const key of [...order, ...(unreachable.size ? ["x"] : [])]) {
      const col = document.createElement("div");
      col.className = "map-col";
      const isX = key === "x";
      col.innerHTML = `<div class="map-col-label">${isX ? "Unreachable (fix needed)" : key === 0 ? "Start" : "Depth " + key}</div>`;
      for (const s of cols.get(key)) {
        const node = document.createElement("div");
        node.className = "map-node" + (s.id === d.start_scene ? " start" : "") + (isX ? " unreachable" : "");
        const edges = (s.choices || []).map((c) => {
          const t = byId.get(c.target);
          const bad = !t;
          return `<div class="map-edge${bad ? " bad" : ""}">${escapeHtml(c.label)} <span class="arrow">→</span> ${bad ? "unwritten path" : escapeHtml(t.title)}</div>`;
        }).join("");
        node.innerHTML = `<div class="n-title">${escapeHtml(s.title)}${s.image_url ? " ✦" : ""}${unresolved.has(s.id) ? " ⚠" : ""}</div>${edges || '<div class="map-edge">— story ends here —</div>'}`;
        col.appendChild(node);
      }
      mapEl.appendChild(col);
    }
  } catch (err) { mapEl.innerHTML = '<p class="empty">' + escapeHtml(err.message) + "</p>"; }
}

/* ---------- play test ---------- */
function renderPlay() {
  const el = document.getElementById("play");
  if (!scenes.length) {
    el.innerHTML = '<p class="empty">Add scenes first, then play test your story here.</p>';
    return;
  }
  if (!game.start_scene) {
    el.innerHTML = '<p class="empty">No start scene set. Add a scene in the Scenes tab to begin.</p>';
    return;
  }
  playScene(game.start_scene);
}

function playScene(id) {
  const el = document.getElementById("play");
  const s = scenes.find((x) => x.id === id);
  if (!s) { el.innerHTML = '<p class="empty">This path is not written yet.</p><button class="ghost" onclick="playScene(game.start_scene)">Restart</button>'; return; }
  const choices = (s.choices || []).filter((c) => c.label);
  el.innerHTML = `
    ${s.image_url ? `<img class="play-art" src="${escapeHtml(s.image_url)}" alt="Scene art">` : ""}
    <div class="play-title">${escapeHtml(s.title)}</div>
    <div class="play-narr">${escapeHtml(s.narrative)}</div>
    ${choices.length
      ? '<div class="play-choices">' + choices.map((c, i) =>
          `<button class="play-choice" data-i="${i}">${escapeHtml(c.label)}</button>`).join("") + "</div>"
      : '<div class="the-end">The End</div>'}
    <div style="margin-top:24px"><button class="ghost" id="btn-restart">Restart</button></div>`;
  el.querySelectorAll(".play-choice").forEach((b) => {
    b.addEventListener("click", () => {
      const c = choices[Number(b.dataset.i)];
      if (!c.target) {
        el.innerHTML = `<div class="the-end">Unwritten Path</div>
          <p class="empty" style="text-align:center">This choice doesn't lead anywhere yet — write the next scene in the Scenes tab.</p>
          <div style="text-align:center;margin-top:20px"><button class="ghost" onclick="playScene(game.start_scene)">Restart</button></div>`;
        return;
      }
      playScene(c.target);
    });
  });
  const r = document.getElementById("btn-restart");
  if (r) r.addEventListener("click", () => playScene(game.start_scene));
}

/* kick off */
withWake(loadGame());
