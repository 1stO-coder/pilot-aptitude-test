// ═══════════════════════════════════════════════
// GLOBAL STATE & DATABASE MANAGER
// ═══════════════════════════════════════════════

const DB_KEY = "skytest_pilot_baseline_v1";

const DEFAULT_DB = {
    sessions: [], // { date, gameId, mode, score, correct, total, pct, sec }
    badges: [],   // list of unlocked badge IDs
    streakRecord: 0
};

let appState = DEFAULT_DB;

// Load DB from localStorage
function loadDB() {
    try {
        const data = localStorage.getItem(DB_KEY);
        if (data) {
            appState = JSON.parse(data);
            if (!appState || typeof appState !== 'object') appState = DEFAULT_DB;
            // Ensure compatibility
            if (!appState.sessions) {
                appState.sessions = [];
            } else {
                appState.sessions = appState.sessions.filter(s => s !== null && s !== undefined);
            }
            if (!appState.badges) appState.badges = [];
            if (appState.streakRecord === undefined) appState.streakRecord = 0;
        } else {
            saveDB();
        }
    } catch (e) {
        console.error("Failed to load local DB:", e);
    }
}

// Save DB to localStorage
function saveDB() {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(appState));
    } catch (e) {
        console.error("Failed to save local DB:", e);
    }
}

// ═══════════════════════════════════════════════
// CENTRAL SOUND SYNTHESIS ENGINE
// ═══════════════════════════════════════════════

let audioCtx = null;
let soundMuted = false;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    if (soundMuted) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    switch (type) {
        case 'beep':
            osc.frequency.value = 600;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.13);
            break;
            
        case 'correct':
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.4);
            break;
            
        case 'wrong':
            osc.frequency.setValueAtTime(220, now); // A3
            osc.frequency.linearRampToValueAtTime(147, now + 0.2); // D3
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            
            // Add a lowpass filter to make sawtooth less piercing
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            
            osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.3);
            break;
            
        case 'timer':
            return; // Disabled timer ticking sound completely
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.06);
            break;
            
        case 'levelUp':
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.35);
            break;
    }
}

// ═══════════════════════════════════════════════
// SYSTEM BADGES / ACHIEVEMENTS LIST
// ═══════════════════════════════════════════════

const BADGES = [
    { id: 'first_step', icon: '🚀', name: 'First Flight', desc: 'ผ่านการฝึกอบรม 1 เซสชันแรก' },
    { id: 'accuracy_ace', icon: '🎯', name: 'Accuracy Ace', desc: 'ได้คะแนน 100% ในโหมดข้อสอบ' },
    { id: 'speedrun', icon: '⚡', name: 'Speed Demon', desc: 'ทำคะแนนแบบสอบเสร็จเร็วกว่าครึ่งเวลา' },
    { id: 'hardcore_pilot', icon: '💀', name: 'Elite Pilot', desc: 'ผ่านการฝึกฝนระดับยากสุดครบ 3 ครั้ง' },
    { id: 'consistent_rank', icon: '🎖️', name: 'Consistent Cadet', desc: 'ตอบถูก 10 ข้อติดต่อกันในการฝึก' },
    { id: 'polymath', icon: '🗺️', name: 'Polymath Aviator', desc: 'เล่นครบทั้ง 6 โมดูลการทดสอบ' }
];

function checkAchievements(newSession) {
    let newlyUnlocked = [];
    const ss = appState.sessions;
    
    // 1. First Step
    if (!appState.badges.includes('first_step') && ss.length >= 1) {
        newlyUnlocked.push('first_step');
    }
    
    // 2. Accuracy Ace
    if (!appState.badges.includes('accuracy_ace') && newSession.mode === 'quiz' && newSession.pct === 100) {
        newlyUnlocked.push('accuracy_ace');
    }
    
    // 3. Speedrun
    if (!appState.badges.includes('speedrun') && newSession.mode === 'quiz' && newSession.pct >= 80 && newSession.sec <= 150) {
        newlyUnlocked.push('speedrun');
    }
    
    // 4. Consistent Rank (Streak 10)
    if (!appState.badges.includes('consistent_rank') && appState.streakRecord >= 10) {
        newlyUnlocked.push('consistent_rank');
    }
    
    // 5. Polymath (All 7 games played)
    if (!appState.badges.includes('polymath')) {
        const uniqueGames = new Set(ss.map(s => s.gameId));
        if (uniqueGames.size >= 6) {
            newlyUnlocked.push('polymath');
        }
    }
    
    if (newlyUnlocked.length > 0) {
        appState.badges.push(...newlyUnlocked);
        saveDB();
        playSound('levelUp');
        // Notify player
        newlyUnlocked.forEach(bid => {
            const badge = BADGES.find(b => b.id === bid);
            if (badge) showToast(`🏆 UNLOCKED BADGE: ${badge.name}!`);
        });
    }
}

