const SimilarityEngine = (function() {
    let active = false;
    let targetCanvas = document.getElementById('similarity-target-canvas');
    let targetCtx = targetCanvas.getContext('2d');
    
    // States
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let questionStartTime = 0;
    
    let targetSymbol = null; // Reference object
    let correctOptionIndex = 0;
    let optionsList = [];  // Array of 5 symbol objects
    let userPracticeAnswer = null;
    
    // Quiz State
    let isQuizMode = false;
    let quizQCount = 1;
    let maxQuizQ = 20;
    let quizQuestions = []; // Cached questions list
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;

    // UI Selectors
    const runModeSelect = document.getElementById('sim-run-mode');
    const complexitySelect = document.getElementById('sim-complexity');
    const choicesGrid = document.getElementById('similarity-choices-grid');
    const nextBtn = document.getElementById('sim-next-btn');
    
    const scoreVal = document.getElementById('sim-score');
    const accVal = document.getElementById('sim-accuracy');
    const questVal = document.getElementById('sim-quest');
    const timerVal = document.getElementById('sim-timer');
    const modeTag = document.getElementById('sim-mode-tag');

    // Exam Nav Selectors
    const prevBtn = document.getElementById('sim-prev-btn');
    const submitBtn = document.getElementById('sim-submit-exam-btn');
    const quizNav = document.getElementById('similarity-quiz-navigator');

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

    // --- Dynamic Symbol Builders ---
    function generateSymbol(complexity) {
        const baseTypes = ['circle', 'square', 'hexagon'];
        const baseType = baseTypes[Math.floor(Math.random() * baseTypes.length)];
        
        let lines = [];
        let dot = null;
        let subShape = null;

        lines.push({ x1: -25, y1: -25, x2: 25, y2: 25 });
        
        if (complexity === 'easy') {
            lines.push({ x1: -25, y1: 25, x2: 25, y2: -25 });
            dot = { x: 15, y: -15, r: 3.5 };
        } else if (complexity === 'medium') {
            lines.push({ x1: -25, y1: 25, x2: 25, y2: -25 });
            lines.push({ x1: -25, y1: 0, x2: 25, y2: 0 }); // Horizontal line
            dot = { x: 0, y: -18, r: 3.5 };
            subShape = { type: 'circle', x: -14, y: -14, size: 8 };
        } else { // hard
            lines.push({ x1: -25, y1: 25, x2: 25, y2: -25 });
            lines.push({ x1: -25, y1: 0, x2: 25, y2: 0 });
            lines.push({ x1: 0, y1: -25, x2: 0, y2: 25 }); // Vertical line
            dot = { x: 18, y: -18, r: 3.5 };
            subShape = { type: 'triangle', x: -16, y: 16, size: 10 };
        }

        return {
            baseType,
            lines,
            dot,
            subShape
        };
    }

    function cloneSymbol(sym) {
        return {
            baseType: sym.baseType,
            lines: sym.lines.map(l => ({...l})),
            dot: sym.dot ? {...sym.dot} : null,
            subShape: sym.subShape ? {...sym.subShape} : null
        };
    }

    function makeAlteration(sym, type) {
        let alt = cloneSymbol(sym);
        
        switch (type) {
            case 0: // Alter Base outline type
                const bases = ['circle', 'square', 'hexagon'].filter(b => b !== sym.baseType);
                alt.baseType = bases[Math.floor(Math.random() * bases.length)];
                break;
                
            case 1: // Alter Dot position slightly (shift it)
                if (alt.dot) {
                    alt.dot.x += (Math.random() < 0.5 ? 9 : -9);
                    alt.dot.y += (Math.random() < 0.5 ? 9 : -9);
                } else {
                    alt.dot = { x: 18, y: 0, r: 3.5 };
                }
                break;
                
            case 2: // Omit one line segment
                if (alt.lines.length > 1) {
                    alt.lines.pop(); // remove last line
                } else {
                    alt.lines[0].x1 = -25;
                    alt.lines[0].y1 = 0;
                }
                break;
                
            case 3: // Alter subShape size or type or shift it
                if (alt.subShape) {
                    alt.subShape.type = alt.subShape.type === 'circle' ? 'triangle' : 'circle';
                    alt.subShape.x += 10;
                } else {
                    alt.subShape = { type: 'square', x: 14, y: 14, size: 8 };
                }
                break;
        }
        return alt;
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

    function drawSymbolToCtx(sCtx, sym, dims, isHighlighted, isSelected, isWrong) {
        sCtx.clearRect(0, 0, dims.w, dims.h);
        sCtx.save();
        sCtx.translate(dims.w / 2, dims.h / 2);
        
        if (isHighlighted) {
            sCtx.shadowBlur = 10;
            sCtx.shadowColor = "#10b981";
            sCtx.strokeStyle = "#10b981";
            sCtx.fillStyle = "#10b981";
            sCtx.lineWidth = 2.2;
        } else if (isWrong) {
            sCtx.shadowBlur = 10;
            sCtx.shadowColor = "#f43f5e";
            sCtx.strokeStyle = "#f43f5e";
            sCtx.fillStyle = "#f43f5e";
            sCtx.lineWidth = 2.2;
        } else if (isSelected) {
            sCtx.shadowBlur = 10;
            sCtx.shadowColor = "#3b82f6";
            sCtx.strokeStyle = "#3b82f6";
            sCtx.fillStyle = "#3b82f6";
            sCtx.lineWidth = 2.2;
        } else {
            sCtx.shadowBlur = 6;
            sCtx.shadowColor = "rgba(0, 242, 254, 0.35)";
            sCtx.strokeStyle = "#00f2fe";
            sCtx.fillStyle = "#00f2fe";
            sCtx.lineWidth = 1.5;
        }

        // Outline
        sCtx.beginPath();
        if (sym.baseType === 'circle') {
            sCtx.arc(0, 0, 32, 0, Math.PI * 2);
        } else if (sym.baseType === 'square') {
            sCtx.rect(-30, -30, 60, 60);
        } else if (sym.baseType === 'hexagon') {
            for (let i = 0; i < 6; i++) {
                let angle = i * Math.PI / 3;
                let x = Math.cos(angle) * 33;
                let y = Math.sin(angle) * 33;
                if (i === 0) sCtx.moveTo(x, y);
                else sCtx.lineTo(x, y);
            }
            sCtx.closePath();
        }
        sCtx.stroke();

        // Lines
        sym.lines.forEach(l => {
            sCtx.beginPath();
            sCtx.moveTo(l.x1, l.y1);
            sCtx.lineTo(l.x2, l.y2);
            sCtx.stroke();
        });

        // subShape
        if (sym.subShape) {
            sCtx.beginPath();
            const sh = sym.subShape;
            if (sh.type === 'circle') {
                sCtx.arc(sh.x, sh.y, sh.size / 2, 0, Math.PI * 2);
            } else if (sh.type === 'square') {
                sCtx.rect(sh.x - sh.size/2, sh.y - sh.size/2, sh.size, sh.size);
            } else if (sh.type === 'triangle') {
                sCtx.moveTo(sh.x, sh.y - sh.size/2);
                sCtx.lineTo(sh.x + sh.size/2, sh.y + sh.size/2);
                sCtx.lineTo(sh.x - sh.size/2, sh.y + sh.size/2);
                sCtx.closePath();
            }
            sCtx.stroke();
        }

        // Dot
        if (sym.dot) {
            sCtx.beginPath();
            sCtx.arc(sym.dot.x, sym.dot.y, sym.dot.r, 0, Math.PI * 2);
            sCtx.fill();
        }

        sCtx.restore();
    }

    function drawTarget() {
        if (!active) return;
        const dims = setupCanvas(targetCanvas);
        drawSymbolToCtx(targetCtx, targetSymbol, dims, false, false, false);
    }

    function drawOptions() {
        choicesGrid.innerHTML = '';
        const userChoice = isQuizMode && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;
        
        optionsList.forEach((opt, idx) => {
            const card = document.createElement('div');
            card.className = 'sim-choice-card';
            
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
            
            card.innerHTML = `<span class="option-num-label">${String.fromCharCode(65+idx)}</span><canvas id="sim-opt-canvas-${idx}"></canvas>`;
            card.onclick = () => checkAnswer(idx, card);
            choicesGrid.appendChild(card);
        });

        requestAnimationFrame(() => {
            optionsList.forEach((opt, idx) => {
                const opCanv = document.getElementById(`sim-opt-canvas-${idx}`);
                if (!opCanv) return;
                const dims = setupCanvas(opCanv);
                const octx = opCanv.getContext('2d');
                
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
                
                drawSymbolToCtx(octx, opt, dims, isHighlightedCorrect, isHighlightedSelected, isHighlightedWrong);
            });
        });
    }

    function initGame() {
        if (!active) return;
        
        isAnswered = false;
        userPracticeAnswer = null;
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";
        
        const complexity = complexitySelect.value;
        targetSymbol = generateSymbol(complexity);

        correctOptionIndex = Math.floor(Math.random() * 5);
        optionsList = [];
        
        let altTypes = shuffle([0, 1, 2, 3]);
        let altIdx = 0;
        
        for (let i = 0; i < 5; i++) {
            if (i === correctOptionIndex) {
                optionsList.push(cloneSymbol(targetSymbol));
            } else {
                optionsList.push(makeAlteration(targetSymbol, altTypes[altIdx++]));
            }
        }
        
        questionStartTime = Date.now();
        drawTarget();
        drawOptions();
    }

    function checkAnswer(idx, cardEl) {
        if (isQuizMode) {
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
            window.showToast("CORRECT");
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
            
            const cards = document.querySelectorAll('.sim-choice-card');
            cards[correctOptionIndex].classList.add('correct');
        }
        
        updateStats();
        drawOptions(); // Redraw choice cards to show green correct border
        
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
        
        targetSymbol = q.targetSymbol;
        optionsList = q.optionsList;
        correctOptionIndex = q.correctOptionIndex;
        
        isAnswered = false;
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();
        drawTarget();
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
                type: `ความละเอียด ${complexitySelect.value}`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                savedQuestion: {
                    targetSymbol: q.targetSymbol,
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
        
        window.showQuizResult('similarity', correct, maxQuizQ, quizTimerCount, historyDetails);
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
        
        // Pre-cache 20 questions
        quizQuestions = [];
        const complexity = complexitySelect.value;
        
        for (let i = 0; i < maxQuizQ; i++) {
            let target = generateSymbol(complexity);
            let corrIdx = Math.floor(Math.random() * 5);
            let opts = [];
            let altTypes = shuffle([0, 1, 2, 3]);
            let altIdx = 0;
            
            for (let o = 0; o < 5; o++) {
                if (o === corrIdx) {
                    opts.push(cloneSymbol(target));
                } else {
                    opts.push(makeAlteration(target, altTypes[altIdx++]));
                }
            }
            
            quizQuestions.push({
                targetSymbol: target,
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
        
        targetSymbol = item.targetSymbol;
        optionsList = item.optionsList;
        correctOptionIndex = item.correctOptionIndex;
        
        questVal.innerText = `${historyIndex + 1}/${maxQuizQ}`;
        
        drawTarget();
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
    complexitySelect.addEventListener('change', () => { if(!isQuizMode) initGame(); });
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
            else if (key === '5' || key === 'e') idx = 4;
            
            if (idx >= 0 && idx < 5) {
                const cards = document.querySelectorAll('#similarity-choices-grid .sim-choice-card');
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
                drawTarget();
                drawOptions();
            }
        }, 150);
    });

    return {
        start: function() {
            active = true;
            isReviewMode = false;
            
            document.getElementById('similarity-lobby').style.display = 'flex';
            document.getElementById('similarity-stage').style.display = 'none';
            
            const startBtnLobby = document.getElementById('similarity-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#similarity-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                complexitySelect.value = document.getElementById('lobby-sim-complexity').value;
                
                document.getElementById('similarity-lobby').style.display = 'none';
                document.getElementById('similarity-stage').style.display = 'flex';
                
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
window.SimilarityEngine = SimilarityEngine;
