(() => {
  // --- Tetromino definitions (base rotations will be generated) ---
  // Each shape is list of (r,c) cells in a 4x4 local grid, origin at (0,0)
  const SHAPES = {
    I: [[0,0],[0,1],[0,2],[0,3]],
    O: [[0,0],[0,1],[1,0],[1,1]],
    T: [[0,1],[1,0],[1,1],[1,2]],
    S: [[0,1],[0,2],[1,0],[1,1]],
    Z: [[0,0],[0,1],[1,1],[1,2]],
    J: [[0,0],[1,0],[1,1],[1,2]],
    L: [[0,2],[1,0],[1,1],[1,2]],
  };

  const boardEl = document.getElementById("board");
  const piecesEl = document.getElementById("pieces");
  const statusEl = document.getElementById("status");

  const btnNew = document.getElementById("btnNew");
  const btnUndo = document.getElementById("btnUndo");
  const btnReset = document.getElementById("btnReset");

  const sizeSel = document.getElementById("sizeSel");
  const holesSel = document.getElementById("holesSel");

  // --- State ---
  let N = 8;                 // board size
  let holePieces = 3;        // number of removed tetrominoes => holes difficulty
  let grid = [];             // 0 empty, 1 filled, -1 hole
  let inventory = {};        // {I:count, ...}
  let selectedType = null;
  let selectedRot = 0;
  let placements = [];       // stack of placed pieces for undo
  let initialSnapshot = null;

  // Precompute unique rotations for each type
  const ROTATIONS = {};
  for (const [k, cells] of Object.entries(SHAPES)) {
    ROTATIONS[k] = uniqueRotations(cells);
  }

  // --- Utilities ---
  function idx(r,c){ return r*N+c; }
  function inb(r,c){ return r>=0 && r<N && c>=0 && c<N; }

  function cloneGrid(g){ return g.slice(); }
  function cloneInv(inv){ return Object.fromEntries(Object.entries(inv).map(([k,v])=>[k,v])); }

  function setStatus(lines, tone="") {
    statusEl.className = "status " + tone;
    statusEl.textContent = lines.join("\n");
  }

  // Normalize list of cells: shift to top-left
  function normalize(cells){
    let minR = Infinity, minC = Infinity;
    for (const [r,c] of cells){ minR = Math.min(minR,r); minC = Math.min(minC,c); }
    const shifted = cells.map(([r,c]) => [r-minR, c-minC]);
    shifted.sort((a,b)=> (a[0]-b[0]) || (a[1]-b[1]));
    return shifted;
  }

  function rotate90(cells){
    // (r,c) -> (c, -r)
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

  function firstEmptyCell(g){
    for (let r=0;r<N;r++){
      for (let c=0;c<N;c++){
        const v = g[idx(r,c)];
        if (v === 0) return [r,c];
      }
    }
    return null;
  }

  function canPlace(g, type, rotIdx, r0, c0){
    const cells = ROTATIONS[type][rotIdx];
    for (const [dr,dc] of cells){
      const r = r0 + dr, c = c0 + dc;
      if (!inb(r,c)) return false;
      const v = g[idx(r,c)];
      if (v !== 0) return false; // can't overlap filled or holes
    }
    return true;
  }

  function placeOnGrid(g, type, rotIdx, r0, c0, fillValue=1){
    const cells = ROTATIONS[type][rotIdx];
    for (const [dr,dc] of cells){
      g[idx(r0+dr, c0+dc)] = fillValue;
    }
  }

  // --- Generator: tile full board with tetrominoes, then remove k pieces as holes ---
  // Backtracking tiler (reasonably fast for 8x8; 10x10 might take longer but still ok for MVP)
  function generatePuzzle(){
    grid = Array(N*N).fill(0);
    const sol = [];
    const counts = {I:0,O:0,T:0,S:0,Z:0,J:0,L:0};

    // heuristic order: try more "awkward" pieces earlier for better fill
    const typesOrder = ["T","S","Z","J","L","I","O"];

    function backtrack(){
      const pos = firstEmptyCell(grid);
      if (!pos) return true;
      const [r,c] = pos;

      // Try each piece/rotation anchored at (r,c) by shifting its cells so one cell lands on (r,c)
      // We'll attempt candidate placements by choosing an anchor cell from the shape.
      for (const t of typesOrder){
        for (let rot=0; rot<ROTATIONS[t].length; rot++){
          const cells = ROTATIONS[t][rot];
          for (const [ar,ac] of cells){
            const r0 = r - ar;
            const c0 = c - ac;
            if (!canPlace(grid, t, rot, r0, c0)) continue;

            placeOnGrid(grid, t, rot, r0, c0, 1);
            sol.push({type:t, rot, r0, c0});
            counts[t]++;

            if (backtrack()) return true;

            // undo
            placeOnGrid(grid, t, rot, r0, c0, 0);
            sol.pop();
            counts[t]--;
          }
        }
      }
      return false;
    }

    // Fill board
    const ok = backtrack();
    if (!ok) {
      // fallback: smaller size default if solver struggles (rare)
      throw new Error("Failed to generate a tiling. Try again.");
    }

    // Now "remove" some placed pieces as holes (negative spaces)
    const totalPieces = sol.length;
    const k = Math.min(holePieces, totalPieces-1);

    // choose k distinct indices
    const pick = [];
    const used = new Set();
    while (pick.length < k){
      const i = Math.floor(Math.random() * totalPieces);
      if (used.has(i)) continue;
      used.add(i);
      pick.push(i);
    }

    // rebuild a fresh grid with holes
    const g2 = Array(N*N).fill(0);
    const inv = {I:0,O:0,T:0,S:0,Z:0,J:0,L:0};

    for (let i=0;i<sol.length;i++){
      const p = sol[i];
      if (used.has(i)){
        // mark holes
        placeOnGrid(g2, p.type, p.rot, p.r0, p.c0, -1);
      } else {
        // these pieces are available for player to place
        inv[p.type]++;
      }
    }

    // Player starts with empty (0) and holes (-1) only
    grid = g2;
    inventory = inv;
    placements = [];
    selectedType = null;
    selectedRot = 0;

    initialSnapshot = {
      grid: cloneGrid(grid),
      inventory: cloneInv(inventory),
      placements: [],
      selectedType: null,
      selectedRot: 0,
    };

    updateUI();
    setStatus(["繼續整理。", "選一個棋子，移到棋盤上，點一下放下。", "按 R 旋轉。"]);
  }

  // --- Rendering ---
  function updateUI(){
    // board grid template
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    boardEl.innerHTML = "";

    for (let r=0;r<N;r++){
      for (let c=0;c<N;c++){
        const v = grid[idx(r,c)];
        const cell = document.createElement("div");
        cell.className = "cell" + (v === -1 ? " hole" : (v === 1 ? " filled" : ""));
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        boardEl.appendChild(cell);
      }
    }

    // events for hover/place
    boardEl.onmousemove = onBoardHover;
    boardEl.onclick = onBoardClick;

    renderPieces();
    btnUndo.disabled = placements.length === 0;

    // check completion
    const remaining = grid.filter(v => v === 0).length;
    const holes = grid.filter(v => v === -1).length;
    if (remaining === 0){
      setStatus(["整齊。", `Board ${N}×${N} · Holes ${holes} · Pieces placed ${sumPlaced()}`], "good");
    } else {
      setStatus([`尚餘 ${remaining} 格待填。`, `洞（留白） ${holes} 格。`, `已放置 ${sumPlaced()} 個棋子。`], "");
    }
  }

  function sumPlaced(){ return placements.length; }

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
          <svg viewBox="0 0 80 60" width="100%" height="100%">
            ${miniSvg(t)}
          </svg>
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

  function miniSvg(t){
    // draw rotation 0 in a tiny box
    const cells = ROTATIONS[t][0];
    const size = 12;
    // center-ish
    const norm = normalize(cells);
    const maxR = Math.max(...norm.map(x=>x[0]));
    const maxC = Math.max(...norm.map(x=>x[1]));
    const offsetX = (80 - (maxC+1)*size)/2;
    const offsetY = (60 - (maxR+1)*size)/2;

    const rects = norm.map(([r,c]) => {
      const x = offsetX + c*size;
      const y = offsetY + r*size;
      return `<rect x="${x}" y="${y}" width="${size-1}" height="${size-1}" rx="3" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.12)" />`;
    }).join("");
    return rects;
  }

  // --- Hover preview / placement ---
  function clearPreview(){
    for (const el of boardEl.querySelectorAll(".cell.preview, .cell.invalid")){
      el.classList.remove("preview");
      el.classList.remove("invalid");
    }
  }

  function getHoverAnchor(evt){
    const target = evt.target.closest(".cell");
    if (!target) return null;
    const r = Number(target.dataset.r);
    const c = Number(target.dataset.c);
    return [r,c];
  }

  function previewAt(r, c){
    clearPreview();
    if (!selectedType) return;

    const cells = ROTATIONS[selectedType][selectedRot];
    // use first cell as anchor (simple, consistent)
    const [ar, ac] = cells[0];
    const r0 = r - ar;
    const c0 = c - ac;

    const ok = canPlace(grid, selectedType, selectedRot, r0, c0);
    for (const [dr,dc] of cells){
      const rr = r0 + dr, cc = c0 + dc;
      if (!inb(rr,cc)) continue;
      const el = boardEl.children[idx(rr,cc)];
      if (!el) continue;
      el.classList.add(ok ? "preview" : "invalid");
    }
  }

  function onBoardHover(evt){
    const p = getHoverAnchor(evt);
    if (!p) return;
    previewAt(p[0], p[1]);
  }

  function onBoardClick(evt){
    const p = getHoverAnchor(evt);
    if (!p || !selectedType) return;

    const cells = ROTATIONS[selectedType][selectedRot];
    const [ar, ac] = cells[0];
    const r0 = p[0] - ar;
    const c0 = p[1] - ac;

    if (!canPlace(grid, selectedType, selectedRot, r0, c0)){
      setStatus(["有些地方放不下。", "別急，換個位置或旋轉。"], "bad");
      return;
    }

    // place
    placeOnGrid(grid, selectedType, selectedRot, r0, c0, 1);
    inventory[selectedType]--;
    placements.push({ type: selectedType, rot: selectedRot, r0, c0 });

    // auto deselect if count 0
    if (inventory[selectedType] === 0) selectedType = null;
    clearPreview();
    updateUI();
  }

  // --- Controls ---
  function resetPuzzle(){
    if (!initialSnapshot) return;
    grid = cloneGrid(initialSnapshot.grid);
    inventory = cloneInv(initialSnapshot.inventory);
    placements = [];
    selectedType = null;
    selectedRot = 0;
    clearPreview();
    updateUI();
  }

  function undo(){
    const last = placements.pop();
    if (!last) return;
    // remove by setting back to 0
    placeOnGrid(grid, last.type, last.rot, last.r0, last.c0, 0);
    inventory[last.type] = (inventory[last.type] ?? 0) + 1;
    selectedType = last.type; // convenient: keep flow
    selectedRot = last.rot;
    clearPreview();
    updateUI();
  }

  function newPuzzle(){
    N = Number(sizeSel.value);
    holePieces = Number(holesSel.value);

    try {
      generatePuzzle();
    } catch (e) {
      // fallback: try again once
      try { generatePuzzle(); }
      catch {
        setStatus(["生成題目失敗。", "請再按一次 New。"], "bad");
      }
    }
  }

  // rotate with R
  window.addEventListener("keydown", (e) => {
    if (!selectedType) return;
    if (e.key.toLowerCase() === "r"){
      const rots = ROTATIONS[selectedType].length;
      selectedRot = (selectedRot + 1) % rots;
      // keep preview consistent if mouse is on board
      // (do nothing else; hover will repaint)
      renderPieces();
    }
  });

  btnNew.addEventListener("click", newPuzzle);
  btnReset.addEventListener("click", resetPuzzle);
  btnUndo.addEventListener("click", undo);

  sizeSel.addEventListener("change", newPuzzle);
  holesSel.addEventListener("change", newPuzzle);

  // --- Boot ---
  newPuzzle();
})();
