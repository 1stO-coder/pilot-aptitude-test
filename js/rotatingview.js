const RotatingViewEngine = (function() {
    let active = false;
    let canvas = document.getElementById('rotatingview-canvas');
    let ctx = canvas.getContext('2d');
    let gameTimer = null;

    // States
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let questionStartTime = 0;
    let currentDifficulty = 'easy';

    // 3D Drag Rotation States
    let yawAngle = 0;
    let pitchAngle = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // Game data
    let targetModel = []; // Voxel array of target
    let preRotatedTarget = []; // Pre-rotated target model
    let correctOptionIndex = 0;
    let optionsList = []; // Array of rotated voxel grids
    let userPracticeAnswer = null;

    // Quiz state
    let isQuizMode = false;
    let maxQuizQ = 20;
    let quizQuestions = [];
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;

    // Selectors
    const runModeSelect = document.getElementById('rotating-run-mode');
    const difficultySelect = document.getElementById('rotating-difficulty');
    const lobbyDiffSelect = document.getElementById('lobby-rotating-difficulty');
    const optionsGrid = document.getElementById('rotatingview-options-grid');
    const nextBtn = document.getElementById('rotating-next-btn');
    const prevBtn = document.getElementById('rotating-prev-btn');
    const submitBtn = document.getElementById('rotating-submit-exam-btn');
    const quizNav = document.getElementById('rotatingview-quiz-navigator');

    const scoreVal = document.getElementById('rotating-score');
    const accVal = document.getElementById('rotating-accuracy');
    const questVal = document.getElementById('rotating-quest');
    const timerVal = document.getElementById('rotating-timer');
    const modeTag = document.getElementById('rotating-mode-tag');

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

    function normalizeModel(blocks) {
        if (!blocks || blocks.length === 0) return [];
        const xs = blocks.map(b => b.x);
        const ys = blocks.map(b => b.y);
        const zs = blocks.map(b => b.z);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const minZ = Math.min(...zs);
        return blocks.map(b => ({
            x: b.x - minX,
            y: b.y - minY,
            z: b.z - minZ
        }));
    }

    function isVoxelHidden(x, y, z, voxelSet) {
        // Check if covered by a voxel directly in front along the diagonal line of sight (d > 0)
        for (let d = 1; d <= 8; d++) {
            if (voxelSet.has(`${x + d},${y + d},${z + d}`)) {
                return true;
            }
        }
        
        // Check Top Face occlusion: exists d >= 0 with (x+d, y+d, z+d+1)
        let topOccluded = false;
        for (let d = 0; d <= 8; d++) {
            if (voxelSet.has(`${x + d},${y + d},${z + d + 1}`)) {
                topOccluded = true;
                break;
            }
        }
        
        // Check Left Face occlusion: exists d >= 0 with (x+d, y+d+1, z+d)
        let leftOccluded = false;
        for (let d = 0; d <= 8; d++) {
            if (voxelSet.has(`${x + d},${y + d + 1},${z + d}`)) {
                leftOccluded = true;
                break;
            }
        }
        
        // Check Right Face occlusion: exists d >= 0 with (x+d+1, y+d, z+d)
        let rightOccluded = false;
        for (let d = 0; d <= 8; d++) {
            if (voxelSet.has(`${x + d + 1},${y + d},${z + d}`)) {
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

    function generateQuestionData(difficulty) {
        const numBlocks = (difficulty === 'easy') ? rnd(4, 5) : 
                          (difficulty === 'medium') ? rnd(6, 8) : 
                          (difficulty === 'hard') ? rnd(9, 12) : 
                          rnd(16, 20); // 'vhard'
                          
        const gridSize = (difficulty === 'easy' || difficulty === 'medium') ? 3 : 4;
        
        let targetModel = [];
        let preRotatedTarget = [];
        let targetRot = null;
        let correctOption = null;
        
        let attempts = 0;
        let found = false;
        
        while (!found && attempts < 1000) {
            attempts++;
            
            let candidateModel = normalizeModel(generateConnectedBlocks(numBlocks, gridSize));
            let rotA = getRandom3DRotation();
            let rotB = getRandom3DRotation();
            
            let preTarget = rotateVoxelModel(candidateModel, rotA.rx, rotA.ry, rotA.rz);
            let corrOpt = rotateVoxelModel(candidateModel, rotB.rx, rotB.ry, rotB.rz);
            
            let visTarget = countVisibleVoxels(preTarget);
            let visCorr = countVisibleVoxels(corrOpt);
            
            if (visTarget === visCorr) {
                let maxHiddenAllowed = (difficulty === 'vhard') ? (numBlocks - 13) : 0;
                if (maxHiddenAllowed < 0) maxHiddenAllowed = 0;
                
                let hiddenTarget = numBlocks - visTarget;
                if (hiddenTarget <= maxHiddenAllowed) {
                    targetModel = candidateModel;
                    preRotatedTarget = preTarget;
                    targetRot = rotA;
                    correctOption = corrOpt;
                    found = true;
                }
            }
        }
        
        if (!found) {
            let candidateModel = normalizeModel(generateConnectedBlocks(numBlocks, gridSize));
            targetModel = candidateModel;
            targetRot = getRandom3DRotation();
            preRotatedTarget = rotateVoxelModel(targetModel, targetRot.rx, targetRot.ry, targetRot.rz);
            
            let foundCorr = false;
            let targetVis = countVisibleVoxels(preRotatedTarget);
            for (let i = 0; i < 50; i++) {
                let rot = getRandom3DRotation();
                let candidateCorr = rotateVoxelModel(targetModel, rot.rx, rot.ry, rot.rz);
                if (countVisibleVoxels(candidateCorr) === targetVis) {
                    correctOption = candidateCorr;
                    foundCorr = true;
                    break;
                }
            }
            if (!foundCorr) {
                correctOption = rotateVoxelModel(targetModel, targetRot.rx, targetRot.ry, targetRot.rz);
            }
        }
        
        // Distractors
        let distractors = [];
        let attemptsDist = 0;
        let targetVis = countVisibleVoxels(preRotatedTarget);
        
        while (distractors.length < 3 && attemptsDist < 1000) {
            attemptsDist++;
            let candidate = createDistractorModel(targetModel, difficulty);

            if (candidate && !isIsomorphic(targetModel, candidate)) {
                let rotatedCandidate = null;
                // If attemptsDist > 500, we relax the visible voxel count constraint to be more robust
                const matchVis = (attemptsDist <= 500);

                for (let rAttempt = 0; rAttempt < 30; rAttempt++) {
                    let rot = getRandom3DRotation();
                    let tempRot = rotateVoxelModel(candidate, rot.rx, rot.ry, rot.rz);
                    if (!matchVis || countVisibleVoxels(tempRot) === targetVis) {
                        rotatedCandidate = tempRot;
                        break;
                    }
                }
                
                if (rotatedCandidate) {
                    let unique = true;
                    for (let d of distractors) {
                        if (isIsomorphic(d.base, candidate)) {
                            unique = false;
                            break;
                        }
                    }
                    if (unique) {
                        distractors.push({
                            base: candidate,
                            rotated: rotatedCandidate
                        });
                    }
                }
            }
        }
        
        // Robust fallback: if we still don't have 3 distractors, generate by shifting targetModel again, disregarding uniqueness
        while (distractors.length < 3) {
            let candidate = createDistractorModel(targetModel, difficulty);
            let rot = getRandom3DRotation();
            let rotatedCandidate = rotateVoxelModel(candidate, rot.rx, rot.ry, rot.rz);
            
            let unique = true;
            for (let d of distractors) {
                if (getVoxelModelKey(d.base) === getVoxelModelKey(candidate)) {
                    unique = false;
                    break;
                }
            }
            if (unique || distractors.length === 0) {
                distractors.push({
                    base: candidate,
                    rotated: rotatedCandidate
                });
            } else {
                distractors.push({
                    base: candidate,
                    rotated: rotatedCandidate
                });
            }
        }
        
        const correctOptionIndex = rnd(0, 3);
        let optionsList = [];
        let dIdx = 0;
        for (let i = 0; i < 4; i++) {
            if (i === correctOptionIndex) {
                optionsList.push(correctOption);
            } else {
                optionsList.push(distractors[dIdx++].rotated);
            }
        }
        
        return {
            targetModel: targetModel,
            preRotatedTarget: preRotatedTarget,
            correctOptionIndex: correctOptionIndex,
            optionsList: optionsList
        };
    }

    // --- Connected Voxel Generator ---
    function generateConnectedBlocks(numBlocks, gridSize = 3) {
        const start = Math.floor(gridSize / 2);
        let blocks = [{ x: start, y: start, z: 0 }];
        let blockSet = new Set([`${start},${start},0`]);

        const dirs = [
            { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
        ];

        while (blocks.length < numBlocks) {
            const parent = blocks[Math.floor(Math.random() * blocks.length)];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];

            const nx = parent.x + dir.dx;
            const ny = parent.y + dir.dy;
            const nz = parent.z + dir.dz;

            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && nz >= 0 && nz < gridSize) {
                const key = `${nx},${ny},${nz}`;
                if (!blockSet.has(key)) {
                    if (nz === 0 || blockSet.has(`${nx},${ny},${nz-1}`)) {
                        blocks.push({ x: nx, y: ny, z: nz });
                        blockSet.add(key);
                    }
                }
            }
        }
        return blocks;
    }

    // --- 3D Rotation Matrix Math ---
    function rotateVoxelModel(blocks, rx, ry, rz) {
        let rotated = blocks.map(b => {
            let x = b.x - 1;
            let y = b.y - 1;
            let z = b.z - 1;

            // X-axis Rotation
            if (rx !== 0) {
                const cos = Math.round(Math.cos(rx));
                const sin = Math.round(Math.sin(rx));
                const ny = y * cos - z * sin;
                const nz = y * sin + z * cos;
                y = ny; z = nz;
            }
            // Y-axis Rotation
            if (ry !== 0) {
                const cos = Math.round(Math.cos(ry));
                const sin = Math.round(Math.sin(ry));
                const nx = x * cos + z * sin;
                const nz = -x * sin + z * cos;
                x = nx; z = nz;
            }
            // Z-axis Rotation
            if (rz !== 0) {
                const cos = Math.round(Math.cos(rz));
                const sin = Math.round(Math.sin(rz));
                const nx = x * cos - y * sin;
                const ny = x * sin + y * cos;
                x = nx; y = ny;
            }
            return { x, y, z };
        });

        // Bounding box mapping for alignment
        const xs = rotated.map(b => b.x);
        const ys = rotated.map(b => b.y);
        const zs = rotated.map(b => b.z);
        
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const minZ = Math.min(...zs);

        // Normalize points inside bounds [0, 2]
        return rotated.map(b => ({
            x: b.x - minX,
            y: b.y - minY,
            z: b.z - minZ
        }));
    }

    // Generate random 90-degree 3D rotation parameters
    function getRandom3DRotation() {
        const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        return {
            rx: angles[rnd(0, 3)],
            ry: angles[rnd(0, 3)],
            rz: angles[rnd(0, 3)]
        };
    }

    function getVoxelModelKey(blocks) {
        const sorted = [...blocks].sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            if (a.y !== b.y) return a.y - b.y;
            return a.z - b.z;
        });
        return sorted.map(b => `${b.x},${b.y},${b.z}`).join(';');
    }

    function isIsomorphic(modelA, modelB) {
        const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        const keyA = getVoxelModelKey(modelA);
        
        for (let rx of angles) {
            for (let ry of angles) {
                for (let rz of angles) {
                    const rotatedB = rotateVoxelModel(modelB, rx, ry, rz);
                    if (getVoxelModelKey(rotatedB) === keyA) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function isModelConnected(blocks) {
        if (blocks.length <= 1) return true;
        const blockSet = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`));
        const visited = new Set();
        const queue = [blocks[0]];
        visited.add(`${blocks[0].x},${blocks[0].y},${blocks[0].z}`);

        const dirs = [
            { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
        ];

        let count = 0;
        while (queue.length > 0) {
            const curr = queue.shift();
            count++;
            for (let d of dirs) {
                const nx = curr.x + d.dx;
                const ny = curr.y + d.dy;
                const nz = curr.z + d.dz;
                const key = `${nx},${ny},${nz}`;
                if (blockSet.has(key) && !visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: nx, y: ny, z: nz });
                }
            }
        }
        return count === blocks.length;
    }

    function shiftOneBlock(blocks, gridSize) {
        let modified = JSON.parse(JSON.stringify(blocks));
        let removableIndices = [];
        for (let i = 0; i < modified.length; i++) {
            const temp = modified.filter((_, idx) => idx !== i);
            if (isModelConnected(temp)) {
                removableIndices.push(i);
            }
        }

        if (removableIndices.length === 0) return null;

        let shuffledIndices = shuffle(removableIndices);
        const dirs = [
            { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 }
        ];

        for (let removeIdx of shuffledIndices) {
            const baseModel = modified.filter((_, idx) => idx !== removeIdx);
            const blockSet = new Set(baseModel.map(b => `${b.x},${b.y},${b.z}`));

            let shuffledParents = shuffle(baseModel);
            let shuffledDirs = shuffle(dirs);

            for (let parent of shuffledParents) {
                for (let dir of shuffledDirs) {
                    const nx = parent.x + dir.dx;
                    const ny = parent.y + dir.dy;
                    const nz = parent.z + dir.dz;

                    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && nz >= 0 && nz < gridSize) {
                        const key = `${nx},${ny},${nz}`;
                        if (!blockSet.has(key) && (nz === 0 || blockSet.has(`${nx},${ny},${nz-1}`))) {
                            const candidate = [...baseModel, { x: nx, y: ny, z: nz }];
                            return normalizeModel(candidate);
                        }
                    }
                }
            }
        }
        return null;
    }

    // Create modified distractor models (preserving block count via block-shifting)
    // For easy mode: exactly 1 shift (difference = 1 block)
    // For other modes: 1 or 2 shifts (difference = 1-2 blocks)
    function createDistractorModel(originalBlocks, difficulty) {
        const gridSize = (difficulty === 'easy' || difficulty === 'medium') ? 3 : 4;
        const maxShifts = (difficulty === 'easy') ? 1 : (Math.random() < 0.5 ? 1 : 2);
        
        let currentModel = normalizeModel(originalBlocks);
        
        for (let attempt = 0; attempt < 30; attempt++) {
            let model = JSON.parse(JSON.stringify(currentModel));
            let shiftsPerformed = 0;
            let success = true;
            
            for (let s = 0; s < maxShifts; s++) {
                let nextModel = shiftOneBlock(model, gridSize);
                if (nextModel) {
                    model = nextModel;
                    shiftsPerformed++;
                } else {
                    success = false;
                    break;
                }
            }
            
            if (success && shiftsPerformed > 0) {
                if (!isIsomorphic(originalBlocks, model)) {
                    return model;
                }
            }
        }
        
        // Fallback: try 1-block shift if 2-block shift failed/was requested but is isomorphic
        for (let attempt = 0; attempt < 30; attempt++) {
            let nextModel = shiftOneBlock(currentModel, gridSize);
            if (nextModel && !isIsomorphic(originalBlocks, nextModel)) {
                return nextModel;
            }
        }
        
        // Final fallback: just returns any shifted model even if isomorphic
        let fallbackModel = shiftOneBlock(currentModel, gridSize);
        if (fallbackModel) return fallbackModel;
        return currentModel;
    }

    // --- 3D Isometric Renderer ---
    function drawIsometricModel(targetCanvas, blocks, isCorrectOutline = false, isWrongOutline = false, isSelectedOutline = false) {
        const targetCtx = targetCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = targetCanvas.parentNode.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => drawIsometricModel(targetCanvas, blocks, isCorrectOutline, isWrongOutline, isSelectedOutline));
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
                    depth: rx2 + ry2 + rz2
                };
            });
            // Sort depth-wise: back to front
            renderedCubes.sort((a, b) => a.depth - b.depth);
        } else {
            // Default isometric sorting: depth = x + y + z relative to center
            renderedCubes = blocks.map(b => {
                const rx = b.x - cx;
                const ry = b.y - cy;
                const rz = b.z - cz;
                return {
                    x: rx,
                    y: ry,
                    z: rz,
                    depth: rx + ry + rz
                };
            });
            renderedCubes.sort((a, b) => a.depth - b.depth);
        }

        // Dynamic scale
        const size = Math.min(cw, ch) * 0.13;
        const ox = cw / 2;
        const oy = ch / 2;

        // Styling based on feedback
        let topColor = '#a5f3fc';
        let leftColor = '#06b6d4';
        let rightColor = '#0e7490';
        let strokeColor = 'rgba(9, 9, 11, 0.4)';

        if (isCorrectOutline) {
            topColor = '#a7f3d0'; // Green hue
            leftColor = '#10b981';
            rightColor = '#047857';
            strokeColor = '#10b981';
        } else if (isWrongOutline) {
            topColor = '#fecdd3'; // Red hue
            leftColor = '#f43f5e';
            rightColor = '#be123c';
            strokeColor = '#f43f5e';
        } else if (isSelectedOutline) {
            topColor = '#bfdbfe'; // Blue hue
            leftColor = '#3b82f6';
            rightColor = '#1d4ed8';
            strokeColor = '#3b82f6';
        }

        // Render cubes
        renderedCubes.forEach(b => {
            const sx = ox + (b.x - b.y) * 0.866 * size;
            const sy = oy + (b.x + b.y) * 0.5 * size - b.z * size;

            // Top Face
            targetCtx.beginPath();
            targetCtx.moveTo(sx, sy - size);
            targetCtx.lineTo(sx + 0.866 * size, sy - 0.5 * size);
            targetCtx.lineTo(sx, sy);
            targetCtx.lineTo(sx - 0.866 * size, sy - 0.5 * size);
            targetCtx.closePath();
            targetCtx.fillStyle = topColor;
            targetCtx.fill();
            targetCtx.strokeStyle = strokeColor;
            targetCtx.lineWidth = 1;
            targetCtx.stroke();

            // Left Face
            targetCtx.beginPath();
            targetCtx.moveTo(sx - 0.866 * size, sy - 0.5 * size);
            targetCtx.lineTo(sx, sy);
            targetCtx.lineTo(sx, sy + size);
            targetCtx.lineTo(sx - 0.866 * size, sy + 0.5 * size);
            targetCtx.closePath();
            targetCtx.fillStyle = leftColor;
            targetCtx.fill();
            targetCtx.strokeStyle = strokeColor;
            targetCtx.lineWidth = 1;
            targetCtx.stroke();

            // Right Face
            targetCtx.beginPath();
            targetCtx.moveTo(sx, sy);
            targetCtx.lineTo(sx + 0.866 * size, sy - 0.5 * size);
            targetCtx.lineTo(sx + 0.866 * size, sy + 0.5 * size);
            targetCtx.lineTo(sx, sy + size);
            targetCtx.closePath();
            targetCtx.fillStyle = rightColor;
            targetCtx.fill();
            targetCtx.strokeStyle = strokeColor;
            targetCtx.lineWidth = 1;
            targetCtx.stroke();
        });

    }

    // --- Render Option List ---
    function drawOptions() {
        optionsGrid.innerHTML = '';
        const userChoice = (isQuizMode || isReviewMode) && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;

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

            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65 + idx)}</span><canvas id="rotating-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            optionsGrid.appendChild(card);

            // Render option 3D model
            requestAnimationFrame(() => {
                const canv = document.getElementById(`rotating-opt-canvas-${idx}`);
                if (canv) {
                    drawIsometricModel(canv, opt, isHighlightedCorrect, isHighlightedWrong, isHighlightedSelected);
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

        const qData = generateQuestionData(currentDifficulty);
        targetModel = qData.targetModel;
        correctOptionIndex = qData.correctOptionIndex;
        optionsList = qData.optionsList;
        preRotatedTarget = qData.preRotatedTarget;

        // Update description with block count
        const descEl = document.querySelector('#view-rotatingview .rotating-desc');
        if (descEl) {
            descEl.innerHTML = `จงค้นหาว่าบล็อกต้นแบบทางซ้ายคือรูปทรงใดใน 4 ตัวเลือกด้านล่างที่ผ่านการหมุนทิศทาง<br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${targetModel.length} ลูก</small>`;
        }

        questionStartTime = Date.now();
        drawIsometricModel(canvas, preRotatedTarget);
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
            window.showToast("WRONG");
            cardEl.classList.add('wrong');

            const cards = document.querySelectorAll('#rotatingview-options-grid .option-card');
            if (cards[correctOptionIndex]) cards[correctOptionIndex].classList.add('correct');
        }

        updateStats();
        drawOptions();

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

        targetModel = q.targetModel;
        preRotatedTarget = q.preRotatedTarget;
        correctOptionIndex = q.correctOptionIndex;
        optionsList = q.optionsList;
        isAnswered = false;
        yawAngle = 0;
        pitchAngle = 0;

        questVal.innerText = `${idx + 1}/${maxQuizQ}`;

        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';

        updateQuizNavigator();
        drawIsometricModel(canvas, q.preRotatedTarget);
        drawOptions();

        // Update description with block count
        const descEl = document.querySelector('#view-rotatingview .rotating-desc');
        if (descEl) {
            descEl.innerHTML = `จงค้นหาว่าบล็อกต้นแบบทางซ้ายคือรูปทรงใดใน 4 ตัวเลือกด้านล่างที่ผ่านการหมุนทิศทาง<br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${targetModel.length} ลูก</small>`;
        }

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
                type: `หมุนบล็อก (${currentDifficulty === 'easy' ? 'ง่าย' : currentDifficulty === 'medium' ? 'กลาง' : 'ยาก'})`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedQuestion: {
                    targetModel: q.targetModel,
                    preRotatedTarget: q.preRotatedTarget,
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

        window.showQuizResult('rotatingview', correct, maxQuizQ, quizTimerCount, historyDetails, currentDifficulty);
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

        quizQuestions = [];
        for (let i = 0; i < maxQuizQ; i++) {
            const qData = generateQuestionData(currentDifficulty);
            quizQuestions.push({
                targetModel: qData.targetModel,
                preRotatedTarget: qData.preRotatedTarget,
                correctOptionIndex: qData.correctOptionIndex,
                optionsList: qData.optionsList,
                userAnswer: null,
                timeSpent: 0
            });
        }

        document.querySelectorAll('#rotatingview-stage .q-only').forEach(el => el.style.display = 'block');
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
        document.querySelectorAll('#rotatingview-stage .q-only').forEach(el => el.style.display = 'none');

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

        const q = item.savedQuestion;
        targetModel = q.targetModel;
        preRotatedTarget = q.preRotatedTarget;
        correctOptionIndex = q.correctOptionIndex;
        optionsList = q.optionsList;

        questVal.innerText = `${historyIndex + 1}/${maxQuizQ}`;

        // Update description with block count
        const descEl = document.querySelector('#view-rotatingview .rotating-desc');
        if (descEl) {
            descEl.innerHTML = `จงค้นหาว่าบล็อกต้นแบบทางซ้ายคือรูปทรงใดใน 4 ตัวเลือกด้านล่างที่ผ่านการหมุนทิศทาง<br><small style="color: var(--text-dim);">บล็อกไม้นี้ประกอบด้วยบล็อกจำนวน ${targetModel.length} ลูก</small>`;
        }

        drawIsometricModel(canvas, q.preRotatedTarget);
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
                const cards = document.querySelectorAll('#rotatingview-options-grid .option-card');
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

        const currentTarget = isQuizMode ? (quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].preRotatedTarget : preRotatedTarget) : preRotatedTarget;
        drawIsometricModel(canvas, currentTarget);
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

        const currentTarget = isQuizMode ? (quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].preRotatedTarget : preRotatedTarget) : preRotatedTarget;
        drawIsometricModel(canvas, currentTarget);
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
                drawIsometricModel(canvas, preRotatedTarget);
                drawOptions();
            }
        }, 150);
    });

    return {
        start: function() {
            active = true;
            isReviewMode = false;

            document.getElementById('rotatingview-lobby').style.display = 'flex';
            document.getElementById('rotatingview-stage').style.display = 'none';

            const startBtnLobby = document.getElementById('rotatingview-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#rotatingview-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';

                runModeSelect.value = selectedMode;
                currentDifficulty = lobbyDiffSelect.value;
                difficultySelect.value = currentDifficulty;

                document.getElementById('rotatingview-lobby').style.display = 'none';
                document.getElementById('rotatingview-stage').style.display = 'flex';

                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };

            window.renderLobbyBestForEl(document.getElementById('rotatingview-lobby-best'), 'rotatingview');

            document.querySelectorAll('#rotatingview-lobby .lobby-mode-card').forEach(card => {
                card.onclick = () => {
                    document.querySelectorAll('#rotatingview-lobby .lobby-mode-card').forEach(c => c.classList.remove('active'));
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

window.RotatingViewEngine = RotatingViewEngine;