// ═══════════════════════════════════════════════
// ROUTER & NAVIGATION CONTROLLER
// ═══════════════════════════════════════════════

const GAME_IDS = ['skyassemble_assemble', 'skyassemble_disassemble', 'shaperotation', 'nback', 'hiddenimage', 'similarity', 'seriesnum'];
let activeView = "dashboard";

function switchView(target) {
    if (activeView === target) return;
    
    // Stop active game loops if any
    stopActiveGame(activeView);
    
    // Toggle active status in UI
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === target);
    });
    
    document.querySelectorAll('.content-view').forEach(view => {
        const viewId = (target === 'skyassemble_assemble' || target === 'skyassemble_disassemble') ? 'skyassemble' : target;
        view.classList.toggle('active', view.id === `view-${viewId}`);
    });
    
    activeView = target;
    
    if (target === 'dashboard') {
        renderDashboard();
    } else {
        // Init target game
        startActiveGame(target);
    }
    playSound('beep');
}

function stopActiveGame(gameId) {
    if ((gameId === 'skyassemble' || gameId === 'skyassemble_assemble' || gameId === 'skyassemble_disassemble') && window.SkyAssembleEngine) {
        window.SkyAssembleEngine.stop();
    }
    if (gameId === 'shaperotation' && window.ShapeRotationEngine) window.ShapeRotationEngine.stop();
    if (gameId === 'nback' && window.NBackEngine) window.NBackEngine.stop();
    if (gameId === 'hiddenimage' && window.HiddenImageEngine) window.HiddenImageEngine.stop();
    if (gameId === 'similarity' && window.SimilarityEngine) window.SimilarityEngine.stop();
    if (gameId === 'seriesnum' && window.SeriesNumEngine) window.SeriesNumEngine.stop();
}

function startActiveGame(gameId) {
    // Slight delay to ensure canvas layouts are finalized (critical for iPad rendering!)
    setTimeout(() => {
        if ((gameId === 'skyassemble' || gameId === 'skyassemble_assemble' || gameId === 'skyassemble_disassemble') && window.SkyAssembleEngine) {
            window.SkyAssembleEngine.start(gameId);
        }
        if (gameId === 'shaperotation' && window.ShapeRotationEngine) window.ShapeRotationEngine.start();
        if (gameId === 'nback' && window.NBackEngine) window.NBackEngine.start();
        if (gameId === 'hiddenimage' && window.HiddenImageEngine) window.HiddenImageEngine.start();
        if (gameId === 'similarity' && window.SimilarityEngine) window.SimilarityEngine.start();
        if (gameId === 'seriesnum' && window.SeriesNumEngine) window.SeriesNumEngine.start();
    }, 150);
}

// ═══════════════════════════════════════════════
// DASHBOARD STATS RENDERER & SEGMENTATIONS
// ═══════════════════════════════════════════════

const GAME_DIFFICULTIES = {
    'skyassemble_assemble': [
        { key: '2', label: '2 ชิ้น (Starter)' },
        { key: '3', label: '3 ชิ้น (Beginner)' },
        { key: '4', label: '4 ชิ้น (Intermediate)' },
        { key: '5', label: '5 ชิ้น (Advanced)' }
    ],
    'skyassemble_disassemble': [
        { key: '2', label: '2 ชิ้น (Starter)' },
        { key: '3', label: '3 ชิ้น (Beginner)' },
        { key: '4', label: '4 ชิ้น (Intermediate)' },
        { key: '5', label: '5 ชิ้น (Advanced)' }
    ],
    'shaperotation': [
        { key: '5', label: '5 เหลี่ยม (Intermediate)' },
        { key: '7', label: '7 เหลี่ยม (Advanced)' }
    ],
    'nback': [
        { key: '1', label: '1-Back (ง่ายมาก)' },
        { key: '2', label: '2-Back (ปานกลาง)' },
        { key: '3', label: '3-Back (ยาก)' },
        { key: '4', label: '4-Back (ระดับสูง)' }
    ],
    'hiddenimage': [
        { key: '25', label: 'Starter (25 เส้น)' },
        { key: '45', label: 'Intermediate (45 เส้น)' },
        { key: '70', label: 'Advanced (70 เส้น)' }
    ],
    'similarity': [
        { key: 'easy', label: 'Easy (3 องค์ประกอบ)' },
        { key: 'medium', label: 'Medium (4 องค์ประกอบ)' },
        { key: 'hard', label: 'Hard (5 องค์ประกอบ)' }
    ],
    'seriesnum': [
        { key: 'easy', label: 'Easy (+/- คงที่)' },
        { key: 'med', label: 'Medium (รูปแบบไขว้)' },
        { key: 'hard', label: 'Hard (สมการกำลังสอง)' },
        { key: 'vhard', label: 'Very Hard (Lucas/สูตร)' }
    ]
};

