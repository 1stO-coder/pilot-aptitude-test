const ObliqueViewEngine = (function() {
    let active = false;
    let canvas = document.getElementById('obliqueview-canvas');
    let ctx = canvas.getContext('2d');
    let gameTimer = null;

    // States
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let questionStartTime = 0;
    let currentDifficulty = 'easy';
    let currentGridSize = 3;

    // 3D Drag Rotation States
    let yawAngle = 0;
    let pitchAngle = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // Game data
    let voxelModel = []; // Array of {x, y, z}
    let targetSide = 'A'; // 'A', 'B', or 'C'
    let correctOptionIndex = 0;
    let optionsList = []; // Array of 3x3 grids (2D arrays of booleans)
    let userPracticeAnswer = null;

    // Quiz state
    let isQuizMode = false;
    let maxQuizQ = 40;
    let quizQuestions = [];
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;

    // Selectors
    const runModeSelect = document.getElementById('oblique-run-mode');
    const difficultySelect = document.getElementById('oblique-difficulty');
    const lobbyDiffSelect = document.getElementById('lobby-oblique-difficulty');
    const optionsGrid = document.getElementById('obliqueview-options-grid');
    const nextBtn = document.getElementById('oblique-next-btn');
    const prevBtn = document.getElementById('oblique-prev-btn');
    const submitBtn = document.getElementById('oblique-submit-exam-btn');
    const quizNav = document.getElementById('obliqueview-quiz-navigator');

    const scoreVal = document.getElementById('oblique-score');
    const accVal = document.getElementById('oblique-accuracy');
    const questVal = document.getElementById('oblique-quest');
    const timerVal = document.getElementById('oblique-timer');
    const modeTag = document.getElementById('oblique-mode-tag');
    const promptMsg = document.getElementById('oblique-prompt-message');

    // Helper functions
    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    function shuffle(a) {
        const r = [...a];
        for (let i = r.length - 1; i > 0; i--) {
            const j = rnd(0, i);
            [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
    }

    function isVoxelHidden(x, y, z, voxelSet) {
        // Line of sight offsets for 40 degrees: (d, d, round(1.285575 * d))
        const offsets = [
            { dx: 1, dy: 1, dz: 1 },
            { dx: 2, dy: 2, dz: 3 },
            { dx: 3, dy: 3, dz: 4 },
            { dx: 4, dy: 4, dz: 5 },
            { dx: 5, dy: 5, dz: 6 },
            { dx: 6, dy: 6, dz: 8 },
            { dx: 7, dy: 7, dz: 9 },
            { dx: 8, dy: 8, dz: 10 }
        ];

        for (let off of offsets) {
            if (voxelSet.has(`${x + off.dx},${y + off.dy},${z + off.dz}`)) {
                return true;
            }
        }
        
        // Check Top Face occlusion: exists d >= 0 with (x+d, y+d, z+d_offset+1)
        let topOccluded = false;
        for (let d = 0; d <= 8; d++) {
            const dz_offset = Math.round(d * 1.285575);
            if (voxelSet.has(`${x + d},${y + d},${z + dz_offset + 1}`)) {
                topOccluded = true;
                break;
            }
        }
        
        // Check Left Face occlusion: exists d >= 0 with (x+d, y+d+1, z+d_offset)
        let leftOccluded = false;
        for (let d = 0; d <= 8; d++) {
            const dz_offset = Math.round(d * 1.285575);
            if (voxelSet.has(`${x + d},${y + d + 1},${z + dz_offset}`)) {
                leftOccluded = true;
                break;
            }
        }
        
        // Check Right Face occlusion: exists d >= 0 with (x+d+1, y+d, z+d_offset)
        let rightOccluded = false;
        for (let d = 0; d <= 8; d++) {
            const dz_offset = Math.round(d * 1.285575);
            if (voxelSet.has(`${x + d + 1},${y + d},${z + dz_offset}`)) {
                rightOccluded = true;
                break;
            }
        }
        
        return topOccluded && leftOccluded && rightOccluded;
    }

    function countVisibleVoxels(model) {
        const voxelSet = new Set(model.map(v => `${v.x},${v.y},${v.z}`));
        let visibleCount = 0;
        for (let v of model) {
            if (!isVoxelHidden(v.x, v.y, v.z, voxelSet)) {
                visibleCount++;
            }
        }
        return visibleCount;
    }

    function generateVisibleModel(numBlocks, gridSize) {
        let attempts = 0;
        while (attempts < 2000) {
            attempts++;
            let candidate = generateConnectedBlocks(numBlocks, gridSize);
            // Check if all blocks are visible
            if (countVisibleVoxels(candidate) === numBlocks) {
                return candidate;
            }
        }
        // Fallback: if we really cannot find one (should be extremely rare),
        // we reduce numBlocks by 1 and try again recursively
        if (numBlocks > 4) {
            return generateVisibleModel(numBlocks - 1, gridSize);
        }
        return generateConnectedBlocks(numBlocks, gridSize);
    }

    // --- Connected Voxel Generator ---
    function generateConnectedBlocks(numBlocks, gridSize) {
        const startX = Math.floor(gridSize / 2);
        const startY = Math.floor(gridSize / 2);
        let blocks = [{ x: startX, y: startY, z: 0 }];
        let blockSet = new Set([`${startX},${startY},0`]);

        const dirs = [
            { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
        ];

        while (blocks.length < numBlocks) {
            // Pick a random block to expand from
            const parent = blocks[Math.floor(Math.random() * blocks.length)];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];

            const nx = parent.x + dir.dx;
            const ny = parent.y + dir.dy;
            const nz = parent.z + dir.dz;

            // Constrain inside gridSize x gridSize x gridSize (and prevent floaters below z=0)
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && nz >= 0 && nz < gridSize) {
                const key = `${nx},${ny},${nz}`;
                if (!blockSet.has(key)) {
                    // Check support: voxel must be at z=0, or have a block directly underneath it
                    if (nz === 0 || blockSet.has(`${nx},${ny},${nz-1}`)) {
                        blocks.push({ x: nx, y: ny, z: nz });
                        blockSet.add(key);
                    }
                }
            }
        }
        return blocks;
    }

    // --- 3D Isometric Renderer ---
    function drawIsometricModel(targetCanvas, blocks, targetSideText = '') {
        const targetCtx = targetCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = targetCanvas.parentNode.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => drawIsometricModel(targetCanvas, blocks, targetSideText));
            return;
        }
        targetCanvas.width = rect.width * dpr;
        targetCanvas.height = rect.height * dpr;
        targetCtx.scale(dpr, dpr);

        const cw = rect.width;
        const ch = rect.height;
        targetCtx.clearRect(0, 0, cw, ch);

        targetCtx.lineJoin = 'round';
        targetCtx.lineCap = 'round';

        // Calculate dynamic bounding box center
        const xs = blocks.map(b => b.x);
        const ys = blocks.map(b => b.y);
        const zs = blocks.map(b => b.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;

        // Apply rotation relative to center if rendering to the main interactive canvas
        let renderedCubes = [];
        if (targetCanvas === canvas && (yawAngle !== 0 || pitchAngle !== 0)) {
            renderedCubes = blocks.map(b => {
                const rx = b.x - cx;
                const ry = b.y - cy;
                const rz = b.z - cz;

                // Yaw rotation (around Z-axis)
                const rx1 = rx * Math.cos(yawAngle) - ry * Math.sin(yawAngle);
                const ry1 = rx * Math.sin(yawAngle) + ry * Math.cos(yawAngle);
                const rz1 = rz;

                // Pitch rotation (around X-axis)
                const rx2 = rx1;
                const ry2 = ry1 * Math.cos(pitchAngle) - rz1 * Math.sin(pitchAngle);
                const rz2 = ry1 * Math.sin(pitchAngle) + rz1 * Math.cos(pitchAngle);

                return {
                    x: rx2,
                    y: ry2,
                    z: rz2,
                    depth: rx2 + ry2 + 1.285575 * rz2
                };
            });
            // Sort depth-wise: back to front
            renderedCubes.sort((a, b) => a.depth - b.depth);
        } else {
            // Default isometric sorting: depth = x + y + 1.285575 * z relative to center
            renderedCubes = blocks.map(b => {
                const rx = b.x - cx;
                const ry = b.y - cy;
                const rz = b.z - cz;
                return {
                    x: rx,
                    y: ry,
                    z: rz,
                    depth: rx + ry + 1.285575 * rz
                };
            });
            renderedCubes.sort((a, b) => a.depth - b.depth);
        }

        // Drawing size logic
        const size = Math.min(cw, ch) * (0.45 / currentGridSize);
        
        // Isometric origin center
        const ox = cw / 2;
        const oy = ch / 2;

        const theta = 40 * Math.PI / 180;
        const cosAngle = Math.cos(theta);
        const sinAngle = Math.sin(theta);

        // Render cubes
        renderedCubes.forEach(b => {
            const sx = ox + (b.x - b.y) * cosAngle * size;
            const sy = oy + (b.x + b.y) * sinAngle * size - b.z * size;

            // Draw cube faces
            // 1. Top face
            targetCtx.beginPath();
            targetCtx.moveTo(sx, sy - size);
            targetCtx.lineTo(sx + cosAngle * size, sy - size + sinAngle * size);
            targetCtx.lineTo(sx, sy - size + 2 * sinAngle * size);
            targetCtx.lineTo(sx - cosAngle * size, sy - size + sinAngle * size);
            targetCtx.closePath();
            targetCtx.fillStyle = '#a5f3fc'; // Bright Cyan
            targetCtx.fill();
            targetCtx.strokeStyle = 'rgba(9, 9, 11, 0.4)';
            targetCtx.lineWidth = 1.5;
            targetCtx.stroke();

            // 2. Left face
            targetCtx.beginPath();
            targetCtx.moveTo(sx - cosAngle * size, sy - size + sinAngle * size);
            targetCtx.lineTo(sx, sy - size + 2 * sinAngle * size);
            targetCtx.lineTo(sx, sy - size + 2 * sinAngle * size + size);
            targetCtx.lineTo(sx - cosAngle * size, sy - size + sinAngle * size + size);
            targetCtx.closePath();
            targetCtx.fillStyle = '#06b6d4'; // Medium Cyan
            targetCtx.fill();
            targetCtx.stroke();

            // 3. Right face
            targetCtx.beginPath();
            targetCtx.moveTo(sx, sy - size + 2 * sinAngle * size);
            targetCtx.lineTo(sx + cosAngle * size, sy - size + sinAngle * size);
            targetCtx.lineTo(sx + cosAngle * size, sy - size + sinAngle * size + size);
            targetCtx.lineTo(sx, sy - size + 2 * sinAngle * size + size);
            targetCtx.closePath();
            targetCtx.fillStyle = '#0e7490'; // Dark Cyan
            targetCtx.fill();
            targetCtx.stroke();
        });

        // Render direction arrow markers (only if not rotated to avoid confusion)
        if (targetSideText && yawAngle === 0 && pitchAngle === 0) {
            targetCtx.save();
            targetCtx.font = 'bold 15px Outfit, sans-serif';
            targetCtx.fillStyle = '#fbbf24';
            targetCtx.strokeStyle = '#09090b';
            targetCtx.lineWidth = 3;
            targetCtx.textAlign = 'center';

            const arrowDistX = currentGridSize * 0.85;
            const arrowDistY = currentGridSize * 0.45;

            // Draw Side A arrow (Left pointing up-right)
            if (targetSideText === 'A') {
                const ax = ox - size * arrowDistX * cosAngle;
                const ay = oy + size * arrowDistY * sinAngle;
                drawArrow(targetCtx, ax, ay, ax + size * currentGridSize * 0.35 * cosAngle, ay - size * currentGridSize * 0.35 * sinAngle, '#fbbf24');
                targetCtx.strokeText('ภาพด้านหน้า (Front View)', ax - 35, ay);
                targetCtx.fillText('ภาพด้านหน้า (Front View)', ax - 35, ay);
            }
            // Draw Side B arrow (Right pointing up-left)
            else if (targetSideText === 'B') {
                const bx = ox + size * arrowDistX * cosAngle;
                const by = oy + size * arrowDistY * sinAngle;
                drawArrow(targetCtx, bx, by, bx - size * currentGridSize * 0.35 * cosAngle, by - size * currentGridSize * 0.35 * sinAngle, '#fbbf24');
                targetCtx.strokeText('ภาพด้านข้าง (Side View)', bx + 35, by);
                targetCtx.fillText('ภาพด้านข้าง (Side View)', bx + 35, by);
            }
            // Draw Side C arrow (Top pointing down)
            else if (targetSideText === 'C') {
                const cx = ox;
                const cy = oy - size * currentGridSize * 0.75;
                drawArrow(targetCtx, cx, cy, cx, cy + size * currentGridSize * 0.35, '#fbbf24');
                targetCtx.strokeText('ภาพด้านบน (Top View)', cx, cy - 15);
                targetCtx.fillText('ภาพด้านบน (Top View)', cx, cy - 15);
            }
            targetCtx.restore();
        }

    }

    function drawArrow(ctx, fromx, fromy, tox, toy, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 4;
        
        // Draw main shaft shadow
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(toy - fromy, tox - fromx);
        ctx.beginPath();
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - 12 * Math.cos(angle - Math.PI / 6), toy - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(tox - 12 * Math.cos(angle + Math.PI / 6), toy - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // --- Projection Calculations ---
    function getOrthographicView(blocks, side) {
        // Create dynamic gridSize empty grid
        let grid = Array(currentGridSize).fill(null).map(() => Array(currentGridSize).fill(false));

        blocks.forEach(b => {
            const x = Math.min(b.x, currentGridSize - 1);
            const y = Math.min(b.y, currentGridSize - 1);
            const z = Math.min(b.z, currentGridSize - 1);

            if (side === 'A') {
                // Front View: maps X (column) vs Z (row)
                // Row maps nz: (currentGridSize - 1) down to 0
                grid[currentGridSize - 1 - z][x] = true;
            } else if (side === 'B') {
                // Side View: maps Y (column) vs Z (row)
                // Row maps nz: (currentGridSize - 1) down to 0
                grid[currentGridSize - 1 - z][currentGridSize - 1 - y] = true;
            } else if (side === 'C') {
                // Top View: maps Z (col) vs Y (row) with bottom = Y+, top = Y-, left = Z-, right = Z+
                grid[x][currentGridSize - 1 - y] = true;
            }
        });
        return grid;
    }

    // Helper to get string key of cropped grid to prevent duplicate options under centering
    function getCroppedGridKey(gridData) {
        const gridSize = gridData.length;
        let minR = gridSize, maxR = -1, minC = gridSize, maxC = -1;
        let hasCells = false;
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (gridData[r][c]) {
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    hasCells = true;
                }
            }
        }
        if (!hasCells) return "";
        let subGrid = [];
        for (let r = minR; r <= maxR; r++) {
            subGrid.push(gridData[r].slice(minC, maxC + 1));
        }
        return JSON.stringify(subGrid);
    }

    function is2DGridConnected(gridData) {
        const gridSize = gridData.length;
        let startR = -1, startC = -1;
        let totalCells = 0;

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (gridData[r][c]) {
                    if (startR === -1) {
                        startR = r;
                        startC = c;
                    }
                    totalCells++;
                }
            }
        }

        if (totalCells === 0) return false;

        // Flood fill (allowing 8-way connectivity: horizontal, vertical, and diagonal)
        const visited = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
        const queue = [{ r: startR, c: startC }];
        visited[startR][startC] = true;
        let count = 0;

        const dirs = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
            { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
        ];

        while (queue.length > 0) {
            const curr = queue.shift();
            count++;
            for (let d of dirs) {
                const nr = curr.r + d.dr;
                const nc = curr.c + d.dc;
                if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
                    if (gridData[nr][nc] && !visited[nr][nc]) {
                        visited[nr][nc] = true;
                        queue.push({ r: nr, c: nc });
                    }
                }
            }
        }

        return count === totalCells;
    }

    // Generate incorrect projections for choices
    function generateIncorrectProjections(correctGrid) {
        let dist = [];
        const correctCroppedStr = getCroppedGridKey(correctGrid);
        const addedSet = new Set([correctCroppedStr]);

        function tryAdd(gridData) {
            if (!gridData) return false;
            // Ensure the grid is not completely empty
            let hasCells = false;
            for (let r = 0; r < gridData.length; r++) {
                for (let c = 0; c < gridData[r].length; c++) {
                    if (gridData[r][c]) hasCells = true;
                }
            }
            if (!hasCells) return false;

            // Enforce that all blocks are connected (no isolated parts)
            if (!is2DGridConnected(gridData)) return false;

            const croppedStr = getCroppedGridKey(gridData);
            if (!addedSet.has(croppedStr)) {
                dist.push(gridData);
                addedSet.add(croppedStr);
                return true;
            }
            return false;
        }

        // Try single-cell flips (exactly 1 cell difference)
        let singleFlipCandidates = [];
        for (let r = 0; r < currentGridSize; r++) {
            for (let c = 0; c < currentGridSize; c++) {
                let candidate = correctGrid.map(row => [...row]);
                candidate[r][c] = !candidate[r][c];
                singleFlipCandidates.push(candidate);
            }
        }
        // Shuffle single flips to get random distractors
        singleFlipCandidates = shuffle(singleFlipCandidates);
        for (let candidate of singleFlipCandidates) {
            tryAdd(candidate);
            if (dist.length >= 3) break;
        }

        // Fallback to 2-cell flips if we still don't have 3 distractors
        if (dist.length < 3) {
            let doubleFlipCandidates = [];
            for (let r1 = 0; r1 < currentGridSize; r1++) {
                for (let c1 = 0; c1 < currentGridSize; c1++) {
                    for (let r2 = r1; r2 < currentGridSize; r2++) {
                        for (let c2 = (r2 === r1 ? c1 + 1 : 0); c2 < currentGridSize; c2++) {
                            let candidate = correctGrid.map(row => [...row]);
                            candidate[r1][c1] = !candidate[r1][c1];
                            candidate[r2][c2] = !candidate[r2][c2];
                            doubleFlipCandidates.push(candidate);
                        }
                    }
                }
            }
            doubleFlipCandidates = shuffle(doubleFlipCandidates);
            for (let candidate of doubleFlipCandidates) {
                tryAdd(candidate);
                if (dist.length >= 3) break;
            }
        }

        // Absolute fallback (just in case)
        let attempts = 0;
        while (dist.length < 3 && attempts < 1000) {
            attempts++;
            let candidate = correctGrid.map(row => [...row]);
            let numFlips = rnd(1, 3);
            for (let f = 0; f < numFlips; f++) {
                let r = rnd(0, currentGridSize - 1);
                let c = rnd(0, currentGridSize - 1);
                candidate[r][c] = !candidate[r][c];
            }
            tryAdd(candidate);
        }

        return dist.slice(0, 3);
    }

    // --- Render Option Grids ---
    function render2DGridView(canvasEl, gridData, isCorrectHighlight = false, isWrongHighlight = false, isSelectedHighlight = false, sharedMaxDim = null) {
        const ctx2d = canvasEl.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.parentNode.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => render2DGridView(canvasEl, gridData, isCorrectHighlight, isWrongHighlight, isSelectedHighlight, sharedMaxDim));
            return;
        }
        
        canvasEl.width = rect.width * dpr;
        canvasEl.height = rect.height * dpr;
        ctx2d.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        ctx2d.clearRect(0, 0, w, h);

        const gridSize = gridData.length;

        // Find bounding box of occupied cells
        let minR = gridSize, maxR = -1, minC = gridSize, maxC = -1;
        let hasCells = false;
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (gridData[r][c]) {
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    hasCells = true;
                }
            }
        }

        if (!hasCells) return; // Empty projection (fallback)

        const numRows = maxR - minR + 1;
        const numCols = maxC - minC + 1;

        const gridMargin = 12;
        const cellSize = (Math.min(w, h) - gridMargin * 2) / (sharedMaxDim || Math.max(numRows, numCols));
        const startX = (w - cellSize * numCols) / 2;
        const startY = (h - cellSize * numRows) / 2;

        // Colors matching engineering drawing aesthetic with premium glow/accents
        let fillColor = 'rgba(6, 182, 212, 0.1)'; // Semi-transparent Cyan
        let strokeColor = 'rgba(6, 182, 212, 0.85)'; // Solid Cyan
        
        if (isCorrectHighlight) {
            fillColor = 'rgba(16, 185, 129, 0.15)'; // Green
            strokeColor = '#10b981';
        } else if (isWrongHighlight) {
            fillColor = 'rgba(244, 63, 94, 0.15)'; // Red
            strokeColor = '#f43f5e';
        } else if (isSelectedHighlight) {
            fillColor = 'rgba(59, 130, 246, 0.15)'; // Blue
            strokeColor = '#3b82f6';
        }

        ctx2d.lineWidth = 2.5;
        ctx2d.lineJoin = 'round';

        // Draw only occupied grid cells
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (gridData[r][c]) {
                    const cx = startX + (c - minC) * cellSize;
                    const cy = startY + (r - minR) * cellSize;

                    // Fill face
                    ctx2d.fillStyle = fillColor;
                    ctx2d.fillRect(cx, cy, cellSize, cellSize);

                    // Draw border of individual block face projection
                    ctx2d.strokeStyle = strokeColor;
                    ctx2d.strokeRect(cx, cy, cellSize, cellSize);
                }
            }
        }
    }

    function drawOptions() {
        optionsGrid.innerHTML = '';
        const userChoice = (isQuizMode || isReviewMode) && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;

        // Calculate shared max dimension across all options to ensure uniform scaling
        let sharedMaxDim = 1;
        optionsList.forEach(opt => {
            const gridSize = opt.length;
            let minR = gridSize, maxR = -1, minC = gridSize, maxC = -1;
            let hasCells = false;
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    if (opt[r][c]) {
                        if (r < minR) minR = r;
                        if (r > maxR) maxR = r;
                        if (c < minC) minC = c;
                        if (c > maxC) maxC = c;
                        hasCells = true;
                    }
                }
            }
            if (hasCells) {
                const numRows = maxR - minR + 1;
                const numCols = maxC - minC + 1;
                const maxDim = Math.max(numRows, numCols);
                if (maxDim > sharedMaxDim) {
                    sharedMaxDim = maxDim;
                }
            }
        });

        optionsList.forEach((opt, idx) => {
            const card = document.createElement('div');
            card.className = 'option-card';

            let isHighlightedCorrect = false;
            let isHighlightedWrong = false;
            let isHighlightedSelected = false;

            if (isReviewMode) {
                if (idx === correctOptionIndex) {
                    card.classList.add('correct');
                    isHighlightedCorrect = true;
                } else if (idx === userChoice) {
                    card.classList.add('wrong');
                    isHighlightedWrong = true;
                }
            } else if (isQuizMode) {
                if (idx === userChoice) {
                    card.classList.add('selected-exam');
                    isHighlightedSelected = true;
                }
            } else if (isAnswered) {
                if (idx === correctOptionIndex) {
                    card.classList.add('correct');
                    isHighlightedCorrect = true;
                } else if (idx === userPracticeAnswer) {
                    card.classList.add('wrong');
                    isHighlightedWrong = true;
                }
            }

            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65 + idx)}</span><canvas id="oblique-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            optionsGrid.appendChild(card);

            // Render option grid onto canvas
            requestAnimationFrame(() => {
                const canv = document.getElementById(`oblique-opt-canvas-${idx}`);
                if (canv) {
                    render2DGridView(canv, opt, isHighlightedCorrect, isHighlightedWrong, isHighlightedSelected, sharedMaxDim);
                }
            });
        });
    }

    // --- Init Game Round ---
    function initGame() {
        if (!active) return;

        const rect = canvas.parentNode.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(initGame);
            return;
        }

        isAnswered = false;
        userPracticeAnswer = null;
        yawAngle = 0;
        pitchAngle = 0;
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";

        let numBlocks;
        if (currentDifficulty === 'easy') {
            currentGridSize = 3;
            numBlocks = rnd(4, 6);
        } else if (currentDifficulty === 'medium') {
            currentGridSize = 4;
            numBlocks = rnd(7, 9);
        } else if (currentDifficulty === 'hard') {
            currentGridSize = 5;
            numBlocks = rnd(10, 13);
        } else { // 'vhard'
            currentGridSize = 6;
            numBlocks = rnd(15, 20);
        }
        voxelModel = generateVisibleModel(numBlocks, currentGridSize);
        
        // Select random target projection side A, B, or C
        targetSide = ['A', 'B', 'C'][rnd(0, 2)];
        
        const viewLabels = {
            'A': 'ภาพด้านหน้า (Front View)',
            'B': 'ภาพด้านข้าง (Side View)',
            'C': 'ภาพด้านบน (Top View)'
        };
        promptMsg.innerHTML = `จงวิเคราะห์ภาพฉาย 2 มิติที่ถูกต้องสำหรับ <b>${viewLabels[targetSide]}</b><br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${voxelModel.length} ลูก</small>`;

        const correctGrid = getOrthographicView(voxelModel, targetSide);
        const distractors = generateIncorrectProjections(correctGrid);

        correctOptionIndex = rnd(0, 3);
        optionsList = [];
        let dIdx = 0;
        for (let i = 0; i < 4; i++) {
            if (i === correctOptionIndex) {
                optionsList.push(correctGrid);
            } else {
                optionsList.push(distractors[dIdx++]);
            }
        }

        questionStartTime = Date.now();
        drawIsometricModel(canvas, voxelModel, targetSide);
        drawOptions();
    }

    function checkAnswer(idx, cardEl) {
        if (isAnswered || isReviewMode) return;

        if (isQuizMode) {
            isAnswered = true;
            quizQuestions[currentQIndex].userAnswer = idx;
            updateQuizNavigator();
            drawOptions();
            window.playSound('beep');
            setTimeout(() => {
                if (active && isQuizMode) {
                    handleNext();
                }
            }, 240);
            return;
        }

        isAnswered = true;
        userPracticeAnswer = idx;
        totalAttempts++;

        const isCorrect = (idx === correctOptionIndex);

        if (isCorrect) {
            window.playSound('correct');
            correctAttempts++;
            score += 10;
            cardEl.classList.add('correct');
            
            setTimeout(() => {
                if (active && isAnswered && !isQuizMode && !isReviewMode) {
                    isAnswered = false;
                    userPracticeAnswer = null;
                    drawOptions();
                    setTimeout(() => {
                        if (active && !isQuizMode && !isReviewMode) {
                            initGame();
                        }
                    }, 100);
                }
            }, 500);
        } else {
            window.playSound('wrong');
            cardEl.classList.add('wrong');

            // Draw correct highlight on option cards
            const cards = document.querySelectorAll('#obliqueview-options-grid .option-card');
            if (cards[correctOptionIndex]) cards[correctOptionIndex].classList.add('correct');
        }

        updateStats();
        drawOptions(); // Redraw canvases with green/red outlines
        
        nextBtn.innerText = "ข้อถัดไป ➔";
        nextBtn.className = "btn-action primary";
    }

    function updateStats() {
        scoreVal.innerText = score;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accVal.innerText = acc + "%";
    }

    // --- Timed Exam Flow ---
    function loadQuestion(idx) {
        currentQIndex = idx;
        const q = quizQuestions[idx];

        const rect = canvas.parentNode.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => loadQuestion(idx));
            return;
        }

        voxelModel = q.voxelModel;
        yawAngle = 0;
        pitchAngle = 0;
        targetSide = q.targetSide;
        correctOptionIndex = q.correctOptionIndex;
        optionsList = q.optionsList;
        isAnswered = false;

        currentGridSize = optionsList[0].length; // Auto-detect gridSize from cached options
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;

        const viewLabels = {
            'A': 'ภาพด้านหน้า (Front View)',
            'B': 'ภาพด้านข้าง (Side View)',
            'C': 'ภาพด้านบน (Top View)'
        };
        promptMsg.innerHTML = `จงวิเคราะห์ภาพฉาย 2 มิติที่ถูกต้องสำหรับ <b>${viewLabels[targetSide]}</b><br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${voxelModel.length} ลูก</small>`;

        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';

        updateQuizNavigator();
        drawIsometricModel(canvas, voxelModel, targetSide);
        drawOptions();

        questionStartTime = Date.now();
    }

    function goToQuestion(idx) {
        if (idx < 0 || idx >= maxQuizQ) return;
        if (quizQuestions[currentQIndex]) {
            quizQuestions[currentQIndex].timeSpent += (Date.now() - questionStartTime);
        }
        loadQuestion(idx);
    }

    function updateQuizNavigator() {
        quizNav.innerHTML = '';
        quizQuestions.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-nav-btn';
            if (idx === currentQIndex) btn.classList.add('active');
            if (q.userAnswer !== null) btn.classList.add('answered');
            btn.innerText = idx + 1;
            btn.onclick = () => goToQuestion(idx);
            quizNav.appendChild(btn);
        });
    }

    function handlePrev() {
        goToQuestion(currentQIndex - 1);
    }

    function handleNext() {
        if (isQuizMode) {
            if (currentQIndex === maxQuizQ - 1) {
                submitQuiz();
            } else {
                goToQuestion(currentQIndex + 1);
            }
            return;
        }
        initGame();
    }

    function submitQuiz() {
        const answeredCount = quizQuestions.filter(q => q.userAnswer !== null).length;
        const confirmMsg = answeredCount === maxQuizQ ?
            "คุณต้องการส่งกระดาษคำตอบใช่หรือไม่?" :
            `คุณตอบไปแล้ว ${answeredCount}/${maxQuizQ} ข้อ มีข้อที่ยังไม่ได้ทำอีก ${maxQuizQ - answeredCount} ข้อ ต้องการส่งคำตอบเลยหรือไม่?`;

        if (!confirm(confirmMsg)) return;
        finishExam();
    }

    function finishExam() {
        clearInterval(timerInterval);
        if (quizQuestions[currentQIndex]) {
            quizQuestions[currentQIndex].timeSpent += (Date.now() - questionStartTime);
        }

        let correct = 0;
        const historyDetails = quizQuestions.map((q, idx) => {
            const isCorrect = (q.userAnswer === q.correctOptionIndex);
            if (isCorrect) correct++;

            return {
                type: `ด้าน ${q.targetSide} (${currentDifficulty === 'easy' ? 'ง่าย' : currentDifficulty === 'medium' ? 'กลาง' : 'ยาก'})`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedQuestion: {
                    voxelModel: q.voxelModel,
                    targetSide: q.targetSide,
                    optionsList: q.optionsList,
                    correctOptionIndex: q.correctOptionIndex,
                    userAnswer: q.userAnswer
                }
            };
        });

        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';

        window.showQuizResult('obliqueview', correct, maxQuizQ, quizTimerCount, historyDetails, currentDifficulty);
    }

    function startQuiz() {
        isQuizMode = true;
        isReviewMode = false;
        quizTimerCount = 0;
        correctAttempts = 0;
        totalAttempts = 0;

        questVal.innerText = `1/${maxQuizQ}`;
        timerVal.innerText = "00:00";
        modeTag.innerText = `Timed Challenge (Complexity: ${currentDifficulty})`;

        if (currentDifficulty === 'easy') {
            currentGridSize = 3;
        } else if (currentDifficulty === 'medium') {
            currentGridSize = 4;
        } else if (currentDifficulty === 'hard') {
            currentGridSize = 5;
        } else { // 'vhard'
            currentGridSize = 6;
        }

        quizQuestions = [];
        for (let i = 0; i < maxQuizQ; i++) {
            let numBlocks;
            if (currentDifficulty === 'easy') {
                numBlocks = rnd(4, 6);
            } else if (currentDifficulty === 'medium') {
                numBlocks = rnd(7, 9);
            } else if (currentDifficulty === 'hard') {
                numBlocks = rnd(10, 13);
            } else { // 'vhard'
                numBlocks = rnd(15, 20);
            }
            let model = generateVisibleModel(numBlocks, currentGridSize);
            let side = ['A', 'B', 'C'][rnd(0, 2)];
            let correctGrid = getOrthographicView(model, side);
            let distractors = generateIncorrectProjections(correctGrid);

            let corrIdx = rnd(0, 3);
            let opts = [];
            let dIdx = 0;
            for (let o = 0; o < 4; o++) {
                if (o === corrIdx) {
                    opts.push(correctGrid);
                } else {
                    opts.push(distractors[dIdx++]);
                }
            }

            quizQuestions.push({
                voxelModel: model,
                targetSide: side,
                correctOptionIndex: corrIdx,
                optionsList: opts,
                userAnswer: null,
                timeSpent: 0
            });
        }

        document.querySelectorAll('#obliqueview-stage .q-only').forEach(el => el.style.display = 'block');
        quizNav.style.display = 'flex';

        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            quizTimerCount++;
            let m = Math.floor(quizTimerCount / 60).toString().padStart(2, '0');
            let s = (quizTimerCount % 60).toString().padStart(2, '0');
            timerVal.innerText = `${m}:${s}`;
        }, 1000);

        loadQuestion(0);
    }

    function exitQuizMode() {
        isQuizMode = false;
        isReviewMode = false;
        clearInterval(timerInterval);
        runModeSelect.value = 'practice';
        modeTag.innerText = "Free Practice";
        document.querySelectorAll('#obliqueview-stage .q-only').forEach(el => el.style.display = 'none');

        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';

        score = 0; totalAttempts = 0; correctAttempts = 0;
        updateStats();

        nextBtn.onclick = handleNext;
        initGame();
    }

    function toggleRunMode() {
        if (runModeSelect.value === 'quiz') {
            startQuiz();
        } else {
            exitQuizMode();
        }
    }

    // --- Quiz Review Mode ---
    function reviewQuestion(historyIndex) {
        const item = quizQuestions[historyIndex];
        if (!item) return;

        isReviewMode = true;
        isQuizMode = false;
        isAnswered = true;
        currentQIndex = historyIndex;

        const q = item;
        voxelModel = q.voxelModel;
        targetSide = q.targetSide;
        correctOptionIndex = q.correctOptionIndex;
        optionsList = q.optionsList;

        currentGridSize = optionsList[0].length; // Auto-detect gridSize from cached options
        questVal.innerText = `${historyIndex + 1}/${maxQuizQ}`;
        
        const viewLabels = {
            'A': 'ภาพด้านหน้า (Front View)',
            'B': 'ภาพด้านข้าง (Side View)',
            'C': 'ภาพด้านบน (Top View)'
        };
        promptMsg.innerHTML = `จงวิเคราะห์ภาพฉาย 2 มิติที่ถูกต้องสำหรับ <b>${viewLabels[targetSide]}</b><br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${voxelModel.length} ลูก</small>`;

        drawIsometricModel(canvas, voxelModel, targetSide);
        drawOptions();

        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action primary";
        nextBtn.onclick = () => {
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext;
        };
    }

    runModeSelect.addEventListener('change', toggleRunMode);
    difficultySelect.addEventListener('change', () => {
        currentDifficulty = difficultySelect.value;
        if (!isQuizMode) initGame();
    });

    prevBtn.onclick = handlePrev;
    nextBtn.onclick = handleNext;
    submitBtn.onclick = submitQuiz;

    // Keyboard bindings
    function handleKeyDown(e) {
        if (!active) return;
        const key = e.key.toLowerCase();

        if (isQuizMode) {
            if (e.key === 'ArrowLeft') {
                handlePrev();
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                handleNext();
                e.preventDefault();
            } else if (e.key === 'Enter' && e.ctrlKey) {
                submitQuiz();
                e.preventDefault();
            }
        }

        if (isAnswered && !isQuizMode && !isReviewMode) {
            if (e.key === ' ' || e.key === 'Enter') {
                handleNext();
                e.preventDefault();
                return;
            }
        }

        if (!isAnswered || isQuizMode) {
            let idx = -1;
            if (key === '1' || key === 'a') idx = 0;
            else if (key === '2' || key === 'b') idx = 1;
            else if (key === '3' || key === 'c') idx = 2;
            else if (key === '4' || key === 'd') idx = 3;

            if (idx >= 0 && idx < 4) {
                const cards = document.querySelectorAll('#obliqueview-options-grid .option-card');
                if (cards[idx]) checkAnswer(idx, cards[idx]);
            }
        }
    }

    // Drag Rotation Listeners disabled as requested
    /*
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !active) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        yawAngle += dx * 0.01;
        pitchAngle += dy * 0.01;

        drawIsometricModel(canvas, voxelModel, targetSide);
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Touch support for iPad
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging || !active || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - dragStartX;
        const dy = e.touches[0].clientY - dragStartY;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;

        yawAngle += dx * 0.01;
        pitchAngle += dy * 0.01;

        drawIsometricModel(canvas, voxelModel, targetSide);
    }, { passive: true });

    window.addEventListener('touchend', () => {
        isDragging = false;
    });
    */

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (active && !isReviewMode) {
                drawIsometricModel(canvas, voxelModel, targetSide);
                drawOptions();
            }
        }, 150);
    });

    return {
        start: function() {
            active = true;
            isReviewMode = false;

            document.getElementById('obliqueview-lobby').style.display = 'flex';
            document.getElementById('obliqueview-stage').style.display = 'none';

            const startBtnLobby = document.getElementById('obliqueview-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#obliqueview-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';

                runModeSelect.value = selectedMode;
                currentDifficulty = lobbyDiffSelect.value;
                difficultySelect.value = currentDifficulty;

                document.getElementById('obliqueview-lobby').style.display = 'none';
                document.getElementById('obliqueview-stage').style.display = 'flex';

                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };

            window.renderLobbyBestForEl(document.getElementById('obliqueview-lobby-best'), 'obliqueview');

            document.querySelectorAll('#obliqueview-lobby .lobby-mode-card').forEach(card => {
                card.onclick = () => {
                    document.querySelectorAll('#obliqueview-lobby .lobby-mode-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                };
            });
        },
        stop: function() {
            active = false;
            clearInterval(timerInterval);
        },
        review: reviewQuestion,
        handleKeyDown: handleKeyDown
    };
})();

window.ObliqueViewEngine = ObliqueViewEngine;
