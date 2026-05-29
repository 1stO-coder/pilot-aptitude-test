const HiddenImageEngine = (function() {
    let active = false;
    let canvas = document.getElementById('hiddenimage-canvas');
    let ctx = canvas.getContext('2d');
    let gameTimer = null;
    
    // States
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let questionStartTime = 0;
    
    // Geometry values
    let targetShapeIndex = 0;
    let correctOptionIndex = 0;
    let embeddedPolygon = []; // Actual translated/rotated points of hidden shape
    let backgroundLines = [];  // Array of [p1, p2] lines forming the distractor noise
    let backgroundCircles = []; // Circular distractor noise
    let optionsList = [];      // 4 shapes candidates
    let userPracticeAnswer = null; // Add user practice answer tracking
    
    // Quiz State
    let isQuizMode = false;
    let quizQCount = 1;
    let maxQuizQ = 20;
    let quizQuestions = []; // Cached questions list
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;

    // UI Selectors
    const runModeSelect = document.getElementById('hidden-run-mode');
    const densitySelect = document.getElementById('hidden-lines-density');
    const optionsGrid = document.getElementById('hiddenimage-options-grid');
    const nextBtn = document.getElementById('hidden-next-btn');
    
    const scoreVal = document.getElementById('hidden-score');
    const accVal = document.getElementById('hidden-accuracy');
    const questVal = document.getElementById('hidden-quest');
    const timerVal = document.getElementById('hidden-timer');
    const modeTag = document.getElementById('hidden-mode-tag');

    // Exam Nav Selectors
    const prevBtn = document.getElementById('hidden-prev-btn');
    const submitBtn = document.getElementById('hidden-submit-exam-btn');
    const quizNav = document.getElementById('hiddenimage-quiz-navigator');

    // Reference Shapes definitions
    const REF_SHAPES = [
        { name: 'Triangle', pts: [[0, -32], [32, 22], [-32, 22]] },
        { name: 'Square',   pts: [[-26, -26], [26, -26], [26, 26], [-26, 26]] },
        { name: 'Diamond',  pts: [[0, -35], [26, 0], [0, 35], [-26, 0]] },
        { name: 'House',    pts: [[0, -35], [26, -10], [20, 26], [-20, 26], [-26, -10]] },
        { name: 'Chevron',  pts: [[-24, -28], [0, -10], [24, -28], [24, 12], [0, 30], [-24, 12]] },
        { name: 'Cross',    pts: [
            [-8, -26], [8, -26], [8, -8], [26, -8], [26, 8], [8, 8],
            [8, 26], [-8, 26], [-8, 8], [-26, 8], [-26, -8], [-8, -8]
        ]}
    ];

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

    // --- 3D / 2D Canvas Scaling ---
    function setupCanvas(targetCanvas) {
        const rect = targetCanvas.parentNode.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        targetCanvas.width = rect.width * dpr;
        targetCanvas.height = rect.height * dpr;
        const targetCtx = targetCanvas.getContext('2d');
        targetCtx.scale(dpr, dpr);
        return { w: rect.width, h: rect.height };
    }

    function getDrawingScale() {
        let optionCanvasDim = 120;
        const grid = document.getElementById('hiddenimage-options-grid');
        if (grid) {
            const rect = grid.getBoundingClientRect();
            if (rect.width > 0) {
                let cellW = (rect.width - 15) / 2;
                let cellH = (rect.height - 15) / 2;
                optionCanvasDim = Math.min(cellW, cellH);
            }
        }
        
        let maxRadius = 1;
        REF_SHAPES.forEach(sym => {
            sym.pts.forEach(p => {
                let r = Math.hypot(p[0], p[1]);
                if (r > maxRadius) maxRadius = r;
            });
        });
        return (optionCanvasDim * 0.45) / maxRadius; // Larger, 1:1 scale
    }

    // --- Image / Noise Generation ---
    function generatePattern(dims) {
        // 1. Choose a target shape from pool
        targetShapeIndex = Math.floor(Math.random() * REF_SHAPES.length);
        const ref = REF_SHAPES[targetShapeIndex];
        
        // Random center translation inside safety bounds
        const cx = rnd(80, dims.w - 80);
        const cy = rnd(70, dims.h - 70);
        
        // Random rotation
        const rotAngle = Math.random() * Math.PI * 2;
        
        // Unified dynamic scaling
        const scale = getDrawingScale();
        
        // Rotate, scale and Translate points
        embeddedPolygon = ref.pts.map(p => {
            const rx = p[0] * scale * Math.cos(rotAngle) - p[1] * scale * Math.sin(rotAngle);
            const ry = p[0] * scale * Math.sin(rotAngle) + p[1] * scale * Math.cos(rotAngle);
            return [cx + rx, cy + ry];
        });

        // 2. Generate line noise segments (distractors)
        backgroundLines = [];
        
        // Extract embedded shape lines to display
        for (let i = 0; i < embeddedPolygon.length; i++) {
            const p1 = embeddedPolygon[i];
            const p2 = embeddedPolygon[(i + 1) % embeddedPolygon.length];
            backgroundLines.push({ p1, p2, isTarget: true });
        }

        // --- HIGH COMPLEXITY: EDGE-CONTINUATION CAMOUFLAGE ---
        // For each vertex of the embedded shape, extend lines along its edge vectors
        const len = embeddedPolygon.length;
        for (let i = 0; i < len; i++) {
            const curr = embeddedPolygon[i];
            const prev = embeddedPolygon[(i - 1 + len) % len];
            const next = embeddedPolygon[(i + 1) % len];
            
            // Incoming edge continuation
            let dx_in = curr[0] - prev[0];
            let dy_in = curr[1] - prev[1];
            let dist_in = Math.hypot(dx_in, dy_in);
            if (dist_in > 0) {
                let ext_len = rnd(40, 85);
                let p_ext = [
                    curr[0] + (dx_in / dist_in) * ext_len,
                    curr[1] + (dy_in / dist_in) * ext_len
                ];
                backgroundLines.push({ p1: curr, p2: p_ext, isTarget: false });
            }
            
            // Outgoing edge continuation
            let dx_out = curr[0] - next[0];
            let dy_out = curr[1] - next[1];
            let dist_out = Math.hypot(dx_out, dy_out);
            if (dist_out > 0) {
                let ext_len = rnd(40, 85);
                let p_ext = [
                    curr[0] + (dx_out / dist_out) * ext_len,
                    curr[1] + (dy_out / dist_out) * ext_len
                ];
                backgroundLines.push({ p1: curr, p2: p_ext, isTarget: false });
            }
        }

        // Add geometric distractor shapes
        const densityCount = parseInt(densitySelect.value); // 25, 45, 70
        const polyCount = Math.floor(densityCount / 4);
        
        for (let k = 0; k < polyCount; k++) {
            const randomRef = REF_SHAPES[Math.floor(Math.random() * REF_SHAPES.length)];
            const tcx = rnd(40, dims.w - 40);
            const tcy = rnd(40, dims.h - 40);
            const tangle = Math.random() * Math.PI * 2;
            const tscale = 0.5 + Math.random() * 1.0;
            
            const transPts = randomRef.pts.map(p => {
                const sx = p[0] * tscale;
                const sy = p[1] * tscale;
                const rx = sx * Math.cos(tangle) - sy * Math.sin(tangle);
                const ry = sx * Math.sin(tangle) + sy * Math.cos(tangle);
                return [tcx + rx, tcy + ry];
            });
            
            for (let i = 0; i < transPts.length; i++) {
                backgroundLines.push({
                    p1: transPts[i],
                    p2: transPts[(i + 1) % transPts.length],
                    isTarget: false
                });
            }
        }

        // Add additional random cross lines
        const lineCount = densityCount - polyCount * 2;
        for (let i = 0; i < lineCount; i++) {
            backgroundLines.push({
                p1: [rnd(10, dims.w - 10), rnd(10, dims.h - 10)],
                p2: [rnd(10, dims.w - 10), rnd(10, dims.h - 10)],
                isTarget: false
            });
        }
        
        // Generate circular distractors (3 to 6 circles)
        backgroundCircles = [];
        const circleCount = rnd(3, 6);
        for (let c = 0; c < circleCount; c++) {
            backgroundCircles.push({
                cx: rnd(50, dims.w - 50),
                cy: rnd(50, dims.h - 50),
                r: rnd(15, 45)
            });
        }

        // Shuffle lines so rendering is order-independent
        backgroundLines = shuffle(backgroundLines);
        return { targetShapeIndex, embeddedPolygon, backgroundLines, backgroundCircles };
    }

    function drawMainCanvas() {
        if (!active) return;
        const dims = setupCanvas(canvas);
        ctx.clearRect(0, 0, dims.w, dims.h);
        
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Draw background radar lines
        ctx.strokeStyle = "rgba(0, 242, 254, 0.08)";
        ctx.lineWidth = 1.0;
        const centerX = dims.w / 2;
        const centerY = dims.h / 2;
        
        for (let r = 50; r <= 200; r += 50) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        for (let i = 0; i < 8; i++) {
            let angle = (i * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(angle) * 300, centerY + Math.sin(angle) * 300);
            ctx.stroke();
        }

        // Draw background distractor circles
        ctx.strokeStyle = "rgba(0, 242, 254, 0.45)";
        ctx.lineWidth = 1.2;
        backgroundCircles.forEach(c => {
            ctx.beginPath();
            ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw background distractor lines
        backgroundLines.forEach(line => {
            if (!line.isTarget || !isAnswered || isQuizMode) {
                ctx.beginPath();
                ctx.moveTo(line.p1[0], line.p1[1]);
                ctx.lineTo(line.p2[0], line.p2[1]);
                ctx.stroke();
            }
        });
        
        // Highlight reveal hidden shape after answer / review
        if (isAnswered || isReviewMode) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = "#10b981";
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 3.0;
            
            ctx.beginPath();
            ctx.moveTo(embeddedPolygon[0][0], embeddedPolygon[0][1]);
            for (let i = 1; i < embeddedPolygon.length; i++) {
                ctx.lineTo(embeddedPolygon[i][0], embeddedPolygon[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
        }
    }

    function drawOptions() {
        optionsGrid.innerHTML = '';
        const userChoice = isQuizMode && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;
        
        optionsList.forEach((opt, idx) => {
            const card = document.createElement('div');
            card.className = 'option-card';
            
            if (isReviewMode) {
                if (idx === correctOptionIndex) {
                    card.classList.add('correct');
                } else if (idx === userChoice) {
                    card.classList.add('wrong');
                }
            } else if (isQuizMode) {
                if (idx === userChoice) {
                    card.classList.add('selected-exam');
                }
            } else if (isAnswered) {
                if (idx === correctOptionIndex) {
                    card.classList.add('correct');
                } else if (idx === userPracticeAnswer) {
                    card.classList.add('wrong');
                }
            }
            
            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65+idx)}</span><canvas id="hidden-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            optionsGrid.appendChild(card);
        });

        requestAnimationFrame(() => {
            optionsList.forEach((opt, idx) => {
                const opCanv = document.getElementById(`hidden-opt-canvas-${idx}`);
                if (!opCanv) return;
                const dims = setupCanvas(opCanv);
                const octx = opCanv.getContext('2d');
                octx.lineJoin = 'round'; 
                octx.lineCap = 'round';
                
                octx.save();
                octx.translate(dims.w / 2, dims.h / 2);
                
                // Unified dynamic scaling
                const scale = getDrawingScale();
                
                let isHighlightedCorrect = false;
                let isHighlightedSelected = false;
                let isHighlightedWrong = false;
                
                if (isReviewMode) {
                    if (idx === correctOptionIndex) isHighlightedCorrect = true;
                    if (idx === userChoice) isHighlightedSelected = true;
                } else if (isQuizMode) {
                    if (idx === userChoice) isHighlightedSelected = true;
                } else if (isAnswered) {
                    if (idx === correctOptionIndex) {
                        isHighlightedCorrect = true;
                    } else if (idx === userPracticeAnswer) {
                        isHighlightedWrong = true;
                    }
                }
                
                if (isHighlightedCorrect) {
                    octx.shadowBlur = 10;
                    octx.shadowColor = "#10b981";
                    octx.strokeStyle = "#10b981";
                    octx.lineWidth = 2.2;
                } else if (isHighlightedWrong) {
                    octx.shadowBlur = 10;
                    octx.shadowColor = "#f43f5e";
                    octx.strokeStyle = "#f43f5e";
                    octx.lineWidth = 2.2;
                } else if (isHighlightedSelected) {
                    octx.shadowBlur = 10;
                    octx.shadowColor = "#3b82f6";
                    octx.strokeStyle = "#3b82f6";
                    octx.lineWidth = 2.2;
                } else {
                    octx.shadowBlur = 8;
                    octx.shadowColor = "rgba(0, 242, 254, 0.3)";
                    octx.strokeStyle = "#00f2fe";
                    octx.lineWidth = 1.5;
                }
                
                octx.beginPath();
                octx.moveTo(opt.pts[0][0] * scale, opt.pts[0][1] * scale);
                for (let i = 1; i < opt.pts.length; i++) {
                    octx.lineTo(opt.pts[i][0] * scale, opt.pts[i][1] * scale);
                }
                octx.closePath();
                octx.stroke();
                
                octx.restore();
            });
        });
    }

    function initGame() {
        if (!active) return;
        
        isAnswered = false;
        userPracticeAnswer = null;
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";
        
        const dims = { w: canvas.parentNode.clientWidth, h: canvas.parentNode.clientHeight };
        if (dims.w === 0) {
            requestAnimationFrame(initGame);
            return;
        }

        generatePattern(dims);

        correctOptionIndex = Math.floor(Math.random() * 4);
        optionsList = [];
        
        let otherShapes = REF_SHAPES.filter((_, idx) => idx !== targetShapeIndex);
        otherShapes = shuffle(otherShapes);
        
        let oIdx = 0;
        for (let i = 0; i < 4; i++) {
            if (i === correctOptionIndex) {
                optionsList.push(REF_SHAPES[targetShapeIndex]);
            } else {
                optionsList.push(otherShapes[oIdx++]);
            }
        }
        
        questionStartTime = Date.now();
        drawMainCanvas();
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

        if (isAnswered) return;
        isAnswered = true;
        userPracticeAnswer = idx;
        totalAttempts++;
        
        const isCorrect = (idx === correctOptionIndex);
        
        if (isCorrect) {
            window.playSound('correct');
            correctAttempts++;
            score += 10;
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
            window.playSound('wrong');
            window.showToast("WRONG");
            cardEl.classList.add('wrong');
            
            // Show correct answer highlighting
            const cards = document.querySelectorAll('.option-card');
            cards[correctOptionIndex].classList.add('correct');
        }
        
        updateStats();
        drawMainCanvas(); // Redraw main to reveal green path
        
        nextBtn.innerText = "ข้อถัดไป ➔";
        nextBtn.className = "btn-action primary";
    }

    function updateStats() {
        scoreVal.innerText = score;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accVal.innerText = acc + "%";
    }

    // --- Exam Mode Navigation System ---
    function loadQuestion(idx) {
        currentQIndex = idx;
        const q = quizQuestions[idx];
        
        embeddedPolygon = q.embeddedPolygon;
        backgroundLines = q.backgroundLines;
        backgroundCircles = q.backgroundCircles;
        optionsList = q.optionsList;
        correctOptionIndex = q.correctOptionIndex;
        targetShapeIndex = q.targetShapeIndex;
        
        isAnswered = false;
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        // Show/hide footer nav buttons
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();
        drawMainCanvas();
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
                type: `ความหนาแน่น ${densitySelect.value}`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedQuestion: {
                    embeddedPolygon: q.embeddedPolygon,
                    backgroundLines: q.backgroundLines,
                    backgroundCircles: q.backgroundCircles,
                    optionsList: q.optionsList,
                    correctOptionIndex: q.correctOptionIndex,
                    targetShapeIndex: q.targetShapeIndex,
                    userAnswer: q.userAnswer
                }
            };
        });
        
        // Hide exam interfaces
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        window.showQuizResult('hiddenimage', correct, maxQuizQ, quizTimerCount, historyDetails);
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
        quizTimerCount = 0;
        correctAttempts = 0;
        totalAttempts = 0;
        
        questVal.innerText = `1/${maxQuizQ}`;
        timerVal.innerText = "00:00";
        modeTag.innerText = "Timed Challenge (Quiz)";
        
        // Pre-cache all 20 questions
        quizQuestions = [];
        const dims = { w: canvas.parentNode.clientWidth, h: canvas.parentNode.clientHeight };
        
        for (let i = 0; i < maxQuizQ; i++) {
            let pat = generatePattern(dims);
            let corrIdx = Math.floor(Math.random() * 4);
            let opts = [];
            
            let otherShapes = REF_SHAPES.filter((_, idx) => idx !== pat.targetShapeIndex);
            otherShapes = shuffle(otherShapes);
            
            let oIdx = 0;
            for (let o = 0; o < 4; o++) {
                if (o === corrIdx) {
                    opts.push(REF_SHAPES[pat.targetShapeIndex]);
                } else {
                    opts.push(otherShapes[oIdx++]);
                }
            }
            
            quizQuestions.push({
                embeddedPolygon: pat.embeddedPolygon,
                backgroundLines: pat.backgroundLines,
                backgroundCircles: pat.backgroundCircles,
                optionsList: opts,
                correctOptionIndex: corrIdx,
                targetShapeIndex: pat.targetShapeIndex,
                userAnswer: null,
                timeSpent: 0
            });
        }
        
        document.querySelectorAll('.q-only').forEach(el => el.style.display = 'block');
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
        document.querySelectorAll('.q-only').forEach(el => el.style.display = 'none');
        
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
        
        score = 0; totalAttempts = 0; correctAttempts = 0;
        updateStats();
        
        nextBtn.onclick = handleNext;
        
        initGame();
    }

    // --- Quiz Review Interface ---
    function reviewQuestion(historyIndex) {
        const item = quizQuestions[historyIndex];
        if (!item) return;

        isReviewMode = true;
        isQuizMode = false;
        isAnswered = true;
        
        embeddedPolygon = item.embeddedPolygon;
        backgroundLines = item.backgroundLines;
        backgroundCircles = item.backgroundCircles;
        optionsList = item.optionsList;
        correctOptionIndex = item.correctOptionIndex;
        targetShapeIndex = item.targetShapeIndex;
        
        questVal.innerText = `${historyIndex + 1}/${maxQuizQ}`;
        
        drawMainCanvas();
        drawOptions();
        
        // Return button setup
        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action primary";
        nextBtn.onclick = () => {
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext; // Reset binding
        };
    }

    runModeSelect.addEventListener('change', toggleRunMode);
    densitySelect.addEventListener('change', () => { if(!isQuizMode) initGame(); });
    prevBtn.onclick = handlePrev;
    nextBtn.onclick = handleNext;
    submitBtn.onclick = submitQuiz;

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
                const cards = document.querySelectorAll('#hiddenimage-options-grid .option-card');
                if (cards[idx]) {
                    checkAnswer(idx, cards[idx]);
                }
            }
        }
    }

    // Resize optimization
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (active && !isReviewMode) {
                drawMainCanvas();
                drawOptions();
            }
        }, 150);
    });

    return {
        start: function() {
            active = true;
            isReviewMode = false;
            
            document.getElementById('hiddenimage-lobby').style.display = 'flex';
            document.getElementById('hiddenimage-stage').style.display = 'none';
            
            const startBtnLobby = document.getElementById('hiddenimage-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#hiddenimage-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                densitySelect.value = document.getElementById('lobby-hidden-lines-density').value;
                
                document.getElementById('hiddenimage-lobby').style.display = 'none';
                document.getElementById('hiddenimage-stage').style.display = 'flex';
                
                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };
        },
        stop: function() {
            active = false;
            clearInterval(timerInterval);
        },
        review: reviewQuestion,
        handleKeyDown: handleKeyDown
    };
})();

// Attach to window explicitly for global access
window.HiddenImageEngine = HiddenImageEngine;
