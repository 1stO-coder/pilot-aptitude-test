const NBackEngine = (function() {
    let active = false;
    let synthCtx = null;
    let nbackTimer = null;
    let stimTimer = null;
    
    // States
    let N = 2;
    let trialIndex = 0;
    let totalTrials = 22;
    let score = 0;
    let isVisualResponded = false;
    let isAudioResponded = false;
    
    let posSequence = [];
    let audSequence = [];
    
    let hits = { pos: 0, aud: 0 };
    let misses = { pos: 0, aud: 0 };
    let falseAlarms = { pos: 0, aud: 0 };
    let totalTargets = { pos: 0, aud: 0 };
    
    // Mode State
    let isChallengeMode = false;
    let challengeTimer = 120; // 2 minutes sprint
    let challengeTimerInterval = null;
    
    const CONSONANTS = ['C', 'F', 'G', 'K', 'M', 'P', 'Q', 'R', 'T'];
    const CONSONANT_FREQ = {
        'C': [220, 440], 'F': [300, 900], 'G': [196, 392],
        'K': [250, 500], 'M': [130, 260], 'P': [350, 700],
        'Q': [175, 350], 'R': [165, 495], 'T': [400, 800]
    };

    // UI Selectors
    const bioSection = document.getElementById('nback-lobby');
    const playArea = document.getElementById('nback-main-play-area');
    const controlsPanel = document.getElementById('nback-controls-panel');
    const runModeSelect = document.getElementById('nback-run-mode');
    const levelSelect = document.getElementById('nback-level-select');
    
    const scoreVal = document.getElementById('nback-score');
    const accVal = document.getElementById('nback-accuracy');
    const trialVal = document.getElementById('nback-trial');
    const levelVal = document.getElementById('nback-level-val');
    
    const letterDisplay = document.getElementById('nback-letter-display');
    const cells = document.querySelectorAll('.nb-cell');
    
    // Audio initialization
    function initSynth() {
        if (synthCtx) return;
        synthCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function playLetterSynth(letter, time) {
        if (!synthCtx || window.soundMuted) return;
        if (synthCtx.state === 'suspended') synthCtx.resume();
        
        const freqs = CONSONANT_FREQ[letter] || [220, 440];
        const now = time || synthCtx.currentTime;

        freqs.forEach((freq, i) => {
            const osc = synthCtx.createOscillator();
            const gain = synthCtx.createGain();
            const filter = synthCtx.createBiquadFilter();
            
            filter.type = 'bandpass';
            filter.frequency.value = freq;
            filter.Q.value = 6;

            osc.type = i === 0 ? 'sawtooth' : 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(i === 0 ? 0.15 : 0.06, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(filter); 
            filter.connect(gain); 
            gain.connect(synthCtx.destination);
            
            osc.start(now); 
            osc.stop(now + 0.25);
        });
    }

    function runTrial() {
        if (!active) return;
        
        if (trialIndex >= totalTrials) {
            endBlock();
            return;
        }

        // Generate visual cell and sound
        const cellPos = Math.floor(Math.random() * 9);
        const audChar = CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];

        // Force match probability (~33% rate)
        let finalPos = cellPos;
        let finalAud = audChar;
        
        if (trialIndex >= N) {
            const forcePos = Math.random() < 0.35;
            const forceAud = Math.random() < 0.35;
            if (forcePos) finalPos = posSequence[trialIndex - N];
            if (forceAud) finalAud = audSequence[trialIndex - N];
        }

        posSequence.push(finalPos);
        audSequence.push(finalAud);

        // Count targets
        if (trialIndex >= N) {
            if (posSequence[trialIndex] === posSequence[trialIndex - N]) totalTargets.pos++;
            if (audSequence[trialIndex] === audSequence[trialIndex - N]) totalTargets.aud++;
        }

        isVisualResponded = false;
        isAudioResponded = false;

        // UI Updates
        trialVal.innerText = `${trialIndex + 1}/${totalTrials}`;
        clearFeedback();

        // Stimulus Flash
        cells.forEach(c => c.classList.remove('active'));
        cells[finalPos].classList.add('active');

        letterDisplay.innerText = finalAud;
        letterDisplay.style.opacity = 1;

        // Play letter audio synth
        playLetterSynth(finalAud);

        // Hide stimulus after 500ms
        stimTimer = setTimeout(() => {
            cells.forEach(c => c.classList.remove('active'));
            letterDisplay.innerText = '—';
        }, 550);

        trialIndex++;

        // Next trial schedule after 3000ms
        nbackTimer = setTimeout(() => {
            // Check for misses
            if (trialIndex > N) {
                const prevTrial = trialIndex - 1;
                const matchesPos = posSequence[prevTrial] === posSequence[prevTrial - N];
                const matchesAud = audSequence[prevTrial] === audSequence[prevTrial - N];
                
                if (matchesPos && !isVisualResponded) {
                    misses.pos++;
                    showFeedback('miss');
                }
                if (matchesAud && !isAudioResponded) {
                    misses.aud++;
                    if (!matchesPos || isVisualResponded) showFeedback('miss');
                }
            }
            runTrial();
        }, 3000);
    }

    function respond(type) {
        if (!active || trialIndex === 0 || trialIndex <= N) return;
        
        const idx = trialIndex - 1;
        const matches = type === 'visual'
            ? posSequence[idx] === posSequence[idx - N]
            : audSequence[idx] === audSequence[idx - N];

        const btn = document.getElementById(type === 'visual' ? 'btn-nback-visual' : 'btn-nback-audio');
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 180);

        if (type === 'visual') {
            if (isVisualResponded) return;
            isVisualResponded = true;
            if (matches) {
                hits.pos++;
                score += 10;
                showFeedback('correct');
                window.playSound('correct');
            } else {
                falseAlarms.pos++;
                showFeedback('wrong');
                window.playSound('wrong');
            }
        } else {
            if (isAudioResponded) return;
            isAudioResponded = true;
            if (matches) {
                hits.aud++;
                score += 10;
                showFeedback('correct');
                window.playSound('correct');
            } else {
                falseAlarms.aud++;
                showFeedback('wrong');
                window.playSound('wrong');
            }
        }
        updateStats();
    }

    function showFeedback(type) {
        clearFeedback();
        const ind = document.getElementById(`nb-ind-${type}`);
        if (ind) ind.classList.add('show');
        setTimeout(clearFeedback, 1000);
    }

    function clearFeedback() {
        ['correct', 'wrong', 'miss'].forEach(id => {
            const ind = document.getElementById(`nb-ind-${id}`);
            if (ind) ind.classList.remove('show');
        });
    }

    function updateStats() {
        scoreVal.innerText = score;
        
        const totalAnswers = hits.pos + hits.aud + falseAlarms.pos + falseAlarms.aud + misses.pos + misses.aud;
        const totalCorrect = hits.pos + hits.aud;
        const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
        accVal.innerText = `${accuracy}%`;
    }

    function startBlock() {
        const activeCard = document.querySelector('#nback-lobby .lobby-mode-card.active');
        isChallengeMode = activeCard ? (activeCard.dataset.mode === 'quiz') : false;
        totalTrials = isChallengeMode ? 60 : 22;
        
        N = parseInt(document.getElementById('lobby-nback-level-select').value);
        sleepVal = parseInt(document.getElementById('lobby-nback-sleep').value);
        stressVal = parseInt(document.getElementById('lobby-nback-stress').value);
        
        runModeSelect.value = isChallengeMode ? 'challenge' : 'practice';
        levelSelect.value = N;

        const warn = (sleepVal < 7) || (stressVal >= 3);
        document.getElementById('nbio-warning').style.display = warn ? 'block' : 'none';

        bioSection.style.display = 'none';
        document.getElementById('nback-stage').style.display = 'flex';
        playArea.style.display = 'flex';
        controlsPanel.style.display = 'flex';
        
        trialIndex = 0;
        score = 0;
        posSequence = [];
        audSequence = [];
        
        hits = { pos: 0, aud: 0 };
        misses = { pos: 0, aud: 0 };
        falseAlarms = { pos: 0, aud: 0 };
        totalTargets = { pos: 0, aud: 0 };

        levelVal.innerText = `${N}-Back`;
        trialVal.innerText = isChallengeMode ? `Challenge` : `1/${totalTrials}`;
        updateStats();

        initSynth();
        
        if (isChallengeMode) {
            startChallengeTimer();
        }

        setTimeout(runTrial, 800);
    }

    function startChallengeTimer() {
        challengeTimer = 120;
        trialVal.innerText = "Challenge";
        clearInterval(challengeTimerInterval);
        
        challengeTimerInterval = setInterval(() => {
            challengeTimer--;
            const m = Math.floor(challengeTimer / 60).toString().padStart(2, '0');
            const s = (challengeTimer % 60).toString().padStart(2, '0');
            
            // Set dynamic text in Trial tracker
            trialVal.innerText = `เวลา: ${m}:${s}`;
            
            if (challengeTimer <= 0) {
                clearInterval(challengeTimerInterval);
                endBlock();
            }
        }, 1000);
    }

    function endBlock() {
        clearInterval(challengeTimerInterval);
        clearTimeout(nbackTimer);
        clearTimeout(stimTimer);
        
        const totalAnswers = hits.pos + hits.aud + falseAlarms.pos + falseAlarms.aud + misses.pos + misses.aud;
        const totalCorrect = hits.pos + hits.aud;
        const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

        // Custom N-level adjustment in adaptive play
        if (!isChallengeMode) {
            let nextN = N;
            if (accuracy > 85 && N < 6) {
                nextN = N + 1;
                window.playSound('levelUp');
                window.showToast(`🎉 EXCELLENT! ปรับขึ้นเป็น ${nextN}-Back`);
            } else if (accuracy < 60 && N > 1) {
                nextN = N - 1;
                window.playSound('wrong');
                window.showToast(`📉 ปรับความยากลงเป็น ${nextN}-Back`);
            }
            N = nextN;
            levelSelect.value = N;
        }

        const elapsed = isChallengeMode ? 120 : (trialIndex * 3);
        const historyDetails = [
            { type: `Visual match`, isCorrect: hits.pos >= misses.pos, timeTaken: 0 },
            { type: `Audio match`, isCorrect: hits.aud >= misses.aud, timeTaken: 0 }
        ];

        window.showQuizResult('nback', totalCorrect, totalAnswers || 1, elapsed, historyDetails);
        resetToBio();
    }

    function resetToBio() {
        clearInterval(challengeTimerInterval);
        clearTimeout(nbackTimer);
        clearTimeout(stimTimer);
        
        bioSection.style.display = 'flex';
        document.getElementById('nback-stage').style.display = 'none';
        playArea.style.display = 'none';
        controlsPanel.style.display = 'none';
        
        cells.forEach(c => c.classList.remove('active'));
        letterDisplay.innerText = '—';
    }

    // Keyboard controls support
    document.addEventListener('keydown', (e) => {
        if (!active || playArea.style.display === 'none') return;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') respond('visual');
        if (e.code === 'KeyL' || e.code === 'ArrowRight') respond('audio');
    });

    // Touch events for iPad
    document.getElementById('btn-nback-visual').addEventListener('click', () => respond('visual'));
    document.getElementById('btn-nback-audio').addEventListener('click', () => respond('audio'));
    
    // Bio form variables
    let sleepVal = 8;
    let stressVal = 1;
    
    document.getElementById('nback-start-lobby').addEventListener('click', startBlock);
    document.getElementById('nback-stop-btn').addEventListener('click', resetToBio);

    runModeSelect.addEventListener('change', () => {
        isChallengeMode = runModeSelect.value === 'challenge';
        totalTrials = isChallengeMode ? 60 : 22; // infinite vs fixed blocks
    });

    levelSelect.addEventListener('change', () => {
        N = parseInt(levelSelect.value);
    });

    return {
        start: function() {
            active = true;
            N = parseInt(levelSelect.value);
            isChallengeMode = runModeSelect.value === 'challenge';
            resetToBio();
        },
        stop: function() {
            active = false;
            clearInterval(challengeTimerInterval);
            clearTimeout(nbackTimer);
            clearTimeout(stimTimer);
        }
    };
})();

// Attach to window explicitly for global access
window.NBackEngine = NBackEngine;

