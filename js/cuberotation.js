const CubeRotationEngine = (function() {
    let active = false;
    let canvas = document.getElementById('cuberotation-canvas');
    let ctx = canvas.getContext('2d');
    let gameTimer = null;
    
    // States
    let currentXFace = "TOP"; // TOP, BOTTOM, LEFT, RIGHT, FRONT, BACK
    let initialXFace = "TOP";
    let score = 0;
    let totalAttempts = 0, correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let isAnimating = false;
    
    // Rotation sequence
    let currentSequence = []; // list of directions e.g. ['LEFT', 'FRONT', 'RIGHT']
    let sequenceIndex = 0;
    let activeCommand = "READY";
    
    // 3D Rendering matrices
    const identityMatrix = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];
    let currentMatrix = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];
    let targetMatrix = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];
    let animProgress = 1.0;
    let animDirection = null; // 'LEFT', 'RIGHT', 'FRONT', 'BACK'
    
    // Quiz State
    let isQuizMode = false;
    let quizQCount = 1;
    let maxQuizQ = 20;
    let quizQuestions = []; // Array of cached questions
    let currentQIndex = 0;
    let quizTimerCount = 0;
    let timerInterval = null;
    let questionStartTime = 0;

    // UI Selectors
    const runModeSelect = document.getElementById('cube-run-mode');
    const difficultySelect = document.getElementById('cube-difficulty');
    const statusMsg = document.getElementById('cube-status-msg');
    const choicesContainer = document.getElementById('cube-choices-container');
    const startBtn = document.getElementById('cube-start-btn');
    const commandDisplay = document.getElementById('cube-command-display');
    
    const scoreVal = document.getElementById('cube-score');
    const accVal = document.getElementById('cube-accuracy');
    const questVal = document.getElementById('cube-quest');
    const timerVal = document.getElementById('cube-timer');
    const modeTag = document.getElementById('cube-mode-tag');

    // Exam Nav Selectors
    const prevBtn = document.getElementById('cube-prev-btn');
    const nextBtn = document.getElementById('cube-next-btn');
    const submitBtn = document.getElementById('cube-submit-exam-btn');
    const quizNav = document.getElementById('cuberotation-quiz-navigator');

    // 3D Geometry Definition
    const vertices = [
        [-50, -50, -50], // 0. Top-Left-Back
        [ 50, -50, -50], // 1. Top-Right-Back
        [ 50,  50, -50], // 2. Bottom-Right-Back
        [-50,  50, -50], // 3. Bottom-Left-Back
        [-50, -50,  50], // 4. Top-Left-Front
        [ 50, -50,  50], // 5. Top-Right-Front
        [ 50,  50,  50], // 6. Bottom-Right-Front
        [-50,  50,  50]  // 7. Bottom-Left-Front
    ];

    const faces = {
        'TOP':    { indices: [0, 1, 5, 4], normal: [0, -1, 0], color: 'rgba(0, 242, 254, 0.08)' },
        'BOTTOM': { indices: [3, 2, 6, 7], normal: [0, 1, 0],  color: 'rgba(0, 242, 254, 0.08)' },
        'LEFT':   { indices: [0, 4, 7, 3], normal: [-1, 0, 0], color: 'rgba(0, 242, 254, 0.08)' },
        'RIGHT':  { indices: [1, 5, 6, 2], normal: [1, 0, 0],  color: 'rgba(0, 242, 254, 0.08)' },
        'FRONT':  { indices: [4, 5, 6, 7], normal: [0, 0, 1],  color: 'rgba(0, 242, 254, 0.08)' },
        'BACK':   { indices: [0, 1, 2, 3], normal: [0, 0, -1], color: 'rgba(0, 242, 254, 0.08)' }
    };

    // Matrix Math Utilities
    function matrixMultiply(A, B) {
        let C = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                C[r][c] = A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c];
            }
        }
        return C;
    }

    function matrixVectorMultiply(M, v) {
        return {
            x: M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
            y: M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
            z: M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
        };
    }

    function getRotXMatrix(a) {
        return [
            [1, 0, 0],
            [0, Math.cos(a), -Math.sin(a)],
            [0, Math.sin(a), Math.cos(a)]
        ];
    }

    function getRotZMatrix(a) {
        return [
            [Math.cos(a), -Math.sin(a), 0],
            [Math.sin(a), Math.cos(a), 0],
            [0, 0, 1]
        ];
    }

    // Get final matrix for a sequence instantly
    function getFinalMatrix(seq) {
        let m = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        seq.forEach(cmd => {
            let step;
            if (cmd === 'LEFT') step = getRotZMatrix(-Math.PI / 2);
            else if (cmd === 'RIGHT') step = getRotZMatrix(Math.PI / 2);
            else if (cmd === 'FRONT') step = getRotXMatrix(-Math.PI / 2);
            else if (cmd === 'BACK') step = getRotXMatrix(Math.PI / 2);
            m = matrixMultiply(step, m);
        });
        return m;
    }

    // Transition mappings for rolling the cube
    function getNextXFace(currentFace, direction) {
        const rules = {
            'LEFT': {
                'TOP': 'LEFT', 'LEFT': 'BOTTOM', 'BOTTOM': 'RIGHT', 'RIGHT': 'TOP', 'FRONT': 'FRONT', 'BACK': 'BACK'
            },
            'RIGHT': {
                'TOP': 'RIGHT', 'RIGHT': 'BOTTOM', 'BOTTOM': 'LEFT', 'LEFT': 'TOP', 'FRONT': 'FRONT', 'BACK': 'BACK'
            },
            'FRONT': {
                'TOP': 'FRONT', 'FRONT': 'BOTTOM', 'BOTTOM': 'BACK', 'BACK': 'TOP', 'LEFT': 'LEFT', 'RIGHT': 'RIGHT'
            },
            'BACK': {
                'TOP': 'BACK', 'BACK': 'BOTTOM', 'BOTTOM': 'FRONT', 'FRONT': 'TOP', 'LEFT': 'LEFT', 'RIGHT': 'RIGHT'
            }
        };
        return rules[direction][currentFace] || currentFace;
    }

    // --- 3D Projection Canvas Drawing ---
    function setupCanvas() {
        const rect = canvas.parentNode.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        return { w: rect.width, h: rect.height };
    }

    function rotate3D(x, y, z, p, yawVal, r) {
        // Rotate Pitch (X-axis)
        let y1 = y * Math.cos(p) - z * Math.sin(p);
        let z1 = y * Math.sin(p) + z * Math.cos(p);
        
        // Rotate Yaw (Y-axis)
        let x2 = x * Math.cos(yawVal) + z1 * Math.sin(yawVal);
        let z2 = -x * Math.sin(yawVal) + z1 * Math.cos(yawVal);
        
        // Rotate Roll (Z-axis)
        let x3 = x2 * Math.cos(r) - y1 * Math.sin(r);
        let y3 = x2 * Math.sin(r) + y1 * Math.cos(r);
        
        return { x: x3, y: y3, z: z2 };
    }

    function renderCube() {
        if (!active) return;
        const dims = setupCanvas();
        ctx.clearRect(0, 0, dims.w, dims.h);
        
        const cx = dims.w / 2;
        const cy = dims.h / 2;
        
        // Handle roll interpolation
        let renderMatrix;
        if (isAnimating && animProgress < 1.0 && animDirection) {
            animProgress += 0.05; // 20 frames = ~330ms smooth roll
            if (animProgress > 1.0) animProgress = 1.0;
            
            let theta = animProgress * (Math.PI / 2);
            let angle = (animDirection === 'LEFT' || animDirection === 'FRONT') ? -theta : theta;
            let tempStep;
            if (animDirection === 'LEFT' || animDirection === 'RIGHT') {
                tempStep = getRotZMatrix(angle);
            } else {
                tempStep = getRotXMatrix(angle);
            }
            renderMatrix = matrixMultiply(tempStep, currentMatrix);
        } else {
            renderMatrix = targetMatrix;
            isAnimating = false;
        }
        
        // Project all vertices with Orthographic projection to prevent geometric distortion
        const scale = 1.6;
        const projected = vertices.map(v => {
            const rot = matrixVectorMultiply(renderMatrix, v);
            // Apply a fixed viewport tilt for comfortable isometric rendering
            const viewRot = rotate3D(rot.x, rot.y, rot.z, 0.45, 0.78, 0);
            return {
                x: cx + viewRot.x * scale,
                y: cy + viewRot.y * scale,
                z: viewRot.z
            };
        });

        // Face drawing list with Z-sorting (back-to-front painter's algorithm)
        let faceList = [];
        for (let faceName in faces) {
            const f = faces[faceName];
            const zSum = f.indices.reduce((sum, idx) => sum + projected[idx].z, 0);
            const zCenter = zSum / 4;
            
            const p0 = projected[f.indices[0]];
            const p1 = projected[f.indices[1]];
            const p2 = projected[f.indices[2]];
            
            // Cross product of (p1 - p0) and (p2 - p0) to determine visibility
            const v1x = p1.x - p0.x;
            const v1y = p1.y - p0.y;
            const v2x = p2.x - p0.x;
            const v2y = p2.y - p0.y;
            const crossProduct = v1x * v2y - v1y * v2x;
            
            faceList.push({
                name: faceName,
                indices: f.indices,
                z: zCenter,
                visible: crossProduct > 0, // facing user
                color: f.color
            });
        }
        
        faceList.sort((a, b) => a.z - b.z);
        
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        faceList.forEach(f => {
            if (!f.visible) return;
            
            ctx.beginPath();
            ctx.moveTo(projected[f.indices[0]].x, projected[f.indices[0]].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(projected[f.indices[i]].x, projected[f.indices[i]].y);
            }
            ctx.closePath();
            
            // Highlight the "X" face
            const userChoice = isQuizMode && quizQuestions[currentQIndex] ? quizQuestions[currentQIndex].userAnswer : null;
            
            // Show X: before animation starts (initial phase), on answer reveal, or in review
            const isInitialPhase = !isAnimating && sequenceIndex === 0 && activeCommand === "GET READY...";
            const shouldShowX = (isInitialPhase && f.name === 'TOP') || // Startup - always TOP
                               (isAnswered && currentXFace === f.name) || // Free practice correct answer reveal
                               (isReviewMode && currentXFace === f.name); // Review mode correct answer reveal
                               
            if (shouldShowX) {
                ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
                ctx.strokeStyle = "#10b981";
                ctx.lineWidth = 3;
            } else if (isQuizMode && userChoice === f.name) {
                ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 2.5;
            } else {
                ctx.fillStyle = "rgba(0, 242, 254, 0.04)";
                ctx.strokeStyle = "rgba(0, 242, 254, 0.35)";
                ctx.lineWidth = 1.5;
            }
            ctx.fill();
            ctx.stroke();
            
            // Render face label inside visible faces
            const fx = f.indices.reduce((sum, idx) => sum + projected[idx].x, 0) / 4;
            const fy = f.indices.reduce((sum, idx) => sum + projected[idx].y, 0) / 4;
            
            ctx.font = 'bold 10px JetBrains Mono, sans-serif';
            ctx.fillStyle = shouldShowX ? "#10b981" : (isQuizMode && userChoice === f.name ? "#93c5fd" : "rgba(0, 242, 254, 0.6)");
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(f.name, fx, fy);
            
            if (shouldShowX) {
                ctx.font = 'bold 48px Outfit, sans-serif';
                ctx.fillStyle = "#10b981";
                ctx.shadowBlur = 18;
                ctx.shadowColor = "#10b981";
                ctx.fillText("✕", fx, fy - 2);
                ctx.shadowBlur = 0; // reset
            }
        });
        
        if (isAnimating && animProgress < 1.0) {
            requestAnimationFrame(renderCube);
        }
    }

    // --- Sequence Generator ---
    function generateSequence() {
        const directions = ['LEFT', 'RIGHT', 'FRONT', 'BACK'];
        const length = difficultySelect.value === 'easy' ? 3 : difficultySelect.value === 'medium' ? 5 : 7;
        
        let seq = [];
        let prev = null;
        
        for (let i = 0; i < length; i++) {
            let nextDir = directions[Math.floor(Math.random() * 4)];
            while (
                (nextDir === 'LEFT' && prev === 'RIGHT') ||
                (nextDir === 'RIGHT' && prev === 'LEFT') ||
                (nextDir === 'FRONT' && prev === 'BACK') ||
                (nextDir === 'BACK' && prev === 'FRONT')
            ) {
                nextDir = directions[Math.floor(Math.random() * 4)];
            }
            seq.push(nextDir);
            prev = nextDir;
        }
        return seq;
    }

    // --- Command Visualizer & 3D Roll Animation ---
    function playNextCommand() {
        if (!active) return;
        if (sequenceIndex >= currentSequence.length) {
            // Sequence completed
            isAnimating = false;
            activeCommand = "SELECT X";
            commandDisplay.innerText = activeCommand;
            
            // Reset matrix interpolator to final target
            currentMatrix = targetMatrix;
            animProgress = 1.0;
            
            statusMsg.innerText = "การหมุนเสร็จสิ้น! ระบุว่าตำแหน่ง X อยู่ที่ใด ณ ตอนนี้?";
            choicesContainer.style.display = 'grid';
            startBtn.style.display = 'none';
            
            updateChoicesHighlight();
            renderCube();
            return;
        }
        
        const cmd = currentSequence[sequenceIndex];
        activeCommand = `${sequenceIndex + 1}/${currentSequence.length}: ROLL ${cmd}`;
        commandDisplay.innerText = activeCommand;
        
        // Prepare interpolation variables
        currentMatrix = targetMatrix;
        animProgress = 0.0;
        animDirection = cmd;
        isAnimating = true;
        
        // Compute new target rotation matrix
        let stepMatrix;
        if (cmd === 'LEFT') stepMatrix = getRotZMatrix(-Math.PI / 2);
        else if (cmd === 'RIGHT') stepMatrix = getRotZMatrix(Math.PI / 2);
        else if (cmd === 'FRONT') stepMatrix = getRotXMatrix(-Math.PI / 2);
        else if (cmd === 'BACK') stepMatrix = getRotXMatrix(Math.PI / 2);
        targetMatrix = matrixMultiply(stepMatrix, currentMatrix);
        
        // Shift X location internally
        currentXFace = getNextXFace(currentXFace, cmd);
        
        window.playSound('beep');
        sequenceIndex++;
        renderCube();
        
        gameTimer = setTimeout(playNextCommand, 1500);
    }

    function startRound() {
        if (isAnimating) return;
        
        isAnimating = false;
        isAnswered = false;
        sequenceIndex = 0;
        
        currentXFace = "TOP"; 
        initialXFace = "TOP";
        
        currentSequence = generateSequence();
        activeCommand = "GET READY...";
        commandDisplay.innerText = activeCommand;
        
        currentMatrix = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        targetMatrix = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        animProgress = 1.0;
        animDirection = null;
        
        statusMsg.innerText = "จำตำแหน่งตั้งต้นของ ✕ (อยู่ที่ด้านบน TOP) การทดสอบกำลังจะเริ่มขึ้น...";
        choicesContainer.style.display = 'none';
        startBtn.style.display = 'none';
        
        // Clean button colors
        document.querySelectorAll('.btn-cube-choice').forEach(btn => {
            btn.className = 'btn-cube-choice';
        });

        renderCube();
        
        // Start roll sequence after 2.5 seconds (longer to let user see X)
        gameTimer = setTimeout(playNextCommand, 2500);
        questionStartTime = Date.now();
    }

    function checkAnswer(chosenFace, btnEl) {
        if (isAnimating) return;

        if (isQuizMode) {
            // Save answer and update UI
            quizQuestions[currentQIndex].userAnswer = chosenFace;
            updateQuizNavigator();
            updateChoicesHighlight();
            window.playSound('beep');
            renderCube(); // redraw to show selection highlight
            return;
        }

        if (isAnswered) return;
        isAnswered = true;
        totalAttempts++;
        
        const isCorrect = (chosenFace === currentXFace);
        
        if (isCorrect) {
            window.playSound('correct');
            correctAttempts++;
            score += 10;
            window.showToast("CORRECT");
            btnEl.classList.add('correct');
        } else {
            window.playSound('wrong');
            window.showToast("WRONG");
            btnEl.classList.add('wrong');
            
            // Highlight correct button
            document.querySelectorAll('.btn-cube-choice').forEach(btn => {
                if (btn.dataset.face === currentXFace) btn.classList.add('correct');
            });
        }
        
        updateStats();
        renderCube(); // Redraw to reveal X position on canvas
        
        statusMsg.innerText = isCorrect ? "ถูกต้องที่สุด! คะแนนประมวลผลเพิ่มขึ้น" : `ผิดพลาด! ตำแหน่งที่ถูกต้องคือ ${currentXFace}`;
        startBtn.innerText = "เริ่มรอบถัดไป (NEXT)";
        startBtn.style.display = 'block';
    }

    function updateChoicesHighlight() {
        const userChoice = isQuizMode ? quizQuestions[currentQIndex].userAnswer : null;
        document.querySelectorAll('.btn-cube-choice').forEach(btn => {
            btn.className = 'btn-cube-choice';
            if (isQuizMode && userChoice === btn.dataset.face) {
                btn.classList.add('selected-exam');
            }
        });
    }

    function updateStats() {
        scoreVal.innerText = score;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accVal.innerText = acc + "%";
    }

    // --- Exam Mode Navigation System ---
    function loadQuestion(idx) {
        if (isAnimating) return;
        currentQIndex = idx;
        
        const q = quizQuestions[idx];
        currentSequence = q.sequence;
        currentXFace = q.correctFace;
        initialXFace = q.initialXFace;
        
        isAnswered = false;
        
        // Hide choices by default
        choicesContainer.style.display = 'none';
        startBtn.style.display = 'none';
        
        // Set Navigator title
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        // Set footer buttons visibility
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();

        if (!q.isPlayed) {
            // Unplayed question: start roll animations
            q.isPlayed = true;
            
            sequenceIndex = 0;
            activeCommand = "GET READY...";
            commandDisplay.innerText = activeCommand;
            
            currentMatrix = [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1]
            ];
            targetMatrix = [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1]
            ];
            animProgress = 1.0;
            animDirection = null;
            
            statusMsg.innerText = "จำตำแหน่งตั้งต้นของ ✕ (อยู่ที่ด้านบน TOP) การหมุนกำลังจะเริ่มขึ้น...";
            renderCube();
            
            clearTimeout(gameTimer);
            gameTimer = setTimeout(playNextCommand, 2500);
        } else {
            // Already played question: jump directly to selection screen
            clearTimeout(gameTimer);
            sequenceIndex = currentSequence.length;
            activeCommand = "SELECT X";
            commandDisplay.innerText = activeCommand;
            
            targetMatrix = getFinalMatrix(currentSequence);
            currentMatrix = targetMatrix;
            animProgress = 1.0;
            animDirection = null;
            
            statusMsg.innerText = "ตำแหน่งลูกบาศก์สิ้นสุดแล้ว ระบุเครื่องหมาย X:";
            choicesContainer.style.display = 'grid';
            updateChoicesHighlight();
            renderCube();
        }
        questionStartTime = Date.now();
    }

    function goToQuestion(idx) {
        if (isAnimating) return;
        if (idx < 0 || idx >= maxQuizQ) return;
        
        // Accumulate elapsed time on current question
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
            btn.onclick = () => {
                if (isAnimating) return;
                goToQuestion(idx);
            };
            quizNav.appendChild(btn);
        });
    }

    function handlePrev() {
        if (isAnimating) return;
        goToQuestion(currentQIndex - 1);
    }

    function handleNext() {
        if (isAnimating) return;
        
        if (currentQIndex === maxQuizQ - 1) {
            // Trigger submit confirmation directly
            submitQuiz();
        } else {
            goToQuestion(currentQIndex + 1);
        }
    }

    function submitQuiz() {
        if (isAnimating) return;
        
        const answeredCount = quizQuestions.filter(q => q.userAnswer !== null).length;
        const confirmMsg = answeredCount === maxQuizQ ? 
            "คุณต้องการส่งกระดาษคำตอบใช่หรือไม่?" : 
            `คุณตอบไปแล้ว ${answeredCount}/${maxQuizQ} ข้อ มีข้อที่ยังไม่ได้ทำอีก ${maxQuizQ - answeredCount} ข้อ ต้องการส่งคำตอบเลยหรือไม่?`;
            
        if (!confirm(confirmMsg)) return;
        
        finishExam();
    }

    function finishExam() {
        clearTimeout(gameTimer);
        clearInterval(timerInterval);
        
        // Save final question's elapsed time
        if (quizQuestions[currentQIndex]) {
            quizQuestions[currentQIndex].timeSpent += (Date.now() - questionStartTime);
        }
        
        let correct = 0;
        const historyDetails = quizQuestions.map((q, idx) => {
            const isCorrect = (q.userAnswer === q.correctFace);
            if (isCorrect) correct++;
            
            return {
                type: `หมุน ${q.sequence.length} รอบ`,
                isCorrect: isCorrect,
                timeTaken: q.timeSpent,
                questionIndex: idx,
                // Deep clone state for review
                savedQuestion: {
                    sequence: q.sequence,
                    correctFace: q.correctFace,
                    userAnswer: q.userAnswer
                }
            };
        });
        
        // Hide exam elements
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        window.showQuizResult('cuberotation', correct, maxQuizQ, quizTimerCount, historyDetails);
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
        for (let i = 0; i < maxQuizQ; i++) {
            let seq = generateSequence();
            let finalFace = "TOP";
            seq.forEach(cmd => {
                finalFace = getNextXFace(finalFace, cmd);
            });
            quizQuestions.push({
                sequence: seq,
                correctFace: finalFace,
                initialXFace: "TOP",
                userAnswer: null,
                timeSpent: 0,
                isPlayed: false
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
        
        // Hide exam-specific elements only
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        score = 0; totalAttempts = 0; correctAttempts = 0;
        updateStats();
        
        clearTimeout(gameTimer);
        isAnimating = false;
        isAnswered = false;
        currentXFace = "TOP";
        activeCommand = "READY";
        commandDisplay.innerText = activeCommand;
        
        choicesContainer.style.display = 'none';
        startBtn.style.display = 'block';
        startBtn.innerText = "เริ่มรอบใหม่ (START)";
        statusMsg.innerText = "สังเกตตำแหน่งเครื่องหมาย ✕ บนลูกบาศก์ กดเริ่มเพื่อเริ่มเล่นทรานสิชัน";
        
        currentMatrix = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        targetMatrix = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
        animProgress = 1.0;
        animDirection = null;
        
        // Reset nextBtn binding
        nextBtn.onclick = handleNext;
        
        renderCube();
    }

    // --- Quiz Review Interface ---
    function reviewQuestion(historyIndex) {
        // Find corresponding quiz history entry
        const item = quizQuestions[historyIndex];
        if (!item) return;

        isReviewMode = true;
        isAnswered = true;
        isQuizMode = false;
        isAnimating = false;
        
        clearTimeout(gameTimer);
        
        currentSequence = item.sequence;
        currentXFace = item.correctFace;
        initialXFace = item.initialXFace;
        sequenceIndex = currentSequence.length;
        
        activeCommand = "REVIEW MODE";
        commandDisplay.innerText = activeCommand;
        
        statusMsg.innerText = `ดูเฉลยข้อที่ ${historyIndex + 1}: เฉลยคือ ${currentXFace} | คำตอบคุณคือ: ${item.userAnswer || 'ไม่ได้ทำ'}`;
        
        // Set exact final rotation matrix
        targetMatrix = getFinalMatrix(currentSequence);
        currentMatrix = targetMatrix;
        animProgress = 1.0;
        animDirection = null;
        
        choicesContainer.style.display = 'grid';
        startBtn.style.display = 'none';
        
        // Show correct button and wrong button highlights
        document.querySelectorAll('.btn-cube-choice').forEach(btn => {
            btn.className = 'btn-cube-choice';
            if (btn.dataset.face === currentXFace) {
                btn.classList.add('correct');
            } else if (btn.dataset.face === item.userAnswer) {
                btn.classList.add('wrong');
            }
        });
        
        // Display Return to results button
        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action primary";
        nextBtn.onclick = () => {
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext; // Reset binding
        };
        
        renderCube();
    }

    // Bindings
    startBtn.addEventListener('click', startRound);
    
    document.querySelectorAll('.btn-cube-choice').forEach(btn => {
        btn.addEventListener('click', () => {
            checkAnswer(btn.dataset.face, btn);
        });
    });

    runModeSelect.addEventListener('change', toggleRunMode);
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
        
        // Start round on spacebar
        if (!isAnimating && startBtn.style.display !== 'none' && e.key === ' ') {
            startRound();
            e.preventDefault();
            return;
        }

        // Choice selection
        if (!isAnimating && choicesContainer.style.display !== 'none') {
            let chosenFace = null;
            if (key === '1' || key === 't') chosenFace = 'TOP';
            else if (key === '2' || key === 'b') chosenFace = 'BOTTOM';
            else if (key === '3' || key === 'l') chosenFace = 'LEFT';
            else if (key === '4' || key === 'r') chosenFace = 'RIGHT';
            else if (key === '5' || key === 'f') chosenFace = 'FRONT';
            else if (key === '6' || key === 'k') chosenFace = 'BACK';
            
            if (chosenFace) {
                const btn = document.querySelector(`.btn-cube-choice[data-face="${chosenFace}"]`);
                if (btn) {
                    checkAnswer(chosenFace, btn);
                }
            }
        }
    }

    return {
        start: function() {
            active = true;
            isReviewMode = false;
            
            document.getElementById('cuberotation-lobby').style.display = 'flex';
            document.getElementById('cuberotation-stage').style.display = 'none';
            
            const startBtnLobby = document.getElementById('cuberotation-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#cuberotation-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                difficultySelect.value = document.getElementById('lobby-cube-difficulty').value;
                
                document.getElementById('cuberotation-lobby').style.display = 'none';
                document.getElementById('cuberotation-stage').style.display = 'flex';
                
                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };
        },
        stop: function() {
            active = false;
            clearTimeout(gameTimer);
            clearInterval(timerInterval);
        },
        review: reviewQuestion,
        handleKeyDown: handleKeyDown
    };
})();

// Attach to window explicitly for global access
window.CubeRotationEngine = CubeRotationEngine;
