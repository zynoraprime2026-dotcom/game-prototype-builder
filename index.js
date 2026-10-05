/* index.js — My Games page */
const form = document.getElementById("f-create");
const btnCreate = document.getElementById("btn-create");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("g-title").value.trim();
  if (!title) return;
  btnCreate.disabled = true;
  btnCreate.textContent = "Creating…";
  setStatus("");
  try {
    await withWake(call("/v1/games", {
      method: "POST",
      body: JSON.stringify({
        title,
        genre: document.getElementById("g-genre").value.trim(),
        description: document.getElementById("g-desc").value.trim(),
      }),
    }));
    form.reset();
    setStatus("Game created ✓", "ok");
    await loadGames();
  } catch (err) { showErr(err); }
  btnCreate.disabled = false;
  btnCreate.textContent = "Create Game";
});

async function loadGames() {
  const grid = document.getElementById("games");
  const empty = document.getElementById("games-empty");
  grid.innerHTML = "";
  try {
    const d = await call("/v1/games");
    const games = d.games || [];
    empty.style.display = games.length ? "none" : "block";
    for (const g of games) {
      const card = document.createElement("div");
      card.className = "game-card";
      card.innerHTML = `
        <div class="g-title">${escapeHtml(g.title)}</div>
        <div class="g-meta">${escapeHtml(g.genre || "No genre")} · updated ${new Date(g.updated_at).toLocaleDateString()}</div>
        <div class="g-actions">
          <button class="ghost" data-open>Open</button>
          <button class="danger" data-del>Delete</button>
        </div>`;
      card.querySelector("[data-open]").onclick = () => { location.href = "game.html?id=" + g.id; };
      card.querySelector("[data-del]").onclick = async () => {
        if (!confirm("Delete “" + g.title + "” and all its scenes?")) return;
        try { await call("/v1/games/" + g.id, { method: "DELETE" }); loadGames(); }
        catch (err) { showErr(err); }
      };
      grid.appendChild(card);
    }
  } catch (err) { showErr(err); }
}

withWake(loadGames());
