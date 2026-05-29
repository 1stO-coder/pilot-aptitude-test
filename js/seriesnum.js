const SeriesNumEngine = (function() {
    let active = false;
    let quizTimer = 300; // 5 minutes
    let quizTimerInterval = null;
    let questionStartTime = 0;
    
    // States
    let questionsList = [];
    let currentQuestionIndex = 0; // for practice mode
    let answeredCount = 0;
    let quizHistory = [];
    
    // UI Elements
    const runModeSelect = document.getElementById('series-run-mode');
    const difficultySelect = document.getElementById('series-difficulty');
    const questionsGrid = document.getElementById('series-questions-grid');
    const submitWrapper = document.getElementById('series-submit-wrapper');
    const submitBtn = document.getElementById('series-submit-btn');
    const nextBtn = document.getElementById('series-next-btn');
    const scoreVal = document.getElementById('series-score');
    const timerVal = document.getElementById('series-timer');
    const difficultyVal = document.getElementById('series-difficulty-val');
    const modeTag = document.getElementById('series-mode-tag');

    const LV_NAME = { easy: 'ง่าย', med: 'ปานกลาง', hard: 'ยาก', vhard: 'ยากมาก' };
    const LV_HEX = { easy: '#00c896', med: '#3da5ff', hard: '#ffaa3b', vhard: '#ff6060' };

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
    const ok = (seq, max = 999) => seq.length > 0 && seq.every(v => Number.isInteger(v) && v > 0 && v <= max);

    // --- Generators Pool ---
    const P = {
        easy: [
            () => {
                const d = rnd(2, 15), a = rnd(2, 20), n = 6, s = Array.from({length: n}, (_, i) => a + i * d);
                return ok(s) ? { seq: s, rule: `+${d} ทุกตัว`, explain: `เริ่มต้นด้วย ${a} แล้วบวกเพิ่มทีละ ${d} ทุกตัว: ${s.join(' → ')}` } : null;
            },
            () => {
                const d = rnd(2, 12), n = 6, a = d * (n - 1) + rnd(5, 40), s = Array.from({length: n}, (_, i) => a - i * d);
                return ok(s) ? { seq: s, rule: `-${d} ทุกตัว`, explain: `เริ่มต้นด้วย ${a} แล้วลบออกทีละ ${d} ทุกตัว: ${s.join(' → ')}` } : null;
            },
            () => {
                const a = rnd(2, 12), n = 5, s = Array.from({length: n}, (_, i) => a * Math.pow(2, i));
                return ok(s) ? { seq: s, rule: `×2 ทุกตัว`, explain: `${s[0]} × 2 = ${s[1]}, ${s[1]} × 2 = ${s[2]}, ... คูณ 2 ไปเรื่อยๆ` } : null;
            },
            () => {
                const a = rnd(1, 4), n = 5, s = Array.from({length: n}, (_, i) => a * Math.pow(3, i));
                return ok(s) ? { seq: s, rule: `×3 ทุกตัว`, explain: `${s[0]} × 3 = ${s[1]}, ${s[1]} × 3 = ${s[2]}, ... คูณ 3 ไปเรื่อยๆ` } : null;
            },
            () => {
                const st = rnd(1, 5), n = 6, s = Array.from({length: n}, (_, i) => Math.pow(st + i, 2));
                return ok(s) ? { seq: s, rule: `n² (กำลังสอง)`, explain: `${st}² = ${s[0]}, ${st + 1}² = ${s[1]}, ${st + 2}² = ${s[2]}, ... ลำดับกำลังสองสะสม` } : null;
            },
            () => {
                const a = rnd(3, 10), b = rnd(3, 10), st = rnd(5, 18), n = 7, s = [st];
                for (let i = 1; i < n; i++) s.push(s[i - 1] + (i % 2 === 1 ? a : b));
                return ok(s) ? { seq: s, rule: `สลับ +${a} และ +${b}`, explain: `บวกสลับกันระหว่าง +${a} และ +${b}: ${s.join(', ')}` } : null;
            },
            () => {
                const a = rnd(2, 7), n = 6, s = [a];
                for (let i = 1; i < n; i++) s.push(s[i - 1] * 2 - 1);
                return ok(s) ? { seq: s, rule: `×2 แล้วลบ 1`, explain: `${s[0]} × 2 - 1 = ${s[1]}, ${s[1]} × 2 - 1 = ${s[2]}, ... ทุกตัวคือค่าก่อนหน้าคูณ 2 ลบ 1` } : null;
            },
            () => {
                const m = rnd(4, 12), n = 6, s = Array.from({length: n}, (_, i) => m * (i + 1));
                return ok(s) ? { seq: s, rule: `พหุคูณของ ${m}`, explain: `${m}×1, ${m}×2, ${m}×3, ... ตารางแม่สูตรคูณของเลข ${m}` } : null;
            },
            () => {
                const a = rnd(1, 12), n = 6, s = [a];
                for (let i = 1; i < n; i++) s.push(s[i - 1] + i * 2);
                const diffs = s.slice(1).map((v, i) => v - s[i]);
                return ok(s) ? { seq: s, rule: `+2,+4,+6,+8,...`, explain: `ผลต่าง: ${diffs.join(', ')} — เพิ่มขึ้นทีละ 2 ช่วง (บวกเลขคู่เรียงลำดับ)` } : null;
            },
            () => {
                const pow = rnd(4, 7), a = Math.pow(2, pow), n = pow + 1, s = Array.from({length: n}, (_, i) => a / Math.pow(2, i));
                return ok(s, 999) && n <= 7 ? { seq: s, rule: `÷2 ทุกตัว`, explain: `${s[0]} ÷ 2 = ${s[1]}, ${s[1]} ÷ 2 = ${s[2]} ... หาร 2 ไปเรื่อยๆ` } : null;
            }
        ],
        med: [
            () => {
                const a = rnd(1, 5), b = rnd(1, 8), n = 7, s = [a, b];
                for (let i = 2; i < n; i++) s.push(s[i - 1] + s[i - 2]);
                return ok(s) ? { seq: s, rule: `Fibonacci`, explain: `${a} + ${b} = ${s[2]}, ${b} + ${s[2]} = ${s[3]} ... ตัวถัดไปคือผลรวมสองตัวก่อนหน้า` } : null;
            },
            () => {
                const c = rnd(1, 6), a = rnd(3, 10), n = 6, s = [a];
                for (let i = 1; i < n; i++) s.push(s[i - 1] * 2 + c);
                return ok(s) ? { seq: s, rule: `×2 แล้ว +${c}`, explain: `${s[0]}×2+${c}=${s[1]}, ${s[1]}×2+${c}=${s[2]}, ... ตัวถัดไปคือตัวก่อนหน้าคูณ 2 แล้วบวกด้วย ${c}` } : null;
            },
            () => {
                const d = rnd(3, 10), a = rnd(3, 10), n = 7, s = [a];
                for (let i = 1; i < n; i++) s.push(i % 2 === 1 ? s[i - 1] * 2 : s[i - 1] + d);
                return ok(s) ? { seq: s, rule: `สลับ ×2 และ +${d}`, explain: `สลับกฎโดยคูณ 2 แล้วตามด้วยบวก ${d} วนซ้ำ: ${s.join(', ')}` } : null;
            },
            () => {
                const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
                const st = rnd(0, 8), s = primes.slice(st, st + 6);
                return { seq: s, rule: `จำนวนเฉพาะ`, explain: `อนุกรมจำนวนเฉพาะเรียงตามลำดับ: ${s.join(', ')}` };
            },
            () => {
                const st = rnd(1, 3), n = 5, s = Array.from({length: n}, (_, i) => Math.pow(st + i, 3));
                return ok(s) ? { seq: s, rule: `n³ (กำลังสาม)`, explain: `${st}³ = ${s[0]}, ${st + 1}³ = ${s[1]} ... ลำดับยกกำลังสาม` } : null;
            },
            () => {
                const bases = [4, 6, 8, 10, 12, 16, 18, 20, 24, 32];
                const a = bases[rnd(0, bases.length - 1)], n = 5, s = [a];
                for (let i = 1; i < n; i++) {
                    const v = s[i - 1] * 3 / 2;
                    if (!Number.isInteger(v)) return null;
                    s.push(v);
                }
                return ok(s) ? { seq: s, rule: `×1.5 ทุกตัว`, explain: `${s[0]} × 1.5 = ${s[1]}, ${s[1]} × 1.5 = ${s[2]} ... (คูณ 3 แล้วหาร 2)` } : null;
            }
        ],
        hard: [
            () => {
                const a = rnd(1, 3), b = rnd(1, 4), c = rnd(0, 5), n = 7, s = Array.from({length: n}, (_, i) => a * (i + 1) * (i + 1) + b * (i + 1) + c);
                if (!ok(s)) return null;
                const d1 = s.slice(1).map((v, i) => v - s[i]);
                const d2 = d1.slice(1).map((v, i) => v - d1[i]);
                return { seq: s, rule: `สูตรสมการกำลังสอง`, explain: `ชั้นแรกต่างกัน: ${d1.join(',')}, ชั้นที่สองต่างคงที่ = ${d2[0]} (สมการพหุนามกำลังสอง)` };
            },
            () => {
                const e = rnd(1, 3), a = rnd(5, 18), n = 7, s = [a]; let v = rnd(3, 8);
                for (let i = 1; i < n; i++) { s.push(s[i - 1] + v); v += e; }
                return ok(s) ? { seq: s, rule: `ผลต่างสองชั้นเพิ่มขึ้นคงที่`, explain: `ผลต่างช่วงแรก: ${s.slice(1).map((val, idx) => val - s[idx]).join(', ')} — ซึ่งผลต่างนั้นบวกเพิ่มช่วงละ ${e}` } : null;
            },
            () => {
                const c = rnd(1, 4), n = 7, s = Array.from({length: n}, (_, i) => Math.pow(2, i + 1) + c);
                return ok(s) ? { seq: s, rule: `2ⁿ + ${c}`, explain: `2¹+${c}=${s[0]}, 2²+${c}=${s[1]}, 2³+${c}=${s[2]} ... อนุกรมแบบทวีคูณบวกค่าคงที่` } : null;
            }
        ],
        vhard: [
            () => {
                const a = rnd(1, 3), b = rnd(1, 3), c = rnd(1, 3), n = 8, s = [a, b, c];
                for (let i = 3; i < n; i++) s.push(s[i - 1] + s[i - 2] + s[i - 3]);
                return ok(s) ? { seq: s, rule: `ผลรวม 3 ตัวก่อนหน้า`, explain: `${a} + ${b} + ${c} = ${s[3]}, ${b} + ${c} + ${s[3]} = ${s[4]} ... บวกสะสมทีละ 3 ค่า` } : null;
            },
            () => {
                const a = rnd(5, 20), b = rnd(2, 5), n = 7;
                const terms = Array.from({length: n}, (_, i) => a + i * b);
                const s = terms.map((_, i) => terms.slice(0, i + 1).reduce((acc, val) => acc + val, 0));
                return ok(s) ? { seq: s, rule: `ผลรวมสะสมอนุกรม`, explain: `บวกสะสมของอนุกรม ${terms.join(', ')} ส่งผลให้ลำดับรวมเท่ากับ: ${s.join(' → ')}` } : null;
            },
            () => {
                const c = rnd(2, 5), a = rnd(c + 1, 10), n = 6, s = [a];
                for (let i = 1; i < n; i++) s.push(s[i - 1] * 3 - c);
                return ok(s) ? { seq: s, rule: `×3 แล้วลบ ${c}`, explain: `${s[0]}×3-${c}=${s[1]}, ${s[1]}×3-${c}=${s[2]}, ... ค่าก่อนหน้าคูณ 3 ลบด้วย ${c}` } : null;
            }
        ]
    };

    function generateQuestions(level, count = 20) {
        const pool = P[level];
        const usedRules = new Set();
        const results = [];
        let attempts = 0;
        
        const indices = shuffle([...Array(pool.length).keys()]);
        let cur = 0;
        
        while (results.length < count && attempts < 400) {
            attempts++;
            const pi = indices[cur % indices.length];
            cur++;
            
            const r = pool[pi]();
            if (!r || usedRules.has(r.rule)) continue;
            usedRules.add(r.rule);
            
            const answer = r.seq[r.seq.length - 1];
            const display = r.seq.slice(0, -1);
            
            // Build unique distractor options
            const spread = Math.max(4, Math.ceil(answer * 0.2) + 2);
            const dist = new Set();
            let limit = 0;
            
            while (dist.size < 3 && limit < 100) {
                limit++;
                const off = rnd(1, spread);
                const sign = Math.random() < 0.5 ? 1 : -1;
                const val = answer + sign * off;
                if (val !== answer && val > 0 && val <= 999) dist.add(val);
            }
            
            // Fillers if dist is too small
            for (let offset = 1; offset <= 8; offset++) {
                if (dist.size < 3) {
                    if (answer + offset > 0 && answer + offset <= 999) dist.add(answer + offset);
                    if (answer - offset > 0 && answer - offset <= 999) dist.add(answer - offset);
                }
            }
            
            results.push({
                seq: display,
                answer: answer,
                choices: shuffle([answer, ...Array.from(dist).slice(0, 3)]),
                rule: r.rule,
                explain: r.explain,
                picked: null
            });
        }
        return results;
    }

    // --- GUI Renders ---
    function renderQuizGrid() {
        questionsGrid.innerHTML = '';
        
        if (runModeSelect.value === 'quiz') {
            submitWrapper.style.display = 'block';
            nextBtn.style.display = 'none';
            
            questionsList.forEach((q, qi) => {
                const card = document.createElement('div');
                card.className = 'series-q-card';
                card.id = `series-qc-${qi}`;
                
                const seriesHtml = q.seq.map(v => `<span>${v}</span>`).join('<span style="color:var(--text-dim); margin:0 4px">,</span>')
                    + `<span style="color:var(--text-dim); margin:0 4px">,</span><span class="series-blank" id="series-blank-${qi}"> ? </span>`;
                
                const choicesHtml = q.choices.map((c, ci) => `
                    <button class="btn-series-choice" id="series-choice-${qi}-${ci}" onclick="SeriesNumEngine.pickAnswer(${qi}, ${ci})">${c}</button>
                `).join('');
                
                card.innerHTML = `
                    <div class="series-q-header">
                        <span class="series-q-no">คำถามข้อที่ #${String(qi+1).padStart(2, '0')}</span>
                        <span class="series-q-lbl" style="color: ${LV_HEX[difficultySelect.value]}">${LV_NAME[difficultySelect.value]}</span>
                    </div>
                    <div class="series-display">${seriesHtml}</div>
                    <div class="series-choices-grid">${choicesHtml}</div>
                    <div class="series-explain-box" id="series-explain-${qi}" style="display:none;"></div>
                `;
                questionsGrid.appendChild(card);
            });
            
            submitBtn.disabled = true;
            submitBtn.className = "btn-action";
            submitBtn.innerText = "ตอบคำถามให้ครบถ้วนเพื่อส่งกระดาษคำตอบ";
        } else {
            // Free play mode: Render only the active single question card
            submitWrapper.style.display = 'none';
            nextBtn.style.display = 'block';
            nextBtn.innerText = "ข้ามข้อนี้";
            nextBtn.className = "btn-action";
            
            const q = questionsList[currentQuestionIndex];
            const card = document.createElement('div');
            card.className = 'series-q-card';
            card.style.gridColumn = 'span 2'; // fill width
            card.id = `series-qc-${currentQuestionIndex}`;
            
            const seriesHtml = q.seq.map(v => `<span>${v}</span>`).join('<span style="color:var(--text-dim); margin:0 4px">,</span>')
                + `<span style="color:var(--text-dim); margin:0 4px">,</span><span class="series-blank" id="series-blank-${currentQuestionIndex}"> ? </span>`;
            
            const choicesHtml = q.choices.map((c, ci) => `
                <button class="btn-series-choice" id="series-choice-${currentQuestionIndex}-${ci}" onclick="SeriesNumEngine.pickAnswer(${currentQuestionIndex}, ${ci})">${c}</button>
            `).join('');
            
            card.innerHTML = `
                <div class="series-q-header">
                    <span class="series-q-no">ฝึกฝนทักษะตรรกะตัวเลข</span>
                    <span class="series-q-lbl" style="color: ${LV_HEX[difficultySelect.value]}">${LV_NAME[difficultySelect.value]}</span>
                </div>
                <div class="series-display">${seriesHtml}</div>
                <div class="series-choices-grid">${choicesHtml}</div>
                <div class="series-explain-box" id="series-explain-${currentQuestionIndex}" style="display:none;"></div>
            `;
            questionsGrid.appendChild(card);
        }
    }

    function pickAnswer(qi, ci) {
        if (!active) return;
        const q = questionsList[qi];
        if (q.picked !== null) return; // Answered already
        
        q.picked = ci;
        answeredCount++;
        
        const isCorrect = (q.choices[ci] === q.answer);
        
        // Render highlights on buttons
        q.choices.forEach((c, idx) => {
            const btn = document.getElementById(`series-choice-${qi}-${idx}`);
            btn.classList.add('disabled');
            if (idx === ci) {
                btn.classList.add('selected');
            }
        });
        
        if (runModeSelect.value === 'quiz') {
            scoreVal.innerText = `${answeredCount}/20`;
            
            // Auto scroll to next unanswered card
            for (let i = qi + 1; i < questionsList.length; i++) {
                if (questionsList[i].picked === null) {
                    setTimeout(() => {
                        const nextCard = document.getElementById(`series-qc-${i}`);
                        if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 240);
                    break;
                }
            }
            
            if (answeredCount === 20) {
                submitBtn.disabled = false;
                submitBtn.className = "btn-action primary";
                submitBtn.innerText = "✓ ส่งคำตอบและวิเคราะห์ผลสอบ";
                setTimeout(() => {
                    submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        } else {
            // Free play mode: Reveal details instantly
            const card = document.getElementById(`series-qc-${qi}`);
            const blank = document.getElementById(`series-blank-${qi}`);
            const explainBox = document.getElementById(`series-explain-${qi}`);
            
            blank.innerText = ` ${q.answer} `;
            explainBox.style.display = 'block';
            explainBox.innerHTML = `<b>💡 คำอธิบายกฎความสัมพันธ์:</b> ${q.explain}`;
            
            if (isCorrect) {
                window.playSound('correct');
                blank.className = "series-blank correct";
                card.classList.add('correct-card');
                window.showToast("CORRECT");
            } else {
                window.playSound('wrong');
                blank.className = "series-blank wrong";
                card.classList.add('wrong-card');
                window.showToast("WRONG");
                
                // Highlight incorrect choice
                q.choices.forEach((c, idx) => {
                    const btn = document.getElementById(`series-choice-${qi}-${idx}`);
                    if (c === q.answer) btn.classList.add('correct');
                    if (idx === ci) btn.classList.add('wrong');
                });
            }
            
            nextBtn.innerText = "ข้อถัดไป ➔";
            nextBtn.className = "btn-action primary";
        }
    }

    function handleNext() {
        if (runModeSelect.value === 'quiz') return;
        
        currentQuestionIndex++;
        // Generate a new list of practice questions if we run out
        if (currentQuestionIndex >= questionsList.length) {
            questionsList = generateQuestions(difficultySelect.value, 10);
            currentQuestionIndex = 0;
        }
        
        answeredCount = 0;
        renderQuizGrid();
    }

    function startQuiz() {
        clearInterval(quizTimerInterval);
        difficultyVal.innerText = LV_NAME[difficultySelect.value];
        difficultyVal.style.color = LV_HEX[difficultySelect.value];
        
        answeredCount = 0;
        quizHistory = [];
        
        if (runModeSelect.value === 'quiz') {
            modeTag.innerText = "Timed Challenge (Exam)";
            timerVal.style.display = 'block';
            scoreVal.innerText = "0/20";
            
            questionsList = generateQuestions(difficultySelect.value, 20);
            
            quizTimer = 300;
            updateTimerText();
            
            quizTimerInterval = setInterval(() => {
                quizTimer--;
                updateTimerText();
                window.playSound('timer');
                
                if (quizTimer <= 60) {
                    timerVal.style.color = 'var(--wrong)';
                } else {
                    timerVal.style.color = 'var(--amber)';
                }
                
                if (quizTimer <= 0) {
                    clearInterval(quizTimerInterval);
                    autoSubmit();
                }
            }, 1000);
        } else {
            modeTag.innerText = "Free Practice";
            timerVal.style.display = 'none';
            scoreVal.innerText = "Practice Mode";
            
            questionsList = generateQuestions(difficultySelect.value, 10);
            currentQuestionIndex = 0;
        }
        
        renderQuizGrid();
        questionStartTime = Date.now();
    }

    function updateTimerText() {
        const m = Math.floor(quizTimer / 60);
        const s = (quizTimer % 60).toString().padStart(2, '0');
        timerVal.innerText = `${m}:${s}`;
    }

    function autoSubmit() {
        // Any unanswered question is logged as incorrect
        questionsList.forEach(q => {
            if (q.picked === null) q.picked = -1;
        });
        finishQuiz();
    }

    function finishQuiz() {
        clearInterval(quizTimerInterval);
        
        let correct = 0;
        const historyDetails = [];
        const secondsSpent = 300 - quizTimer;
        
        questionsList.forEach((q, idx) => {
            const isCorrect = q.picked >= 0 && q.choices[q.picked] === q.answer;
            if (isCorrect) correct++;
            
            historyDetails.push({
                type: q.rule,
                isCorrect: isCorrect,
                timeTaken: secondsSpent * 50, // mock splits
                reviewId: idx,
                savedQuestion: JSON.parse(JSON.stringify(q)) // deep clone for reviews
            });
        });
        
        quizHistory = historyDetails;
        window.showQuizResult('seriesnum', correct, 20, secondsSpent, historyDetails);
    }

    // Review logic
    function reviewQuestion(historyIndex) {
        const item = quizHistory[historyIndex];
        if (!item) return;

        // Force render exam structures
        submitWrapper.style.display = 'none';
        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action";
        
        nextBtn.onclick = () => {
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext; // Reset binding
        };

        const q = item.savedQuestion;
        questionsGrid.innerHTML = '';
        
        const card = document.createElement('div');
        card.className = `series-q-card ${item.isCorrect ? 'correct-card' : 'wrong-card'}`;
        card.style.gridColumn = 'span 2';
        
        const seriesHtml = q.seq.map(v => `<span>${v}</span>`).join('<span style="color:var(--text-dim); margin:0 4px">,</span>')
            + `<span style="color:var(--text-dim); margin:0 4px">,</span><span class="series-blank ${item.isCorrect ? 'correct' : 'wrong'}"> ${q.answer} </span>`;
        
        const choicesHtml = q.choices.map((c, ci) => {
            let cls = 'btn-series-choice disabled';
            if (c === q.answer) cls += ' correct';
            else if (ci === q.picked && !item.isCorrect) cls += ' wrong';
            return `<button class="${cls}">${c}</button>`;
        }).join('');
        
        card.innerHTML = `
            <div class="series-q-header">
                <span class="series-q-no">เฉลยพร้อมวิจารณ์คำถาม</span>
                <span class="series-q-lbl" style="color: ${LV_HEX[difficultySelect.value]}">${LV_NAME[difficultySelect.value]}</span>
            </div>
            <div class="series-display">${seriesHtml}</div>
            <div class="series-choices-grid">${choicesHtml}</div>
            <div class="series-explain-box" style="display:block;"><b>💡 คำอธิบายความสัมพันธ์:</b> ${q.explain}</div>
        `;
        questionsGrid.appendChild(card);
    }

    runModeSelect.addEventListener('change', startQuiz);
    difficultySelect.addEventListener('change', startQuiz);
    submitBtn.addEventListener('click', finishQuiz);
    nextBtn.addEventListener('click', handleNext);

    return {
        start: function() {
            active = true;
            
            document.getElementById('seriesnum-lobby').style.display = 'flex';
            document.getElementById('seriesnum-stage').style.display = 'none';
            
            const startBtn = document.getElementById('seriesnum-start-lobby');
            startBtn.onclick = () => {
                const activeModeCard = document.querySelector('#seriesnum-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';
                
                runModeSelect.value = selectedMode;
                difficultySelect.value = document.getElementById('lobby-series-difficulty').value;
                
                document.getElementById('seriesnum-lobby').style.display = 'none';
                document.getElementById('seriesnum-stage').style.display = 'flex';
                
                startQuiz();
            };
        },
        stop: function() {
            active = false;
            clearInterval(quizTimerInterval);
        },
        pickAnswer,
        review: reviewQuestion
    };
})();

// Attach to window explicitly for global access
window.SeriesNumEngine = SeriesNumEngine;

