const ShapeRotationEngine = (function() {
    let active = false;
    let refCanvas = document.getElementById('shaperotation-ref-canvas');
    let refCtx = refCanvas.getContext('2d');
    
    // States
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let questionStartTime = 0;
    
    let basePolygon = []; // Original reference shape points
    let correctOptionIndex = 0;
    let optionsList = [];  // Array of { pts: [], isCorrect: false }
    
    // Quiz State
    let isQuizMode = false;
    let quizQCount = 1;
    let maxQuizQ = 20;
    let quizQuestions = []; // Cached questions list
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;

    // UI Selectors
    const runModeSelect = document.getElementById('shape-run-mode');
    const difficultySelect = document.getElementById('shape-difficulty');
    const optionsGrid = document.getElementById('shaperotation-options-grid');
    const nextBtn = document.getElementById('shape-next-btn');
    
    const scoreVal = document.getElementById('shape-score');
    const accVal = document.getElementById('shape-accuracy');
    const questVal = document.getElementById('shape-quest');
    const timerVal = document.getElementById('shape-timer');
    const modeTag = document.getElementById('shape-mode-tag');

    // Exam Nav Selectors
    const prevBtn = document.getElementById('shape-prev-btn');
    const submitBtn = document.getElementById('shape-submit-exam-btn');
    const quizNav = document.getElementById('shaperotation-quiz-navigator');

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

    // Centering function to make rotations/reflections perfectly aligned around origin
    function centerPolygon(pts) {
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p[0]; cy += p[1]; });
        cx /= pts.length;
        cy /= pts.length;
        return pts.map(p => [p[0] - cx, p[1] - cy]);
    }

    // --- Diverse Asymmetric Polygon Generator ---
    function generateDiversePolygon(numVertices, size = 32) {
        const type = rnd(1, 10);
        let pts = [];
        if (type === 1) {
            // L-Shape Block
            let w1 = rnd(15, 25);
            let w2 = rnd(15, 25);
            let h1 = rnd(20, 35);
            let h2 = rnd(20, 35);
            pts = [
                [-w1, -h1],
                [w2, -h1],
                [w2, h2 - h1],
                [w2 + w1, h2 - h1],
                [w2 + w1, h2],
                [-w1, h2]
            ];
            if (numVertices > 6) {
                pts.push([-w1, 0]);
            }
        } else if (type === 2) {
            // Arrow/Chevron (asymmetric)
            pts = [
                [0, -size - rnd(5, 15)], // tip
                [size + rnd(-5, 10), -5 + rnd(-5, 5)], // right wing
                [size / 3 + rnd(-5, 5), 0], // right inner
                [size / 2 + rnd(-5, 5), size + rnd(-5, 10)], // right tail
                [-size / 2 - rnd(-5, 5), size + rnd(-5, 10)], // left tail
                [-size / 3 - rnd(-5, 5), 0], // left inner
                [-size - rnd(-5, 10), -5 - rnd(-5, 5)] // left wing (asymmetric)
            ];
            if (numVertices < 7) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 3) {
            // Crown/Sawtooth
            pts = [
                [-size, size],
                [size, size],
                [size - rnd(0, 10), -rnd(10, 25)], // peak 1
                [rnd(5, 15), rnd(5, 15)], // valley 1
                [rnd(-5, 5), -rnd(20, 35)], // peak 2
                [-rnd(5, 15), rnd(5, 15)], // valley 2
                [-size + rnd(0, 10), -rnd(10, 25)] // peak 3
            ];
            if (numVertices < 7) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 4) {
            // Fish/Kite (asymmetrical)
            pts = [
                [0, -size],
                [size - rnd(0, 10), -rnd(5, 15)],
                [size / 2 - rnd(-5, 15), size - rnd(0, 15)],
                [0, size / 3 - rnd(-5, 5)],
                [-size / 2 + rnd(-5, 15), size - rnd(0, 15)],
                [-size + rnd(0, 10), -rnd(5, 15)]
            ];
            if (numVertices < 6) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 5) {
            // Staircase/Step shape
            let s = rnd(10, 18);
            pts = [
                [-s*2, -s*2],
                [-s, -s*2],
                [-s, -s],
                [0, -s],
                [0, 0],
                [s, 0],
                [s, s + rnd(0, 8)],
                [-s*2, s + rnd(0, 5)]
            ];
            if (numVertices < pts.length) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 6) {
            // T-Shape (asymmetric)
            let w = rnd(12, 20);
            let h = rnd(20, 30);
            let stemW = rnd(8, 14);
            pts = [
                [-w - rnd(0, 8), -h/2],
                [w + rnd(0, 5), -h/2],
                [w + rnd(0, 5), -h/2 + rnd(10, 15)],
                [stemW, -h/2 + rnd(10, 15)],
                [stemW + rnd(-3, 3), h/2 + rnd(0, 5)],
                [-stemW + rnd(-3, 3), h/2],
                [-stemW, -h/2 + rnd(10, 15)],
                [-w - rnd(0, 8), -h/2 + rnd(10, 15)]
            ];
            if (numVertices < pts.length) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 7) {
            // Zigzag/Lightning bolt
            let s = rnd(8, 14);
            pts = [
                [-s + rnd(-3, 3), -s*3],
                [s + rnd(0, 5), -s*2 + rnd(-3, 3)],
                [rnd(-3, 3), -s + rnd(-3, 3)],
                [s + rnd(3, 8), rnd(-3, 3)],
                [rnd(-3, 3), s + rnd(-3, 3)],
                [s + rnd(0, 5), s*2 + rnd(-3, 3)],
                [-s + rnd(-3, 3), s*3]
            ];
            if (numVertices < 7) {
                pts = pts.slice(0, numVertices);
            }
        } else if (type === 8) {
            // Pentagon with notch (pac-man style)
            let r = rnd(25, 35);
            pts = [
                [0, -r],
                [r * 0.95, -r * 0.31],
                [r * 0.59, r * 0.81],
                [0, r * 0.3 + rnd(-5, 5)], // notch inward
                [-r * 0.59, r * 0.81],
                [-r * 0.95, -r * 0.31]
            ];
            if (numVertices > 6) {
                pts.splice(3, 0, [rnd(3, 10), rnd(5, 15)]); // extra notch vertex
            }
        } else if (type === 9) {
            // Hook/J-shape
            let s = rnd(10, 16);
            pts = [
                [s, -s*2 - rnd(0, 5)],
                [s*2, -s*2],
                [s*2 + rnd(0, 5), s],
                [s, s + rnd(3, 8)],
                [-s + rnd(-3, 3), s + rnd(0, 5)],
                [-s*2, rnd(-5, 5)],
                [-s, -s + rnd(-3, 3)],
                [0, -s*2 + rnd(-3, 3)]
            ];
            if (numVertices < pts.length) {
                pts = pts.slice(0, numVertices);
            }
        } else {
            // Original radial jittered polygon
            let angleStep = (Math.PI * 2) / numVertices;
            for (let i = 0; i < numVertices; i++) {
                let angle = i * angleStep;
                let radius = size * (0.6 + Math.random() * 0.7);
                pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
            }
        }
        
        // Add random slight jitter to all vertices to ensure uniqueness
        pts = pts.map(p => [p[0] + (Math.random() - 0.5) * 3, p[1] + (Math.random() - 0.5) * 3]);
        
        return centerPolygon(pts);
    }

    function rotatePolygon(pts, angle) {
        return pts.map(p => [
            p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
            p[0] * Math.sin(angle) + p[1] * Math.cos(angle)
        ]);
    }

    function mirrorPolygon(pts) {
        // Reflect across the Y-axis (flip X coordinates)
        return pts.map(p => [-p[0], p[1]]);
    }

    // --- Canvas Rendering ---
    function setupCanvas(targetCanvas) {
        const rect = targetCanvas.parentNode.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        targetCanvas.width = rect.width * dpr;
        targetCanvas.height = rect.height * dpr;
        const targetCtx = targetCanvas.getContext('2d');
        targetCtx.scale(dpr, dpr);
        return { w: rect.width, h: rect.height };
    }

    function drawReference() {
        if (!active) return;
        const dims = setupCanvas(refCanvas);
        refCtx.clearRect(0, 0, dims.w, dims.h);
        
        refCtx.save();
        refCtx.translate(dims.w / 2, dims.h / 2);
        
        refCtx.shadowBlur = 10;
        refCtx.shadowColor = "rgba(0, 242, 254, 0.4)";
        refCtx.fillStyle = "rgba(0, 242, 254, 0.12)";
        refCtx.strokeStyle = "#00f2fe";
        refCtx.lineWidth = 2.0;
        
        refCtx.beginPath();
        refCtx.moveTo(basePolygon[0][0], basePolygon[0][1]);
        for (let i = 1; i < basePolygon.length; i++) {
            refCtx.lineTo(basePolygon[i][0], basePolygon[i][1]);
        }
        refCtx.closePath();
        refCtx.fill();
        refCtx.stroke();
        
        // Draw center dot
        refCtx.beginPath();
        refCtx.arc(0, 0, 3, 0, Math.PI * 2);
        refCtx.fillStyle = "#00f2fe";
        refCtx.fill();
        
        refCtx.restore();
    }

    function drawOptions() {
        optionsGrid.innerHTML = '';
        const userChoice = isQuizMode && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;
        
        optionsList.forEach((opt, idx) => {
            const card = document.createElement('div');
            card.className = 'option-card';
            
            if (isReviewMode) {
                const q = quizQuestions[currentQIndex];
                if (idx === correctOptionIndex) {
                    card.classList.add('correct');
                } else if (idx === q.userAnswer) {
                    card.classList.add('wrong');
                }
            } else if (isQuizMode) {
                if (idx === userChoice) {
                    card.classList.add('selected-exam');
                }
            } else if (isAnswered) {
                if (opt.isCorrect) card.classList.add('correct');
            }
            
            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65+idx)}</span><canvas id="shape-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            optionsGrid.appendChild(card);
        });

        requestAnimationFrame(() => {
            optionsList.forEach((opt, idx) => {
                const opCanv = document.getElementById(`shape-opt-canvas-${idx}`);
                if (!opCanv) return;
                const dims = setupCanvas(opCanv);
                const octx = opCanv.getContext('2d');
                octx.lineJoin = 'round';
                octx.lineCap = 'round';
                
                octx.save();
                octx.translate(dims.w / 2, dims.h / 2);
                
                let isHighlightedCorrect = false;
                let isHighlightedSelected = false;
                
                if (isReviewMode) {
                    const q = quizQuestions[currentQIndex];
                    if (idx === correctOptionIndex) isHighlightedCorrect = true;
                    if (idx === q.userAnswer) isHighlightedSelected = true;
                } else if (isQuizMode) {
                    if (idx === userChoice) isHighlightedSelected = true;
                } else if (isAnswered) {
                    if (opt.isCorrect) isHighlightedCorrect = true;
                }
                
                if (isHighlightedCorrect) {
                    octx.shadowBlur = 12;
                    octx.shadowColor = "#10b981";
                    octx.fillStyle = "rgba(16, 185, 129, 0.15)";
                    octx.strokeStyle = "#10b981";
                    octx.lineWidth = 2.2;
                } else if (isHighlightedSelected) {
                    octx.shadowBlur = 12;
                    octx.shadowColor = "#3b82f6";
                    octx.fillStyle = "rgba(59, 130, 246, 0.15)";
                    octx.strokeStyle = "#3b82f6";
                    octx.lineWidth = 2.2;
                } else {
                    octx.shadowBlur = 8;
                    octx.shadowColor = "rgba(0, 242, 254, 0.3)";
                    octx.fillStyle = "rgba(0, 242, 254, 0.05)";
                    octx.strokeStyle = "#00f2fe";
                    octx.lineWidth = 1.5;
                }
                
                octx.beginPath();
                octx.moveTo(opt.pts[0][0], opt.pts[0][1]);
                for (let i = 1; i < opt.pts.length; i++) {
                    octx.lineTo(opt.pts[i][0], opt.pts[i][1]);
                }
                octx.closePath();
                octx.fill();
                octx.stroke();
                
                // Draw center dot
                octx.beginPath();
                octx.arc(0, 0, 2.5, 0, Math.PI * 2);
                octx.fillStyle = isHighlightedCorrect ? "#10b981" : (isHighlightedSelected ? "#93c5fd" : "#00f2fe");
                octx.fill();
                
                octx.restore();
            });
        });
    }

    function initGame() {
        if (!active) return;
        
        isAnswered = false;
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";
        
        const numVertices = parseInt(difficultySelect.value); // 5 or 7 vertices
        
        basePolygon = generateDiversePolygon(numVertices, 32);

        correctOptionIndex = Math.floor(Math.random() * 4);
        optionsList = [];
        
        for (let i = 0; i < 4; i++) {
            if (i === correctOptionIndex) {
                // Correct: Rotated only
                const angle = (rnd(1, 7) * 45 * Math.PI) / 180;
                optionsList.push({
                    pts: rotatePolygon(basePolygon, angle),
                    isCorrect: true
                });
            } else {
                // Incorrect: Mirrored and then rotated
                const angle = (rnd(0, 7) * 45 * Math.PI) / 180;
                const mirrored = mirrorPolygon(basePolygon);
                optionsList.push({
                    pts: rotatePolygon(mirrored, angle),
                    isCorrect: false
                });
            }
        }
        
        questionStartTime = Date.now();
        drawReference();
        drawOptions();
    }

    function checkAnswer(idx, cardEl) {
        if (isQuizMode) {
            quizQuestions[currentQIndex].userAnswer = idx;
            updateQuizNavigator();
            drawOptions();
            window.playSound('beep');
            return;
        }

        if (isAnswered) return;
        isAnswered = true;
        totalAttempts++;
        
        const isCorrect = (idx === correctOptionIndex);
        
        if (isCorrect) {
            window.playSound('correct');
            correctAttempts++;
            score += 10;
            window.showToast("CORRECT");
            cardEl.classList.add('correct');
        } else {
            window.playSound('wrong');
            window.showToast("WRONG");
            cardEl.classList.add('wrong');
            
            // Show correct answer highlighting
            const cards = document.querySelectorAll('.option-card');
            cards[correctOptionIndex].classList.add('correct');
        }
        
        updateStats();
        drawOptions(); // redraw to reveal green correct card style
        
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
        
        basePolygon = q.basePolygon;
        optionsList = q.optionsList;
        correctOptionIndex = q.correctOptionIndex;
        
        isAnswered = false;
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        // Show/hide footer nav buttons
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();
        drawReference();
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
                type: `${difficultySelect.value} เหลี่ยม`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedQuestion: {
                    basePolygon: q.basePolygon,
                    optionsList: q.optionsList,
                    correctOptionIndex: q.correctOptionIndex,
                    userAnswer: q.userAnswer
                }
            };
        });
        
        // Hide exam interfaces
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        window.showQuizResult('shaperotation', correct, maxQuizQ, quizTimerCount, historyDetails);
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
        const numVertices = parseInt(difficultySelect.value);
        
        for (let i = 0; i < maxQuizQ; i++) {
            let base = generateDiversePolygon(numVertices, 32);
            let corrIdx = Math.floor(Math.random() * 4);
            let opts = [];
            
            for (let o = 0; o < 4; o++) {
                if (o === corrIdx) {
                    const angle = (rnd(1, 7) * 45 * Math.PI) / 180;
                    opts.push({
                        pts: rotatePolygon(base, angle),
                        isCorrect: true
                    });
                } else {
                    const angle = (rnd(0, 7) * 45 * Math.PI) / 180;
                    const mirrored = mirrorPolygon(base);
                    opts.push({
                        pts: rotatePolygon(mirrored, angle),
                        isCorrect: false
                    });
                }
            }
            
            quizQuestions.push({
                basePolygon: base,
                optionsList: opts,
                correctOptionIndex: corrIdx,
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
            window.playSound('timer');
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
        
        basePolygon = item.basePolygon;
        optionsList = item.optionsList;
        correctOptionIndex = item.correctOptionIndex;
        
        questVal.innerText = `${historyIndex + 1}/${maxQuizQ}`;
        
        drawReference();
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
    difficultySelect.addEventListener('change', () => { if(!isQuizMode) initGame(); });
    // Use onclick instead of addEventListener to prevent double-handler bug
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
        
        if (!isAnswered || isQuizMode) {
            let idx = -1;
            if (key === '1' || key === 'a') idx = 0;
            else if (key === '2' || key === 'b') idx = 1;
            else if (key === '3' || key === 'c') idx = 2;
            else if (key === '4' || key === 'd') idx = 3;
            
            if (idx >= 0 && idx < 4) {
                const cards = document.querySelectorAll('#shaperotation-options-grid .option-card');
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
            
            document.getElementById('shaperotation-lobby').style.display = 'flex';
            document.getElementById('shaperotation-stage').style.display = 'none';
            
            const startBtnLobby = document.getElementById('shaperotation-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#shaperotation-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                difficultySelect.value = document.getElementById('lobby-shape-difficulty').value;
                
                document.getElementById('shaperotation-lobby').style.display = 'none';
                document.getElementById('shaperotation-stage').style.display = 'flex';
                
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
window.ShapeRotationEngine = ShapeRotationEngine;