function getSessionDifficulty(s) {
    if (s.difficulty) return s.difficulty.toString();
    if (s.gameId === 'skyassemble' || s.gameId === 'skyassemble_assemble' || s.gameId === 'skyassemble_disassemble') return '4';
    if (s.gameId === 'shaperotation') return '5';
    if (s.gameId === 'nback') return '2';
    if (s.gameId === 'hiddenimage') return '45';
    if (s.gameId === 'similarity') return 'medium';
    if (s.gameId === 'seriesnum') return 'easy';
    return null;
}

function getBestRecord(gameId, difficulty = null) {
    const ss = appState.sessions || [];
    const quizSessions = ss.filter(s => {
        if (!s) return false;
        if (s.gameId !== gameId || s.mode !== 'quiz') return false;
        if (difficulty === null) return true;
        return getSessionDifficulty(s) === difficulty.toString();
    });
    if (quizSessions.length === 0) return null;
    
    let bestSession = quizSessions[0];
    quizSessions.forEach(s => {
        if (s.pct > bestSession.pct || (s.pct === bestSession.pct && s.sec < bestSession.sec)) {
            bestSession = s;
        }
    });
    return bestSession;
}

function renderLobbyBestForEl(el, gid) {
    const diffs = GAME_DIFFICULTIES[gid] || [];
    let html = `🏆 <b>สถิติที่ดีที่สุด (Best Records by Difficulty):</b><div class="lobby-best-grid">`;
    let hasAnyRecord = false;
    
    diffs.forEach(diff => {
        const best = getBestRecord(gid, diff.key);
        if (best) {
            hasAnyRecord = true;
            const m = Math.floor(best.sec / 60);
            const s = best.sec % 60;
            const timeStr = `${m}:${s.toString().padStart(2, '0')} นาที`;
            html += `<div class="lobby-best-item">
                <span class="lbi-diff-name">${diff.label}:</span> 
                <span class="lbi-score">ถูก ${best.correct}/${best.total} (${best.pct}%)</span> · 
                <span class="lbi-time">${timeStr}</span>
            </div>`;
        } else {
            html += `<div class="lobby-best-item empty">
                <span class="lbi-diff-name">${diff.label}:</span> 
                <span class="lbi-score">ยังไม่มีสถิติ</span>
            </div>`;
        }
    });
    
    html += `</div>`;
    el.innerHTML = html;
    
    if (hasAnyRecord) {
        el.style.color = '#00f2fe';
        el.style.background = 'rgba(0, 242, 254, 0.03)';
        el.style.borderColor = 'rgba(0, 242, 254, 0.15)';
    } else {
        el.style.color = 'var(--text-dim)';
        el.style.background = 'rgba(255, 255, 255, 0.01)';
        el.style.borderColor = 'rgba(255, 255, 255, 0.04)';
    }
}
window.renderLobbyBestForEl = renderLobbyBestForEl;

