const SkyAssembleEngine = (function() {
    let active = false;
    let canvas = document.getElementById('skyassemble-mission-canvas');
    let ctx = canvas.getContext('2d');
    
    // Game State
    let isAnswered = false;
    let isReviewMode = false;
    let score = 0, streak = 0;
    let totalAttempts = 0, correctAttempts = 0;
    
    let gameData = { baseShape: [], options: [], missionPacked: null, correctIndex: 0, mode: 'assemble' };
    let userPracticeAnswer = null; // Add user practice answer tracking
    
    // Quiz State
    let isQuizMode = false;
    let quizQCount = 1;
    let maxQuizQ = 20;
    let quizQuestions = []; // Cached questions list
    let currentQIndex = 0;
    let quizTimer = 0;
    let timerInterval = null;
    let questionStartTime = 0;
    
    // UI Selectors
    const runModeSelect = document.getElementById('sky-run-mode');
    const gameModeSelect = document.getElementById('sky-game-mode');
    const pieceCountSelect = document.getElementById('sky-piece-count');
    const linesToggle = document.getElementById('sky-lines-toggle'); // Fixed ID reference
    const nextBtn = document.getElementById('sky-next-btn');
    const scoreVal = document.getElementById('sky-score');
    const streakVal = document.getElementById('sky-streak');
    const accVal = document.getElementById('sky-accuracy');
    const questVal = document.getElementById('sky-quest');
    const timerVal = document.getElementById('sky-timer');
    const modeTag = document.getElementById('skyassemble-mode-tag');

    // Exam Nav Selectors
    const prevBtn = document.getElementById('sky-prev-btn');
    const submitBtn = document.getElementById('sky-submit-exam-btn');
    const quizNav = document.getElementById('skyassemble-quiz-navigator');
    
    // --- Convex Shapes Pool ---
    function getShapePool() {
        const createCircle = (r, steps = 32) => Array.from({length: steps}, (_, i) => [Math.cos(i*Math.PI*2/steps)*r, Math.sin(i*Math.PI*2/steps)*r]);
        const createEllipse = (rx, ry, steps = 32) => Array.from({length: steps}, (_, i) => [Math.cos(i*Math.PI*2/steps)*rx, Math.sin(i*Math.PI*2/steps)*ry]);
        const createHalfCircle = (r, steps = 18) => {
            let pts = [];
            for (let i = 0; i <= steps; i++) pts.push([Math.cos(i*Math.PI/steps)*r, Math.sin(i*Math.PI/steps)*r]);
            pts.push([-r, 0]); // close the diameter chord
            return pts;
        };

        return [
            [[-40,-40], [40,-40], [40,40], [-40,40]], // 0. Square
            [[-55,-30], [55,-30], [55,30], [-55,30]], // 1. Rectangle
            [[-40,-30], [50,-30], [40,30], [-50,30]], // 2. Parallelogram
            [[-25,-30], [25,-30], [45,30], [-45,30]], // 3. Trapezoid
            [[0,-45], [45,0], [0,45], [-45,0]],       // 4. Diamond
            Array.from({length:6}, (_, i) => [Math.cos(i*Math.PI/3)*42, Math.sin(i*Math.PI/3)*42]), // 5. Hexagon
            createCircle(42),                         // 6. Circle
            createEllipse(55, 30),                    // 7. Horizontal Ellipse
            createEllipse(30, 55),                    // 8. Vertical Ellipse
            Array.from({length:8}, (_, i) => [Math.cos(i*Math.PI/4)*42, Math.sin(i*Math.PI/4)*42]), // 9. Octagon
            [[0,-40], [40,35], [-40,35]],             // 10. Isosceles Triangle
            [[-35, -25], [-35, 25], [35, 25]],        // 11. Right Triangle
            createHalfCircle(40),                     // 12. Half-circle
            [[-20,-35], [20,-35], [40,5], [0,38], [-40,5]] // 13. House/Pentagon (Convex)
        ];
    }

    function polygonArea(pts) {
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            area += (pts[i][0] * pts[(i+1)%pts.length][1]) - (pts[(i+1)%pts.length][0] * pts[i][1]);
        }
        return Math.abs(area / 2);
    }

    function validateArea(base, frags) {
        let baseArea = polygonArea(base);
        let fragsArea = frags.reduce((sum, f) => sum + polygonArea(f), 0);
        return Math.abs(baseArea - fragsArea) < (baseArea * 0.015);
    }

    function splitPolygon(poly) {
        if (poly.length < 3) return [[], []];
        
        let cx = 0, cy = 0;
        poly.forEach(p => { cx += p[0]; cy += p[1]; });
        cx /= poly.length; cy /= poly.length;
        
        cx += (Math.random() - 0.5) * 4;
        cy += (Math.random() - 0.5) * 4;

        let angle = Math.random() * Math.PI * 2;
        let nx = Math.cos(angle), ny = Math.sin(angle);

        let p1 = [], p2 = [];
        for (let i = 0; i < poly.length; i++) {
            let curr = poly[i];
            let next = poly[(i+1)%poly.length];
            
            let d1 = (curr[0]-cx)*nx + (curr[1]-cy)*ny;
            let d2 = (next[0]-cx)*nx + (next[1]-cy)*ny;

            if (d1 >= -1e-5) p1.push(curr);
            if (d1 <= 1e-5) p2.push(curr);

            if ((d1 > 1e-5 && d2 < -1e-5) || (d1 < -1e-5 && d2 > 1e-5)) {
                let t = d1 / (d1 - d2);
                let ix = curr[0] + t * (next[0] - curr[0]);
                let iy = curr[1] + t * (next[1] - curr[1]);
                p1.push([ix, iy]); p2.push([ix, iy]);
            }
        }
        
        const cleanPoints = (pts) => {
            if (pts.length < 3) return [];
            let clean = [];
            for (let i = 0; i < pts.length; i++) {
                let curr = pts[i];
                let next = pts[(i+1)%pts.length];
                if (Math.hypot(curr[0]-next[0], curr[1]-next[1]) > 0.8) {
                    clean.push(curr);
                }
            }
            return clean;
        };

        return [cleanPoints(p1), cleanPoints(p2)];
    }

    function sliceShape(base, n) {
        let baseArea = polygonArea(base);
        let maxRetries = 120; 
        
        while (maxRetries-- > 0) {
            let frags = [base];
            let attempts = 0;
            while (frags.length < n && attempts < 60) {
                attempts++;
                frags.sort((a, b) => polygonArea(b) - polygonArea(a));
                let target = frags.shift();
                let res = splitPolygon(target);
                
                if (res[0].length >= 3 && res[1].length >= 3 && 
                    polygonArea(res[0]) > baseArea * 0.04 && 
                    polygonArea(res[1]) > baseArea * 0.04) {
                    frags.push(res[0], res[1]);
                } else { 
                    frags.push(target); 
                }
            }
            if (frags.length === n && validateArea(base, frags)) return frags; 
        }
        return [base];
    }

    function packInGrid(frags) {
        let boxes = [];
        let maxW = 0, maxH = 0;

        frags.forEach(f => {
            let rot = Math.random() * Math.PI * 2;
            let rotated = f.map(p => [p[0]*Math.cos(rot)-p[1]*Math.sin(rot), p[0]*Math.sin(rot)+p[1]*Math.cos(rot)]);
            let cx = 0, cy = 0;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            
            rotated.forEach(p => { 
                cx += p[0]; cy += p[1]; 
                if(p[0]<minX) minX=p[0]; if(p[0]>maxX) maxX=p[0];
                if(p[1]<minY) minY=p[1]; if(p[1]>maxY) maxY=p[1];
            });
            cx /= rotated.length; cy /= rotated.length;
            
            let centeredPts = rotated.map(p => [p[0] - cx, p[1] - cy]);
            let w = maxX - minX;
            let h = maxY - minY;
            
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;

            boxes.push({ pts: centeredPts, w, h });
        });

        let cols = Math.ceil(Math.sqrt(frags.length)); 
        let padding = 18; 
        let cellW = maxW + padding; 
        let cellH = maxH + padding; 

        boxes.forEach((b, i) => {
            let col = i % cols;
            let row = Math.floor(i / cols);
            let numColsInRow = Math.min(cols, frags.length - row * cols);
            
            let startX = -((numColsInRow - 1) * cellW) / 2;
            let startY = -((Math.ceil(frags.length / cols) - 1) * cellH) / 2;
            
            b.renderPos = [
                startX + col * cellW, 
                startY + row * cellH
            ];
        });
        
        return boxes;
    }

    // --- Canvas Rendering with Retina DPI Support ---
    function setupCanvas(targetCanvas) {
        const rect = targetCanvas.parentNode.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        targetCanvas.width = rect.width * dpr;
        targetCanvas.height = rect.height * dpr;
        const targetCtx = targetCanvas.getContext('2d');
        targetCtx.scale(dpr, dpr);
        return { w: rect.width, h: rect.height };
    }

    function getDrawingScale(mainDims, optDims) {
        let maxRadiusMain = 1;
        let maxRadiusOpt = 1;
        
        const activeMode = gameData.mode;
        
        if (activeMode === 'assemble') {
            // Main canvas draws packed frags
            if (gameData.missionPacked) {
                gameData.missionPacked.forEach(f => {
                    f.pts.forEach(p => {
                        let r = Math.hypot(f.renderPos[0] + p[0], f.renderPos[1] + p[1]);
                        if (r > maxRadiusMain) maxRadiusMain = r;
                    });
                });
            }
            // Options draw base shape
            if (gameData.options) {
                gameData.options.forEach(opt => {
                    opt.base.forEach(p => {
                        let r = Math.hypot(p[0], p[1]);
                        if (r > maxRadiusOpt) maxRadiusOpt = r;
                    });
                });
            }
        } else {
            // Main canvas draws base shape
            if (gameData.baseShape) {
                gameData.baseShape.forEach(p => {
                    let r = Math.hypot(p[0], p[1]);
                    if (r > maxRadiusMain) maxRadiusMain = r;
                });
            }
            // Options draw packed frags
            if (gameData.options) {
                gameData.options.forEach(opt => {
                    if (opt.packedFrags) {
                        opt.packedFrags.forEach(f => {
                            f.pts.forEach(p => {
                                let r = Math.hypot(f.renderPos[0] + p[0], f.renderPos[1] + p[1]);
                                if (r > maxRadiusOpt) maxRadiusOpt = r;
                            });
                        });
                    }
                });
            }
        }
        
        const scaleMain = (Math.min(mainDims.w, mainDims.h) * 0.45) / maxRadiusMain;
        const scaleOpt = (Math.min(optDims.w, optDims.h) * 0.45) / maxRadiusOpt;
        
        return Math.min(scaleMain, scaleOpt);
    }

    function drawMission() {
        if (!active) return;
        const dims = setupCanvas(canvas);
        ctx.clearRect(0, 0, dims.w, dims.h);
        ctx.lineJoin = 'round'; 
        ctx.lineCap = 'round';
        
        const showLines = linesToggle.querySelector('input').checked;
        const activeMode = gameData.mode;

        let optDims = { w: 120, h: 120 };
        const grid = document.getElementById('skyassemble-options-grid');
        if (grid) {
            const rect = grid.getBoundingClientRect();
            if (rect.width > 0) {
                let cellW = (rect.width - 15) / 2;
                let cellH = (rect.height - 15) / 2;
                optDims = { w: cellW, h: cellH };
            }
        }
        const scale = getDrawingScale(dims, optDims);

        ctx.save();
        ctx.translate(dims.w / 2, dims.h / 2); 

        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(0, 242, 254, 0.4)";

        if (activeMode === 'assemble') {
            gameData.missionPacked.forEach(f => {
                ctx.beginPath();
                ctx.moveTo((f.renderPos[0] + f.pts[0][0]) * scale, (f.renderPos[1] + f.pts[0][1]) * scale);
                f.pts.forEach(p => ctx.lineTo((f.renderPos[0] + p[0]) * scale, (f.renderPos[1] + p[1]) * scale));
                ctx.closePath();
                
                ctx.fillStyle = "rgba(0, 242, 254, 0.12)"; 
                ctx.fill();
                ctx.strokeStyle = "#00f2fe"; 
                ctx.lineWidth = 1.8; 
                ctx.stroke();
            });
        } else {
            ctx.beginPath();
            ctx.moveTo(gameData.baseShape[0][0] * scale, gameData.baseShape[0][1] * scale);
            gameData.baseShape.forEach(p => ctx.lineTo(p[0] * scale, p[1] * scale));
            ctx.closePath();
            
            ctx.fillStyle = "rgba(0, 242, 254, 0.12)"; 
            ctx.fill();
            ctx.strokeStyle = "#00f2fe"; 
            ctx.lineWidth = 1.8; 
            ctx.stroke();

            // Overlay cutting guides if enabled or after answering
            if (showLines || (isAnswered && !isQuizMode) || isReviewMode) {
                let correctOpt = gameData.options[gameData.correctIndex];
                if (correctOpt && correctOpt.frags) {
                    correctOpt.frags.forEach(f => {
                        ctx.beginPath();
                        ctx.moveTo(f[0][0] * scale, f[0][1] * scale);
                        f.forEach(p => ctx.lineTo(p[0] * scale, p[1] * scale));
                        ctx.closePath();
                        ctx.setLineDash([4, 4]); 
                        ctx.strokeStyle = "rgba(0, 242, 254, 0.85)"; 
                        ctx.lineWidth = 1.2;
                        ctx.stroke();
                        ctx.setLineDash([]);
                    });
                }
            }
        }
        ctx.restore();
    }

    function drawOptions() {
        const grid = document.getElementById('skyassemble-options-grid');
        grid.innerHTML = '';
        const showLines = linesToggle.querySelector('input').checked;
        const activeMode = gameData.mode;
        const userChoice = isQuizMode && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;

        gameData.options.forEach((opt, idx) => {
            const card = document.createElement('div'); 
            card.className = 'option-card';
            
            if (isReviewMode) {
                if (opt.isCorrect) {
                    card.classList.add('correct');
                } else if (idx === userChoice) {
                    card.classList.add('wrong');
                }
            } else if (isQuizMode) {
                if (idx === userChoice) {
                    card.classList.add('selected-exam');
                }
            } else if (isAnswered) {
                if (opt.isCorrect) {
                    card.classList.add('correct');
                } else if (idx === userPracticeAnswer) {
                    card.classList.add('wrong');
                }
            }
            
            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65+idx)}</span><canvas id="sky-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            grid.appendChild(card);
        });

        // Frame rendering
        requestAnimationFrame(() => {
            gameData.options.forEach((opt, idx) => {
                const opCanv = document.getElementById(`sky-opt-canvas-${idx}`);
                if (!opCanv) return;
                const dims = setupCanvas(opCanv);
                const octx = opCanv.getContext('2d');
                octx.lineJoin = 'round'; 
                octx.lineCap = 'round';
                
                octx.save();
                octx.translate(dims.w / 2, dims.h / 2);
                
                let isHighlightedCorrect = false;
                let isHighlightedSelected = false;
                let isHighlightedWrong = false;
                
                if (isReviewMode) {
                    if (opt.isCorrect) isHighlightedCorrect = true;
                    if (idx === userChoice) isHighlightedSelected = true;
                } else if (isQuizMode) {
                    if (idx === userChoice) isHighlightedSelected = true;
                } else if (isAnswered) {
                    if (opt.isCorrect) {
                        isHighlightedCorrect = true;
                    } else if (idx === userPracticeAnswer) {
                        isHighlightedWrong = true;
                    }
                }
                
                if (isHighlightedCorrect) {
                    octx.shadowBlur = 15;
                    octx.shadowColor = "rgba(16, 185, 129, 0.5)";
                } else if (isHighlightedWrong) {
                    octx.shadowBlur = 15;
                    octx.shadowColor = "rgba(244, 63, 94, 0.5)";
                } else if (isHighlightedSelected) {
                    octx.shadowBlur = 15;
                    octx.shadowColor = "rgba(59, 130, 246, 0.5)";
                } else {
                    octx.shadowBlur = 10;
                    octx.shadowColor = "rgba(0, 242, 254, 0.3)";
                }

                const mainDims = { w: canvas.parentNode.clientWidth, h: canvas.parentNode.clientHeight };
                const scale = getDrawingScale(mainDims, dims);

                if (activeMode === 'assemble') {
                    if (showLines || isHighlightedCorrect) {
                        octx.beginPath();
                        octx.moveTo(opt.base[0][0] * scale, opt.base[0][1] * scale);
                        opt.base.forEach(p => octx.lineTo(p[0] * scale, p[1] * scale));
                        octx.closePath();
                        
                        octx.fillStyle = isHighlightedCorrect ? "rgba(16, 185, 129, 0.18)" : (isHighlightedWrong ? "rgba(244, 63, 94, 0.18)" : (isHighlightedSelected ? "rgba(59, 130, 246, 0.18)" : "rgba(0, 242, 254, 0.12)"));
                        octx.fill();
                        octx.strokeStyle = isHighlightedCorrect ? "#10b981" : (isHighlightedWrong ? "#f43f5e" : (isHighlightedSelected ? "#3b82f6" : "#00f2fe")); 
                        octx.lineWidth = 2.0; 
                        octx.stroke();

                        if (opt.frags) {
                            opt.frags.forEach(f => {
                                octx.beginPath();
                                octx.moveTo(f[0][0] * scale, f[0][1] * scale);
                                f.forEach(p => octx.lineTo(p[0] * scale, p[1] * scale));
                                octx.closePath();
                                octx.setLineDash([4, 4]); 
                                octx.strokeStyle = isHighlightedCorrect ? "rgba(16, 185, 129, 0.7)" : (isHighlightedWrong ? "rgba(244, 63, 94, 0.7)" : (isHighlightedSelected ? "rgba(59, 130, 246, 0.7)" : "rgba(0, 242, 254, 0.7)")); 
                                octx.lineWidth = 1.0;
                                octx.stroke();
                                octx.setLineDash([]);
                            });
                        }
                    } else {
                        octx.beginPath();
                        octx.moveTo(opt.base[0][0] * scale, opt.base[0][1] * scale);
                        opt.base.forEach(p => octx.lineTo(p[0] * scale, p[1] * scale));
                        octx.closePath();
                        
                        octx.fillStyle = isHighlightedSelected ? "rgba(59, 130, 246, 0.18)" : "rgba(0, 242, 254, 0.12)"; 
                        octx.fill();
                        octx.strokeStyle = isHighlightedSelected ? "#3b82f6" : "#00f2fe";
                        octx.lineWidth = 2.0;
                        octx.stroke();
                    }
                } else {
                    opt.packedFrags.forEach(f => {
                        octx.beginPath();
                        octx.moveTo((f.renderPos[0] + f.pts[0][0]) * scale, (f.renderPos[1] + f.pts[0][1]) * scale);
                        f.pts.forEach(p => octx.lineTo((f.renderPos[0] + p[0]) * scale, (f.renderPos[1] + p[1]) * scale));
                        octx.closePath();
                        
                        octx.fillStyle = isHighlightedCorrect ? "rgba(16, 185, 129, 0.15)" : (isHighlightedSelected ? "rgba(59, 130, 246, 0.15)" : "rgba(0, 242, 254, 0.12)");
                        octx.fill();
                        octx.strokeStyle = isHighlightedCorrect ? "#10b981" : (isHighlightedSelected ? "#3b82f6" : "#00f2fe"); 
                        octx.lineWidth = 1.5;
                        octx.stroke();
                    });
                }
                octx.restore();
            });
        });
    }

    function initGame() {
        if (!active || isReviewMode) return;
        
        isAnswered = false;
        userPracticeAnswer = null;
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";
        
        let reqMode = gameModeSelect.value;
        let activeMode = reqMode;
        
        const container = canvas.parentNode;
        if (container.clientWidth === 0) {
            requestAnimationFrame(initGame);
            return;
        }

        const n = parseInt(pieceCountSelect.value);
        let baseShape = [];
        let rawFrags = [];
        let attempts = 0;
        
        while (attempts < 15) {
            attempts++;
            let pool = getShapePool().sort(() => Math.random() - 0.5);
            baseShape = pool[0];
            rawFrags = sliceShape(baseShape, n);
            if (rawFrags.length === n) {
                break;
            }
        }

        if (rawFrags.length < n) {
            baseShape = [[-40,-40], [40,-40], [40,40], [-40,40]];
            rawFrags = [];
            let w = 80 / n;
            for (let i = 0; i < n; i++) {
                let x0 = -40 + i * w;
                let x1 = -40 + (i + 1) * w;
                rawFrags.push([[x0, -40], [x1, -40], [x1, 40], [x0, 40]]);
            }
        }

        let missionPacked = packInGrid(rawFrags);

        let correctIdx = Math.floor(Math.random() * 4);
        let options = [];
        
        let transforms = [
            (p) => [p[0] * 1.25, p[1] * 0.75], // Stretch horizontal
            (p) => [p[0] * 0.75, p[1] * 1.25], // Stretch vertical
            (p) => [p[0] + p[1] * 0.25, p[1]], // Shear x
            (p) => [p[0], p[1] + p[0] * 0.25]  // Shear y
        ].sort(() => Math.random() - 0.5);
        
        let tIdx = 0;
        for (let i = 0; i < 4; i++) {
            if (i === correctIdx) {
                options.push({ 
                    base: baseShape, 
                    frags: rawFrags, 
                    packedFrags: missionPacked, 
                    isCorrect: true 
                });
            } else {
                let fn = transforms[tIdx++];
                let twistedBase = baseShape.map(p => fn(p));
                let twistedFrags = rawFrags.map(f => f.map(p => fn(p)));
                options.push({ 
                    base: twistedBase, 
                    frags: twistedFrags,
                    packedFrags: packInGrid(twistedFrags),
                    isCorrect: false 
                });
            }
        }
        
        gameData = {
            baseShape: baseShape,
            missionPacked: missionPacked,
            options: options,
            correctIndex: correctIdx,
            mode: activeMode
        };
        
        questionStartTime = Date.now();
        drawMission(); 
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

        if (isAnswered || isReviewMode) return;
        isAnswered = true;
        userPracticeAnswer = idx;
        totalAttempts++;
        
        const isCorrect = (idx === gameData.correctIndex);
        
        if (isCorrect) {
            playSound('correct');
            correctAttempts++;
            score += 10;
            streak++;
            cardEl.classList.add('correct');
            // Auto advance with clearing highlights first (Task 5)
            setTimeout(() => {
                if (active && isAnswered && !isQuizMode && !isReviewMode) {
                    isAnswered = false;
                    userPracticeAnswer = null;
                    drawOptions(); // Clear green border first
                    setTimeout(() => {
                        if (active && !isQuizMode && !isReviewMode) {
                            initGame();
                        }
                    }, 100);
                }
            }, 500);
        } else {
            playSound('wrong');
            streak = 0;
            window.showToast("WRONG");
            cardEl.classList.add('wrong');
            
            const cards = document.querySelectorAll('.option-card');
            cards[gameData.correctIndex].classList.add('correct');
        }
        
        updateStats();
        
        nextBtn.innerText = "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        drawMission();
        drawOptions();
    }

    function updateStats() {
        scoreVal.innerText = score;
        streakVal.innerText = streak;
        let acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accVal.innerText = acc + "%";
    }

    // --- Exam Mode Navigation System ---
    function loadQuestion(idx) {
        currentQIndex = idx;
        const q = quizQuestions[idx];
        
        gameData = q.gameData;
        isAnswered = false;
        
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        // Show/hide footer nav buttons
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();
        drawMission();
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
        if (!isAnswered) streak = 0;
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
            const isCorrect = (q.userAnswer === q.gameData.correctIndex);
            if (isCorrect) correct++;
            
            return {
                type: q.gameData.mode === 'assemble' ? 'ประกอบรูป' : 'แยกชิ้นส่วน',
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedData: JSON.parse(JSON.stringify(q.gameData)), // for reviews
                userAnswer: q.userAnswer
            };
        });
        
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        window.showQuizResult('skyassemble', correct, maxQuizQ, quizTimer, historyDetails);
    }

    function toggleRunMode() {
        if (runModeSelect.value === 'quiz') {
            startQuiz();
        } else {
            exitQuizMode();
        }
    }

    function startQuiz() {
        isQuizMode = true;
        isReviewMode = false;
        quizQCount = 1;
        quizTimer = 0;
        correctAttempts = 0;
        totalAttempts = 0;
        
        questVal.innerText = `1/${maxQuizQ}`;
        timerVal.innerText = "00:00";
        modeTag.innerText = "Timed Challenge (Quiz)";
        
        linesToggle.style.display = 'flex';
        // Keep user's selected checked state for the guidelines
        
        // Pre-cache all 20 questions
        quizQuestions = [];
        const n = parseInt(pieceCountSelect.value);
        const activeMode = gameModeSelect.value;
        
        for (let i = 0; i < maxQuizQ; i++) {
            let baseShape = [];
            let rawFrags = [];
            let attempts = 0;
            
            while (attempts < 15) {
                attempts++;
                let pool = getShapePool().sort(() => Math.random() - 0.5);
                baseShape = pool[0];
                rawFrags = sliceShape(baseShape, n);
                if (rawFrags.length === n) break;
            }
            
            if (rawFrags.length < n) {
                baseShape = [[-40,-40], [40,-40], [40,40], [-40,40]];
                rawFrags = [];
                let w = 80 / n;
                for (let o = 0; o < n; o++) {
                    let x0 = -40 + o * w;
                    let x1 = -40 + (o + 1) * w;
                    rawFrags.push([[x0, -40], [x1, -40], [x1, 40], [x0, 40]]);
                }
            }
            
            let missionPacked = packInGrid(rawFrags);
            let correctIdx = Math.floor(Math.random() * 4);
            let options = [];
            
            let transforms = [
                (p) => [p[0] * 1.25, p[1] * 0.75],
                (p) => [p[0] * 0.75, p[1] * 1.25],
                (p) => [p[0] + p[1] * 0.25, p[1]],
                (p) => [p[0], p[1] + p[0] * 0.25]
            ].sort(() => Math.random() - 0.5);
            
            let tIdx = 0;
            for (let o = 0; o < 4; o++) {
                if (o === correctIdx) {
                    options.push({
                        base: baseShape,
                        frags: rawFrags,
                        packedFrags: missionPacked,
                        isCorrect: true
                    });
                } else {
                    let fn = transforms[tIdx++];
                    let twistedBase = baseShape.map(p => fn(p));
                    let twistedFrags = rawFrags.map(f => f.map(p => fn(p)));
                    options.push({
                        base: twistedBase,
                        frags: twistedFrags,
                        packedFrags: packInGrid(twistedFrags),
                        isCorrect: false
                    });
                }
            }
            
            quizQuestions.push({
                gameData: {
                    baseShape,
                    missionPacked,
                    options,
                    correctIndex: correctIdx,
                    mode: activeMode
                },
                userAnswer: null,
                timeSpent: 0
            });
        }
        
        document.querySelectorAll('.q-only').forEach(el => el.style.display = 'block');
        quizNav.style.display = 'flex';
        
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            quizTimer++;
            let m = Math.floor(quizTimer / 60).toString().padStart(2, '0');
            let s = (quizTimer % 60).toString().padStart(2, '0');
            timerVal.innerText = `${m}:${s}`;
            playSound('timer');
        }, 1000);
        
        loadQuestion(0);
    }

    function exitQuizMode() {
        isQuizMode = false;
        isReviewMode = false;
        clearInterval(timerInterval);
        runModeSelect.value = 'practice';
        modeTag.innerText = "Free Practice";
        document.querySelectorAll('.q-only').forEach(el => el.style.display = 'none');
        
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
        linesToggle.style.display = 'flex';
        
        score = 0; streak = 0; totalAttempts = 0; correctAttempts = 0;
        updateStats();
        
        nextBtn.onclick = handleNext;
        
        initGame();
    }

    // --- Quiz Review Interface ---
    function reviewQuestion(historyIndex) {
        // Look up corresponding cached question details
        const item = quizQuestions[historyIndex];
        if (!item) return;

        isReviewMode = true;
        isQuizMode = false;
        isAnswered = true;
        
        gameData = JSON.parse(JSON.stringify(item.gameData));
        
        linesToggle.querySelector('input').checked = true; // Force lines on review
        document.getElementById('skyassemble-review-banner').style.display = 'block';
        
        drawMission();
        drawOptions();

        // Highlight correct options
        const cards = document.querySelectorAll('.option-card');
        cards[gameData.correctIndex].classList.add('review-correct');
        
        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action primary";
        nextBtn.onclick = () => {
            document.getElementById('skyassemble-review-banner').style.display = 'none';
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext; // Reset binding
        };
    }

    function exitReview() {
        isReviewMode = false;
        document.getElementById('skyassemble-review-banner').style.display = 'none';
        linesToggle.querySelector('input').checked = false;
        exitQuizMode();
    }

    // Event Bindings
    runModeSelect.addEventListener('change', toggleRunMode);
    gameModeSelect.addEventListener('change', () => { if(!isQuizMode) initGame(); });
    pieceCountSelect.addEventListener('change', () => { if(!isQuizMode) initGame(); });
    linesToggle.querySelector('input').addEventListener('change', () => { drawMission(); drawOptions(); });
    
    prevBtn.onclick = handlePrev;
    nextBtn.onclick = handleNext;
    submitBtn.onclick = submitQuiz;
    
    document.getElementById('skyassemble-review-banner').addEventListener('click', exitReview);

    // Resize optimization
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (active && !isReviewMode) {
                drawMission();
                drawOptions();
            }
        }, 150);
    });

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
                const cards = document.querySelectorAll('#skyassemble-options-grid .option-card');
                if (cards[idx]) {
                    checkAnswer(idx, cards[idx]);
                }
            }
        }
    }

    return {
        start: function() {
            active = true;
            isReviewMode = false;
            
            document.getElementById('skyassemble-lobby').style.display = 'flex';
            document.getElementById('skyassemble-stage').style.display = 'none';
            
            const startBtn = document.getElementById('skyassemble-start-lobby');
            startBtn.onclick = () => {
                const activeModeCard = document.querySelector('#skyassemble-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                gameModeSelect.value = document.getElementById('lobby-sky-game-mode').value;
                pieceCountSelect.value = document.getElementById('lobby-sky-piece-count').value;
                
                document.getElementById('skyassemble-lobby').style.display = 'none';
                document.getElementById('skyassemble-stage').style.display = 'flex';
                
                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };
        },
        stop: function() {
            active = false;
            isReviewMode = false;
            clearInterval(timerInterval);
        },
        review: reviewQuestion,
        handleKeyDown: handleKeyDown
    };
})();

// Attach to window explicitly for global access
window.SkyAssembleEngine = SkyAssembleEngine;
