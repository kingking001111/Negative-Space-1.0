(() => {
  const N = 4;                 // board size
  const BLOCK = 2;             // 2x2 blocks
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const btnUndo = document.getElementById("btnUndo");
  const btnReset = document.getElementById("btnReset");
  const btnNew = document.getElementById("btnNew");

  // state
  // cell.empty = boolean
  // cell.given = boolean
  let cells = [];              // length N*N
  let history = [];
  let initialSnapshot = null;

  // ----- helpers -----
  const idx = (r, c) => r * N + c;
  const rcFromIdx = (i) => [Math.floor(i / N), i % N];

  function cloneState(state) {
    return state.map(x => ({ ...x }));
  }

  function pushHistory() {
    history.push(cloneState(cells));
    btnUndo.disabled = history.length === 0;
  }

  function setStatus(lines, tone = "muted") {
    statusEl.className = "status " + (tone || "");
    statusEl.textContent = lines.join("\n");
  }

  // ----- puzzle generation -----
  // We generate a valid solution as a permutation p[r] = empty column in row r
  // and enforce block constraint: each 2x2 block has exactly one empty.
  function generateSolutionPermutation() {
    // brute force all permutations of [0..3] and filter by block rule
    const perms = permute([0,1,2,3]);
    const valid = perms.filter(p => blocksOk(p));
    return valid[Math.floor(Math.random() * valid.length)];
  }

  function blocksOk(p) {
    // count empties per block
    const counts = new Map();
    for (let r = 0; r < N; r++) {
      const c = p[r];
      const br = Math.floor(r / BLOCK);
      const bc = Math.floor(c / BLOCK);
      const key = `${br},${bc}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    // must be exactly 1 per block; total blocks = (N/BLOCK)^2 = 4
    for (let br = 0; br < N / BLOCK; br++) {
      for (let bc = 0; bc < N / BLOCK; bc++) {
        const key = `${br},${bc}`;
        if ((counts.get(key) || 0) !== 1) return false;
      }
    }
    return true;
  }

  function permute(arr) {
    const out = [];
    const a = arr.slice();
    function backtrack(i) {
      if (i === a.length) { out.push(a.slice()); return; }
      for (let j = i; j < a.length; j++) {
        [a[i], a[j]] = [a[j], a[i]];
        backtrack(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
    }
    backtrack(0);
    return out;
  }

  function buildPuzzle() {
    const sol = generateSolutionPermutation();

    // Start with all filled, then mark empties according to solution
    const state = Array.from({ length: N * N }, () => ({
      empty: false,
      given: false,
    }));
    for (let r = 0; r < N; r++) {
      state[idx(r, sol[r])].empty = true;
    }

    // Create givens: reveal 2 empties (locked), and add a few "not empty" locks implicitly by givens only.
    // To keep MVP simple and calm: only lock empties.
    const emptyIndices = [];
    for (let i = 0; i < state.length; i++) if (state[i].empty) emptyIndices.push(i);

    shuffle(emptyIndices);
    const givensCount = 2; // adjust later
    for (let k = 0; k < givensCount; k++) {
      const i = emptyIndices[k];
      state[i].given = true;
    }

    // Player state starts from all filled, except givens are empty
    const start = Array.from({ length: N * N }, (_, i) => ({
      empty: state[i].given ? true : false,
      given: state[i].given,
    }));

    return { start, solution: state };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ----- rendering -----
  function render() {
    boardEl.innerHTML = "";

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = idx(r, c);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell " + (cells[i].empty ? "empty" : "filled") + (cells[i].given ? " given" : "");
        cell.setAttribute("aria-label", `cell ${r+1},${c+1}`);

        // subtle block edges
        if (c === 1) cell.classList.add("blockEdgeR"); // after col 1
        if (r === 1) cell.classList.add("blockEdgeB"); // after row 1

        cell.addEventListener("click", () => onCellClick(i));
        if (cells[i].given) cell.disabled = true;

        boardEl.appendChild(cell);
      }
    }

    updateValidationUI();
  }

  function onCellClick(i) {
    if (cells[i].given) return;
    pushHistory();
    cells[i].empty = !cells[i].empty;
    render();
  }

  // ----- validation -----
  function validate() {
    // return counts and conflicts
    const rowEmpty = Array(N).fill(0);
    const colEmpty = Array(N).fill(0);
    const blkEmpty = Array(N).fill(0); // 4 blocks indexed 0..3

    const conflicts = new Set();

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = idx(r, c);
        if (!cells[i].empty) continue;

        rowEmpty[r]++; colEmpty[c]++;
        const b = Math.floor(r / BLOCK) * (N / BLOCK) + Math.floor(c / BLOCK);
        blkEmpty[b]++;
      }
    }

    // mark conflicts: if any group has >1 empties, all empties in that group conflict
    function markGroupConflict(predicate) {
      for (let i = 0; i < N * N; i++) {
        if (!cells[i].empty) continue;
        const [r, c] = rcFromIdx(i);
        if (predicate(r, c)) conflicts.add(i);
      }
    }

    for (let r = 0; r < N; r++) {
      if (rowEmpty[r] > 1) markGroupConflict((rr) => rr === r);
    }
    for (let c = 0; c < N; c++) {
      if (colEmpty[c] > 1) markGroupConflict((_, cc) => cc === c);
    }
    for (let br = 0; br < N / BLOCK; br++) {
      for (let bc = 0; bc < N / BLOCK; bc++) {
        const b = br * (N / BLOCK) + bc;
        if (blkEmpty[b] > 1) {
          markGroupConflict((r, c) =>
            Math.floor(r / BLOCK) === br && Math.floor(c / BLOCK) === bc
          );
        }
      }
    }

    // completion: exactly 1 empty per row/col/block
    const complete =
      rowEmpty.every(x => x === 1) &&
      colEmpty.every(x => x === 1) &&
      blkEmpty.every(x => x === 1);

    return { rowEmpty, colEmpty, blkEmpty, conflicts, complete };
  }

  function updateValidationUI() {
    const v = validate();

    // apply conflicts class
    const cellEls = boardEl.querySelectorAll(".cell");
    v.conflicts.forEach(i => cellEls[i]?.classList.add("conflict"));

    const lines = [];
    lines.push(`Row empty:  ${v.rowEmpty.join("  ")}`);
    lines.push(`Col empty:   ${v.colEmpty.join("  ")}`);
    lines.push(`Block empty: ${v.blkEmpty.join("  ")}`);

    if (v.complete) {
      lines.push("");
      lines.push("整齊。");
      setStatus(lines, "good");
    } else if (v.conflicts.size > 0) {
      lines.push("");
      lines.push("有些地方變得不整齊。");
      setStatus(lines, "bad");
    } else {
      lines.push("");
      lines.push("繼續整理。");
      setStatus(lines, "muted");
    }
  }

  // ----- controls -----
  function resetToInitial() {
    history = [];
    btnUndo.disabled = true;
    cells = cloneState(initialSnapshot);
    render();
  }

  function newPuzzle() {
    const { start } = buildPuzzle();
    history = [];
    btnUndo.disabled = true;
    cells = cloneState(start);
    initialSnapshot = cloneState(start);
    render();
  }

  btnUndo.addEventListener("click", () => {
    if (history.length === 0) return;
    cells = history.pop();
    btnUndo.disabled = history.length === 0;
    render();
  });

  btnReset.addEventListener("click", resetToInitial);
  btnNew.addEventListener("click", newPuzzle);

  // ----- boot -----
  newPuzzle();
})();