function renderDashboard() {
    loadDB();
    const ss = appState.sessions;
    
    // Set baseline metrics
    document.getElementById('db-total-sessions').innerText = ss.length;
    document.getElementById('db-max-streak').innerText = appState.streakRecord;
    
    if (ss.length > 0) {
        const sumAcc = ss.reduce((sum, s) => sum + s.pct, 0);
        document.getElementById('db-avg-acc').innerText = Math.round(sumAcc / ss.length) + "%";
    } else {
        document.getElementById('db-avg-acc').innerText = "0%";
    }
    
    // Update individual game modules
    GAME_IDS.forEach(gid => {
        const gameSessions = ss.filter(s => s && s.gameId === gid);
        const progressFill = document.getElementById(`progress-${gid}`);
        const statsLabel = document.getElementById(`stats-${gid}`);
        const bestEl = document.getElementById(`best-${gid}`);
        
        if (gameSessions.length > 0) {
            const maxAcc = Math.max(...gameSessions.map(s => s.pct));
            statsLabel.innerText = `เล่นแล้ว ${gameSessions.length} ครั้ง · Max ${maxAcc}%`;
            progressFill.style.width = `${maxAcc}%`;
            
            const quizSessions = gameSessions.filter(s => s && s.mode === 'quiz');
            if (quizSessions.length > 0) {
                let bestSession = quizSessions[0];
                quizSessions.forEach(s => {
                    if (s.pct > bestSession.pct || (s.pct === bestSession.pct && s.sec < bestSession.sec)) {
                        bestSession = s;
                    }
                });
                const m = Math.floor(bestSession.sec / 60);
                const s = bestSession.sec % 60;
                const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
                
                // Get difficulty label
                const sessionDiff = getSessionDifficulty(bestSession);
                const diffList = GAME_DIFFICULTIES[gid] || [];
                const diffObj = diffList.find(d => d.key === sessionDiff);
                const diffLabel = diffObj ? diffObj.label.split(' ')[0] : 'ทั่วไป';
                
                if (bestEl) {
                    bestEl.innerHTML = `🏆 สถิติดีที่สุด: ถูก ${bestSession.correct}/${bestSession.total} ข้อ (${bestSession.pct}%) · ${timeStr} [${diffLabel}]`;
                    bestEl.style.color = '#10b981';
                    bestEl.style.background = 'rgba(16, 185, 129, 0.06)';
                    bestEl.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                }
            } else {
                if (bestEl) {
                    bestEl.innerHTML = `💡 สถิติดีที่สุด: ยังไม่ได้ทำข้อสอบ`;
                    bestEl.style.color = 'var(--text-dim)';
                    bestEl.style.background = 'rgba(255, 255, 255, 0.01)';
                    bestEl.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                }
            }
        } else {
            statsLabel.innerText = "ยังไม่ได้ทดสอบ";
            progressFill.style.width = "0%";
            if (bestEl) {
                bestEl.innerHTML = `💡 สถิติดีที่สุด: ยังไม่ได้ทดสอบ`;
                bestEl.style.color = 'var(--text-dim)';
                bestEl.style.background = 'rgba(255, 255, 255, 0.01)';
                bestEl.style.borderColor = 'rgba(255, 255, 255, 0.04)';
            }
        }
    });
    
    // Render Badges
    const badgeContainer = document.getElementById('db-badges-container');
    badgeContainer.innerHTML = '';
    
    BADGES.forEach(badge => {
        const isUnlocked = appState.badges.includes(badge.id);
        const item = document.createElement('div');
        item.className = `badge-item ${isUnlocked ? 'unlocked' : ''}`;
        item.innerHTML = `
            <span class="badge-icon">${badge.icon}</span>
            <div class="badge-name">${badge.name}</div>
            <div class="badge-desc">${badge.desc}</div>
        `;
        badgeContainer.appendChild(item);
    });

    // Render Flight Logs
    const GAME_NAMES = {
        'skyassemble': 'Shapes Puzzle (SkyAssemble)',
        'skyassemble_assemble': 'Shapes Puzzle (Assembly)',
        'skyassemble_disassemble': 'Shapes Puzzle (Disassembly)',
        'shaperotation': '2D Shape Rotation',
        'nback': 'Dual N-Back Protocol',
        'hiddenimage': 'Hidden Image Test',
        'similarity': 'Similarity Test',
        'seriesnum': 'Number Series Trainer'
    };
    const logsBody = document.getElementById('db-flight-logs-body');
    if (logsBody) {
        logsBody.innerHTML = '';
        const recentSessions = ss.filter(s => s !== null && s !== undefined).slice(0, 20);
        if (recentSessions.length === 0) {
            for (let i = 0; i < 10; i++) {
                const tr = document.createElement('tr');
                tr.className = 'empty-row';
                if (i === 0) {
                    tr.innerHTML = `
                        <td colspan="6" style="text-align: center; padding: 15px; color: var(--text-dim); font-style: italic;">ไม่มีบันทึกประวัติการฝึกซ้อม (No flight logs)</td>
                    `;
                } else {
                    tr.innerHTML = `
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                    `;
                }
                logsBody.appendChild(tr);
            }
        } else {
            recentSessions.forEach(s => {
                const tr = document.createElement('tr');
                
                let nameStr = GAME_NAMES[s.gameId] || s.gameId;
                const sessionDiff = getSessionDifficulty(s);
                if (sessionDiff) {
                    const diffList = GAME_DIFFICULTIES[s.gameId] || [];
                    const diffObj = diffList.find(d => d.key === sessionDiff);
                    if (diffObj) {
                        const diffShort = diffObj.label.split(' ')[0];
                        nameStr += ` (${diffShort})`;
                    }
                }
                
                const modeLabel = s.mode === 'quiz' ? '<span style="color: #fbbf24;">Exam (Quiz)</span>' : '<span style="color: #10b981;">Free Practice</span>';
                const timeStr = `${Math.floor(s.sec / 60)}m ${s.sec % 60}s`;
                
                tr.innerHTML = `
                    <td>${s.date}</td>
                    <td style="font-weight: bold; color: #fff;">${nameStr}</td>
                    <td>${modeLabel}</td>
                    <td style="color: ${s.pct >= 80 ? '#10b981' : (s.pct >= 50 ? '#93c5fd' : '#f43f5e')}; font-weight: bold;">${s.pct}%</td>
                    <td>${s.correct}/${s.total}</td>
                    <td>${timeStr}</td>
                `;
                logsBody.appendChild(tr);
            });
            
            // Pad with empty rows to always visually show 10 rows
            const rowsCount = recentSessions.length;
            if (rowsCount < 10) {
                for (let i = rowsCount; i < 10; i++) {
                    const tr = document.createElement('tr');
                    tr.className = 'empty-row';
                    tr.innerHTML = `
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                        <td style="color: rgba(255, 255, 255, 0.05); font-style: italic;">—</td>
                    `;
                    logsBody.appendChild(tr);
                }
            }
        }
    }
}

