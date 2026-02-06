(() => {
  const boardEl = document.getElementById("board");
  const piecesEl = document.getElementById("pieces");
  const statusEl = document.getElementById("status");

  const btnNew = document.getElementById("btnNew");
  const btnUndo = document.getElementById("btnUndo");
  const btnReset = document.getElementById("btnReset");

  const sizeSel = document.getElementById("sizeSel");
  const holesSel = document.getElementById("holesSel");

  // --- Tetromino definitions ---
  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,1],[1,0],[1,1],[1,2]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    J: [[0,0],[1,0],[1,1],[1,2]],
    L: [[0,2],[1,0],[1,1],[1,2]],
  };

  // --- Rotation helpers ---
  function normalize(cells){
    let minR = Infinity, minC = Infinity;
    for (const [r,c] of cells){ minR = Math.min(minR,r); minC = Math.min(minC,c); }
    const shifted = cells.map(([r,c]) => [r-minR, c-minC]);
    shifted.sort((a,b)=> (a[0]-b[0]) || (a[1]-b[1]));
    return shifted;
  }
  function rotate90(cells){
    const rotated = cells.map(([r,c]) => [c, -r]);
    return normalize(rotated);
  }
  function uniqueRotations(base){
    const rots = [];
    let cur = normalize(base);
    for (let i=0;i<4;i++){
      const key = JSON.stringify(cur);
      if (!rots.some(r => JSON.stringify(r)===key)) rots.push(cur);
      cur = rotate90(cur);
    }
    return rots;
  }
  const ROTATIONS = {};
  for (const [k, cells] of Object.entries(SHAPES)) ROTATIONS[k] = uniqueRotations(cells);

  // --- Game state ---
  let N = 8;
  // grid: -1 hole, 0 empty, 1 filled
  let grid = [];
  let inventory = {};
  let placements = [];
  let selectedType = null;
  let selectedRot = 0;
  let initialSnapshot = null;

  const idx = (r,c)=> r*N+c;
  const inb = (r,c)=> r>=0 && r<N && c>=0 && c<N;

  function setStatus(lines, tone=""){
    statusEl.className = "status " + tone;
    statusEl.textContent = lines.join("\n");
  }

  function cloneGrid(g){ return g.slice(); }
  function cloneInv(inv){ return Object.fromEntries(Object.entries(inv).map(([k,v])=>[k,v])); }

  function canPlace(type, rotIdx, r0, c0){
    const cells = ROTATIONS[type][rotIdx];
    for (const [dr,dc] of cells){
      const r = r0 + dr, c = c0 + dc;
      if (!inb(r,c)) return false;
      const v = grid[idx(r,c)];
      if (v !== 0) return false; // can't overlap hole(-1) or filled(1)
    }
    return true;
  }

  function paint(type, rotIdx, r0, c0, value){
    const cells = ROTATIONS[type][rotIdx];
    for (const [dr,dc] of cells){
      grid[idx(r0+dr, c0+dc)] = value;
    }
  }

  function clearPreview(){
    for (const el of boardEl.querySelectorAll(".cell.preview, .cell.invalid")){
      el.classList.remove("preview");
      el.classList.remove("invalid");
    }
  }

  function renderBoard(){
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    boardEl.innerHTML = "";
    for (let r=0;r<N;r++){
      for (let c=0;c<N;c++){
        const v = grid[idx(r,c)];
        const cell = document.createElement("div");
        cell.className = "cell" + (v===-1 ? " hole" : (v===1 ? " filled" : ""));
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        boardEl.appendChild(cell);
      }
    }
  }

  function miniSvg(t){
    const cells = normalize(ROTATIONS[t][0]);
    const size = 12;
    const maxR = Math.max(...cells.map(x=>x[0]));
    const maxC = Math.max(...cells.map(x=>x[1]));
    const offsetX = (80 - (maxC+1)*size)/2;
    const offsetY = (60 - (maxR+1)*size)/2;

    return cells.map(([r,c]) => {
      const x = offsetX + c*size;
      const y = offsetY + r*size;
      return `<rect x="${x}" y="${y}" width="${size-1}" height="${size-1}" rx="3"
        fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.12)" />`;
    }).join("");
  }

  function renderPieces(){
    piecesEl.innerHTML = "";
    const types = ["I","O","T","S","Z","J","L"];

    for (const t of types){
      const count = inventory[t] ?? 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pieceBtn" + (selectedType === t ? " selected" : "");
      btn.disabled = count === 0;

      btn.innerHTML = `
        <div class="pieceTop">
          <div class="pieceName">${t}</div>
          <div class="pieceCount">${count}</div>
        </div>
        <div class="mini" aria-hidden="true">
          <svg viewBox="0 0 80 60" width="100%" height="100%">${miniSvg(t)}</svg>
        </div>
      `;

      btn.onclick = () => {
        if (count === 0) return;
        selectedType = t;
        selectedRot = 0;
        renderPieces();
      };

      piecesEl.appendChild(btn);
    }
  }

  function updateStatus(){
    const remaining = grid.filter(v => v === 0).length;
    const holes = grid.filter(v => v === -1).length;

    if (remaining === 0){
      setStatus(["整齊。", `Board ${N}×${N} · Holes ${holes} · Pieces placed ${placements.length}`], "good");
    } else {
      setStatus([`尚餘 ${remaining} 格待填。`, `洞（留白） ${holes} 格。`, `已放置 ${placements.length} 個棋子。`, selectedType ? `Selected: ${selectedType} (R rotate)` : `選一個棋子開始。`], "");
    }
    btnUndo.disabled = placements.length === 0;
  }

  function updateUI(){
    renderBoard();
    renderPieces();
    updateStatus();
  }

  function getCellFromEvent(evt){
    const target = evt.target.closest(".cell");
    if (!target) return null;
    return [Number(target.dataset.r), Number(target.dataset.c)];
  }

  function previewAt(r, c){
    clearPreview();
    if (!selectedType) return;
    const cells = ROTATIONS[selectedType][selectedRot];
    const [ar, ac] = cells[0];     // anchor
    const r0 = r - ar;
    const c0 = c - ac;

    const ok = canPlace(selectedType, selectedRot, r0, c0);

    for (const [dr,dc] of cells){
      const rr = r0 + dr, cc = c0 + dc;
      if (!inb(rr,cc)) continue;
      const el = boardEl.children[idx(rr,cc)];
      if (!el) continue;
      el.classList.add(ok ? "preview" : "invalid");
    }
  }

  function tryPlace(r, c){
    if (!selectedType) return;
    const cells = ROTATIONS[selectedType][selectedRot];
    const [ar, ac] = cells[0];
    const r0 = r - ar;
    const c0 = c - ac;

    if (!canPlace(selectedType, selectedRot, r0, c0)){
      setStatus(["有些地方放不下。", "換個位置或按 R 旋轉。"], "bad");
      return;
    }

    paint(selectedType, selectedRot, r0, c0, 1);
    inventory[selectedType]--;
    placements.push({ type: selectedType, rot: selectedRot, r0, c0 });

    if (inventory[selectedType] === 0) selectedType = null;
    clearPreview();
    updateUI();
  }

  function undo(){
    const last = placements.pop();
    if (!last) return;
    paint(last.type, last.rot, last.r0, last.c0, 0);
    inventory[last.type] = (inventory[last.type] ?? 0) + 1;
    selectedType = last.type;
    selectedRot = last.rot;
    clearPreview();
    updateUI();
  }

  function reset(){
    if (!initialSnapshot) return;
    grid = cloneGrid(initialSnapshot.grid);
    inventory = cloneInv(initialSnapshot.inventory);
    placements = [];
    selectedType = null;
    selectedRot = 0;
    clearPreview();
    updateUI();
  }

  // --- Reliable puzzle templates (no generator, always works) ---
  function buildTemplatePuzzle(){
    N = Number(sizeSel.value);
    const holesLevel = Number(holesSel.value);

    grid = Array(N*N).fill(0);

    // holes: fixed pattern + level
    // (Think of it like a tangram silhouette with missing points)
    const baseHoles = [
      [1,1],[1,2],
      [N-2,N-2],[N-2,N-3],
      [Math.floor(N/2), Math.floor(N/2)]
    ];
    const holes = baseHoles.slice(0, Math.min(baseHoles.length, holesLevel + 2));
    for (const [r,c] of holes) grid[idx(r,c)] = -1;

    // inventory: enough pieces to cover all non-hole cells
    // We’ll keep it simple but non-trivial: mixed tetromino set.
    const fillCells = N*N - holes.length;
    const neededPieces = Math.floor(fillCells / 4);

    inventory = {I:0,O:0,T:0,S:0,Z:0,J:0,L:0};
    const bag = ["I","O","T","S","Z","J","L"];

    // deterministic-ish mix
    for (let i=0;i<neededPieces;i++){
      const t = bag[i % bag.length];
      inventory[t]++;
    }

    placements = [];
    selectedType = null;
    selectedRot = 0;

    initialSnapshot = {
      grid: cloneGrid(grid),
      inventory: cloneInv(inventory),
    };

    updateUI();
    setStatus(["繼續整理。", "點選棋子 → 移到棋盤 → 點一下放下。按 R 旋轉。"]);
  }

  // --- Events ---
  boardEl.addEventListener("mousemove", (e) => {
    const p = getCellFromEvent(e);
    if (!p) return;
    previewAt(p[0], p[1]);
  });

  boardEl.addEventListener("click", (e) => {
    const p = getCellFromEvent(e);
    if (!p) return;
    tryPlace(p[0], p[1]);
  });

  window.addEventListener("keydown", (e) => {
    if (!selectedType) return;
    if (e.key.toLowerCase() === "r"){
      const rots = ROTATIONS[selectedType].length;
      selectedRot = (selectedRot + 1) % rots;
      renderPieces();
    }
  });

  btnUndo.addEventListener("click", undo);
  btnReset.addEventListener("click", reset);
  btnNew.addEventListener("click", buildTemplatePuzzle);
  sizeSel.addEventListener("change", buildTemplatePuzzle);
  holesSel.addEventListener("change", buildTemplatePuzzle);

  // --- Boot (always shows pieces) ---
  buildTemplatePuzzle();
})();