function updateLobbyBestRecords() {
    loadDB();
    const OTHER_GAMES = ['shaperotation', 'nback', 'hiddenimage', 'similarity', 'seriesnum'];
    
    OTHER_GAMES.forEach(gid => {
        const lobbyBestEl = document.getElementById(`${gid}-lobby-best`);
        if (lobbyBestEl) {
            renderLobbyBestForEl(lobbyBestEl, gid);
        }
    });
}

// ═══════════════════════════════════════════════
// QUIZ RESULT MODAL OVERLAY
// ═══════════════════════════════════════════════

let activeQuizCallback = null;

function showQuizResult(gameId, correct, total, seconds, history, difficulty = null, subType = null) {
    // Play sound
    playSound('correct');
    
    const pct = Math.round((correct / total) * 100);
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    
    // Fill text content
    document.getElementById('res-modal-score').innerText = `${correct}/${total}`;
    document.getElementById('res-modal-accuracy').innerText = `${pct}%`;
    document.getElementById('res-modal-time').innerText = `${m}:${s}`;
    
    // Adjust header visual based on score
    const titleEl = document.getElementById('res-modal-title');
    const emojiEl = document.getElementById('res-modal-emoji');
    
    if (pct >= 85) {
        titleEl.innerText = "EXCELLENT PERFORMANCE";
        emojiEl.innerText = "🏆";
    } else if (pct >= 60) {
        titleEl.innerText = "PASS baseline";
        emojiEl.innerText = "🎉";
    } else {
        titleEl.innerText = "ADDITIONAL TRAINING REQUIRED";
        emojiEl.innerText = "😅";
    }
    
    // Build history table
    const tbody = document.getElementById('res-modal-table-body');
    tbody.innerHTML = '';
    
    history.forEach((q, idx) => {
        const tr = document.createElement('tr');
        const status = q.isCorrect ? '<span class="status-yes">✔ ผ่าน</span>' : '<span class="status-no">✘ ผิด</span>';
        
        let reviewBtn = '—';
        if (q.reviewId !== undefined || q.questionIndex !== undefined) {
            reviewBtn = `<button class="btn-action" style="padding: 4px 8px; font-size:11px;" onclick="reviewQuestionItem('${gameId}', ${idx})">ดูเฉลย</button>`;
        }
        
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${q.type || 'ทั่วไป'}</td>
            <td>${(q.timeTaken / 1000).toFixed(1)} วินาที</td>
            <td>${status}</td>
            <td>${reviewBtn}</td>
        `;
        tbody.appendChild(tr);
    });
    
    // Save to Database
    const newSession = {
        date: new Date().toLocaleDateString('th-TH'),
        gameId,
        mode: 'quiz',
        score: correct,
        correct,
        total,
        pct,
        sec: seconds,
        difficulty,
        subType
    };
    
    appState.sessions.unshift(newSession);
    if (appState.sessions.length > 100) appState.sessions.pop();
    
    // Check global streak record
    let currentStreak = 0;
    history.forEach(h => {
        if (h.isCorrect) currentStreak++;
        else {
            if (currentStreak > appState.streakRecord) appState.streakRecord = currentStreak;
            currentStreak = 0;
        }
    });
    if (currentStreak > appState.streakRecord) appState.streakRecord = currentStreak;
    
    saveDB();
    checkAchievements(newSession);
    
    renderDashboard();
    updateLobbyBestRecords();
    
    // Open Modal window
    document.getElementById('quiz-result-modal').classList.add('active');
}

// Function to handle specific question reviews (e.g. Number series explanation, Skyassemble lines guide)
window.reviewQuestionItem = function(gameId, questionIdx) {
    // Hide modal
    document.getElementById('quiz-result-modal').classList.remove('active');
    
    if ((gameId === 'skyassemble' || gameId === 'skyassemble_assemble' || gameId === 'skyassemble_disassemble') && window.SkyAssembleEngine) {
        window.SkyAssembleEngine.review(questionIdx);
    }
    if (gameId === 'shaperotation' && window.ShapeRotationEngine) window.ShapeRotationEngine.review(questionIdx);
    if (gameId === 'hiddenimage' && window.HiddenImageEngine) window.HiddenImageEngine.review(questionIdx);
    if (gameId === 'similarity' && window.SimilarityEngine) window.SimilarityEngine.review(questionIdx);
    if (gameId === 'seriesnum' && window.SeriesNumEngine) window.SeriesNumEngine.review(questionIdx);
};

function closeResultModal() {
    document.getElementById('quiz-result-modal').classList.remove('active');
}

// ═══════════════════════════════════════════════
// CENTRAL UTILITIES & INTERFACE BINDINGS
// ═══════════════════════════════════════════════

function showToast(text, duration = 2000) {
    const toast = document.getElementById('feedback-toast');
    toast.innerText = text;
    toast.style.opacity = 1;
    setTimeout(() => {
        toast.style.opacity = 0;
    }, duration);
}

// Bind Navigation
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
    });
});

// Bind Game Card clicks on Dashboard
document.querySelectorAll('.game-select-card').forEach(card => {
    card.addEventListener('click', () => {
        switchView(card.dataset.launch);
    });
});

// Bind Modal Close buttons
document.getElementById('res-modal-btn-home').addEventListener('click', () => {
    closeResultModal();
    switchView('dashboard');
});

document.getElementById('res-modal-btn-retry').addEventListener('click', () => {
    closeResultModal();
    // Restart active game
    startActiveGame(activeView);
});

// Bind Sound Toggle
document.getElementById('globalSoundToggle').addEventListener('click', () => {
    soundMuted = !soundMuted;
    document.getElementById('globalSoundToggle').innerText = soundMuted ? '🔇' : '🔊';
});

// Prevent iPad elastic bounce and zoom traps
document.addEventListener('touchmove', (e) => {
    if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
}, { passive: false });

// Global Keyboard Shortcuts Routing
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    
    function routeKey(engine, event) {
        if (engine && typeof engine.handleKeyDown === 'function') {
            engine.handleKeyDown(event);
        }
    }
    
    if ((activeView === 'skyassemble' || activeView === 'skyassemble_assemble' || activeView === 'skyassemble_disassemble')) routeKey(window.SkyAssembleEngine, e);
    else if (activeView === 'shaperotation') routeKey(window.ShapeRotationEngine, e);
    else if (activeView === 'hiddenimage') routeKey(window.HiddenImageEngine, e);
    else if (activeView === 'similarity') routeKey(window.SimilarityEngine, e);
    else if (activeView === 'seriesnum') routeKey(window.SeriesNumEngine, e);
});

window.onload = () => {
    loadDB();
    renderDashboard();
    updateLobbyBestRecords();
    
    // Bind Lobby Mode Card clicks
    document.querySelectorAll('.lobby-mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const parent = card.parentNode;
            parent.querySelectorAll('.lobby-mode-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            window.playSound('beep');
        });
    });
};

// Explicitly attach utility functions to window for other scripts to access
window.playSound = playSound;
window.showToast = showToast;
window.showQuizResult = showQuizResult;
window.switchView = switchView;

