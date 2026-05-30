const NumEstimateEngine = (function() {
    let active = false;
    let quizTimer = 480; // 8 minutes (480 seconds)
    let quizTimerInterval = null;
    let questionStartTime = 0;
    
    // States
    let score = 0;
    let totalAttempts = 0;
    let correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    let isQuizMode = false;
    let maxQuizQ = 35;
    
    let currentDifficulty = 'mixed';
    let questionsList = [];
    let currentQIndex = 0;
    let answeredCount = 0;
    let userPracticeAnswer = null;
    
    // UI Selectors
    const runModeSelect = document.getElementById('numestimate-run-mode');
    const difficultySelect = document.getElementById('numestimate-difficulty');
    const lobbyDiffSelect = document.getElementById('lobby-numestimate-difficulty');
    const optionsGrid = document.getElementById('numestimate-options-grid');
    const prevBtn = document.getElementById('numestimate-prev-btn');
    const nextBtn = document.getElementById('numestimate-next-btn');
    const submitBtn = document.getElementById('numestimate-submit-exam-btn');
    const quizNav = document.getElementById('numestimate-quiz-navigator');
    
    const scoreVal = document.getElementById('numestimate-score');
    const accVal = document.getElementById('numestimate-accuracy');
    const questVal = document.getElementById('numestimate-quest');
    const timerVal = document.getElementById('numestimate-timer');
    const modeTag = document.getElementById('numestimate-mode-tag');
    const questionDisplay = document.getElementById('numestimate-question-display');

    // Helper functions
    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const rndDecimal = (a, b, decimals = 1) => {
        const factor = Math.pow(10, decimals);
        return Math.round((Math.random() * (b - a) + a) * factor) / factor;
    };
    
    function shuffle(a) {
        const r = [...a];
        for (let i = r.length - 1; i > 0; i--) {
            const j = rnd(0, i);
            [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
    }

    const FRACTIONS_POOL = [
        { num: 1, den: 2, val: 0.5, str: '1/2' },
        { num: 1, den: 4, val: 0.25, str: '1/4' },
        { num: 1, den: 5, val: 0.2, str: '1/5' },
        { num: 3, den: 5, val: 0.6, str: '3/5' },
        { num: 2, den: 5, val: 0.4, str: '2/5' },
        { num: 3, den: 8, val: 0.375, str: '3/8' },
        { num: 5, den: 8, val: 0.625, str: '5/8' },
        { num: 7, den: 8, val: 0.875, str: '7/8' },
        { num: 1, den: 8, val: 0.125, str: '1/8' },
        { num: 3, den: 16, val: 0.1875, str: '3/16' },
        { num: 1, den: 16, val: 0.0625, str: '1/16' }
    ];

    const NAMES_POOL = ['John', 'David', 'Sarah', 'Emily', 'Michael', 'James', 'Jessica', 'Robert'];

    // --- Choice Generator with strict uniqueness checks ---
    function generateChoices(exactVal, base, isCurrency = false) {
        // Find nearest rounded value
        let correctVal = Math.round(exactVal / base) * base;
        if (base >= 1 && base % 1 === 0) {
            correctVal = Math.round(correctVal);
        }
        
        let choiceSet = new Set();
        choiceSet.add(correctVal);
        
        let attempts = 0;
        while (choiceSet.size < 5 && attempts < 500) {
            attempts++;
            // Generate multipliers like +/- 1, 2, 3, 4, 5, 6, 8, 10
            let mult = rnd(1, 10);
            if (Math.random() < 0.5) mult = -mult;
            
            let candidate = correctVal + mult * base;
            if (base < 1) {
                candidate = Math.round(candidate * 100) / 100;
            }
            
            if (candidate > 0 && candidate !== correctVal) {
                // Ensure it is not mathematically closer to exactVal than correctVal is
                if (Math.abs(candidate - exactVal) > Math.abs(correctVal - exactVal)) {
                    choiceSet.add(candidate);
                }
            }
        }
        
        // Safety Fallback if we cannot find 5 unique choices
        if (choiceSet.size < 5) {
            for (let i = 1; i <= 25; i++) {
                let c1 = correctVal + i * base;
                let c2 = correctVal - i * base;
                if (c1 > 0 && Math.abs(c1 - exactVal) > Math.abs(correctVal - exactVal)) choiceSet.add(c1);
                if (choiceSet.size >= 5) break;
                if (c2 > 0 && Math.abs(c2 - exactVal) > Math.abs(correctVal - exactVal)) choiceSet.add(c2);
                if (choiceSet.size >= 5) break;
            }
        }
        
        let choicesArray = Array.from(choiceSet).slice(0, 5);
        choicesArray.sort((a, b) => a - b);
        
        let correctIdx = choicesArray.indexOf(correctVal);
        
        // Format to display text
        let displayChoices = choicesArray.map(v => {
            if (isCurrency) {
                return `$${v.toFixed(2)}`;
            } else {
                // Formatting decimals nicely
                return Number.isInteger(v) ? v.toString() : v.toFixed(1);
            }
        });
        
        return {
            choices: displayChoices,
            correctOptionIndex: correctIdx,
            correctValue: correctVal
        };
    }

    // --- Dynamic Question Pool Generators ---
    const Generators = {
        easy: [
            // 3-digit addition
            () => {
                const x = rnd(100, 999);
                const y = rnd(100, 999);
                const exactVal = x + y;
                const base = 10;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. สังเกตและประมาณค่าตัวเลขให้กลม: ${x} ≈ ${Math.round(x/10)*10} และ ${y} ≈ ${Math.round(y/10)*10}<br>` +
                    `2. คำนวณหาผลลัพธ์โดยประมาณ: ${Math.round(x/10)*10} + ${Math.round(y/10)*10} = ${Math.round(x/10)*10 + Math.round(y/10)*10}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x} + ${y} = <b>${exactVal}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                    
                return {
                    questionHtml: `${x} + ${y} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การบวก 3 หลัก'
                };
            },
            // 4-digit addition
            () => {
                const x = rnd(1000, 9999);
                const y = rnd(1000, 9999);
                const exactVal = x + y;
                const base = 100;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. สังเกตและประมาณค่าตัวเลขให้กลม: ${x} ≈ ${Math.round(x/100)*100} และ ${y} ≈ ${Math.round(y/100)*100}<br>` +
                    `2. คำนวณหาผลลัพธ์โดยประมาณ: ${Math.round(x/100)*100} + ${Math.round(y/100)*100} = ${Math.round(x/100)*100 + Math.round(y/100)*100}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x} + ${y} = <b>${exactVal}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                    
                return {
                    questionHtml: `${x.toLocaleString()} + ${y.toLocaleString()} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การบวก 4 หลัก'
                };
            },
            // Three numbers addition
            () => {
                const x = rnd(100, 999);
                const y = rnd(100, 999);
                const z = rnd(100, 999);
                const exactVal = x + y + z;
                const base = 100;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. ประมาณค่าเป็นจำนวนกลมหลักร้อย: ${x} ≈ ${Math.round(x/100)*100}, ${y} ≈ ${Math.round(y/100)*100}, ${z} ≈ ${Math.round(z/100)*100}<br>` +
                    `2. รวมค่าประมาณ: ${Math.round(x/100)*100} + ${Math.round(y/100)*100} + ${Math.round(z/100)*100} = ${Math.round(x/100)*100 + Math.round(y/100)*100 + Math.round(z/100)*100}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x} + ${y} + ${z} = <b>${exactVal}</b> ซึ่งมีค่าใกล้เคียง <b>${data.choices[data.correctOptionIndex]}</b> มากที่สุด`;
                
                return {
                    questionHtml: `${x} + ${y} + ${z} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การบวก 3 จำนวน'
                };
            },
            // 4-digit subtraction
            () => {
                const x = rnd(3000, 9999);
                const y = rnd(1000, x - 500); // ensure X > Y and enough difference
                const exactVal = x - y;
                const base = 100;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. สังเกตและประมาณค่ากลมหลักร้อย: ${x} ≈ ${Math.round(x/100)*100} และ ${y} ≈ ${Math.round(y/100)*100}<br>` +
                    `2. คำนวณหาผลลบโดยประมาณ: ${Math.round(x/100)*100} - ${Math.round(y/100)*100} = ${Math.round(x/100)*100 - Math.round(y/100)*100}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x.toLocaleString()} - ${y.toLocaleString()} = <b>${exactVal.toLocaleString()}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${x.toLocaleString()} - ${y.toLocaleString()} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การลบ 4 หลัก'
                };
            },
            // Mixed addition and subtraction
            () => {
                const x = rnd(1000, 5000);
                const y = rnd(100, 999);
                const z = rnd(1000, 5000);
                const exactVal = x - y + z;
                const base = 100;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. ประมาณค่าตัวเลขกลมหลักร้อย: ${x} ≈ ${Math.round(x/100)*100}, ${y} ≈ ${Math.round(y/100)*100}, ${z} ≈ ${Math.round(z/100)*100}<br>` +
                    `2. คำนวณโดยประมาณ: ${Math.round(x/100)*100} - ${Math.round(y/100)*100} + ${Math.round(z/100)*100} = ${Math.round(x/100)*100 - Math.round(y/100)*100 + Math.round(z/100)*100}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x} - ${y} + ${z} = <b>${exactVal}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${x} - ${y} + ${z} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การคำนวณผสม +/-'
                };
            }
        ],
        
        medium: [
            // Two-digit multiplication
            () => {
                const x = rnd(30, 99);
                const y = rnd(30, 99);
                const exactVal = x * y;
                const base = 100;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. ประมาณค่าเป็นเลขกลมทวีคูณสิบ: ${x} ≈ ${Math.round(x/10)*10} และ ${y} ≈ ${Math.round(y/10)*10}<br>` +
                    `2. คำนวณผลคูณโดยประมาณ: ${Math.round(x/10)*10} × ${Math.round(y/10)*10} = ${(Math.round(x/10)*10 * Math.round(y/10)*10).toLocaleString()}<br>` +
                    `3. ผลคูณจริงคือ ${x} × ${y} = <b>${exactVal.toLocaleString()}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${x} × ${y} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การคูณ 2 หลัก'
                };
            },
            // Decimal multiplication (3 terms)
            () => {
                const x = rndDecimal(1.5, 9.9, 1);
                const y = rndDecimal(1.5, 9.9, 1);
                const z = rndDecimal(1.5, 9.9, 1);
                const exactVal = x * y * z;
                const base = 10;
                
                const data = generateChoices(exactVal, base);
                const rx = Math.round(x);
                const ry = Math.round(y);
                const rz = Math.round(z);
                const approx = rx * ry * rz;
                
                const explain = `วิธีคิด:<br>` +
                    `1. ปัดเศษทศนิยมให้เป็นจำนวนเต็มที่ใกล้ที่สุด: ${x} ≈ ${rx}, ${y} ≈ ${ry}, ${z} ≈ ${rz}<br>` +
                    `2. คูณจำนวนเต็มเข้าด้วยกัน: ${rx} × ${ry} × ${rz} = ${approx}<br>` +
                    `3. ผลลัพธ์จริงคือ ${x} × ${y} × ${z} = <b>${exactVal.toFixed(3)}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${x} × ${y} × ${z} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การคูณทศนิยม 3 ลำดับ'
                };
            },
            // Division of large number
            () => {
                const divisor = rnd(11, 99);
                const quotient = rnd(11, 199);
                const exactVal = quotient;
                // Generate a nearby dividend with a small offset
                const offset = rnd(-divisor + 2, divisor - 2);
                const dividend = divisor * quotient + offset;
                const base = divisor >= 50 ? 5 : 2;
                
                // Regenerate if dividend < 100
                if (dividend < 100) return Generators.medium[2]();
                
                const approxDividend = Math.round(dividend / 100) * 100;
                const approxDivisor = Math.round(divisor / 10) * 10;
                const approxQuotient = Math.round(approxDividend / approxDivisor);
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. สังเกตและประมาณค่ากลมๆ: ${dividend} ≈ ${approxDividend} และ ${divisor} ≈ ${approxDivisor}<br>` +
                    `2. ประมาณการหารอย่างรวดเร็ว: ${approxDividend} ÷ ${approxDivisor} = ${approxQuotient}<br>` +
                    `3. ผลหารจริงคือ ${dividend} ÷ ${divisor} = <b>${(dividend / divisor).toFixed(2)}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${dividend} ÷ ${divisor} = ?`,
                    exactVal: dividend / divisor,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การหารจำนวนหลายหลัก'
                };
            },
            // Division by decimal
            () => {
                const divisor = rndDecimal(5.5, 19.9, 1);
                const quotient = rnd(50, 199);
                const dividend = Math.round(divisor * quotient + rnd(-10, 10));
                
                const rx = Math.round(divisor);
                const approx = Math.round(dividend / rx);
                const exactVal = dividend / divisor;
                const base = approx >= 100 ? 10 : 5;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. ปัดเศษทศนิยมตัวหารให้เป็นจำนวนเต็ม: ${divisor} ≈ ${rx}<br>` +
                    `2. ประมาณการหารอย่างรวดเร็ว: ${dividend} ÷ ${rx} = ${approx}<br>` +
                    `3. ผลลัพธ์จริงคือ ${dividend} ÷ ${divisor} = <b>${exactVal.toFixed(2)}</b> ซึ่งตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${dividend} ÷ ${divisor} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'การหารด้วยทศนิยม'
                };
            }
        ],
        
        hard: [
            // Percentages
            () => {
                const pct = [5, 8, 11.5, 12.5, 15, 22, 33, 45, 62, 75][rnd(0, 9)];
                const n = rnd(300, 9999);
                const exactVal = (pct / 100) * n;
                
                let base = 10;
                if (exactVal > 800) base = 100;
                else if (exactVal > 200) base = 50;
                
                const data = generateChoices(exactVal, base);
                const approxN = Math.round(n / 100) * 100;
                const approxVal = (pct / 100) * approxN;
                
                const explain = `วิธีคิด:<br>` +
                    `1. สังเกตเปอร์เซ็นต์และประมาณค่าตัวเลขหลัก: ${pct}% ของ ${n} ≈ ${pct}% ของ ${approxN.toLocaleString()}<br>` +
                    `2. คำนวณโดยประมาณ: ${pct / 100} × ${approxN.toLocaleString()} = ${approxVal.toLocaleString()}<br>` +
                    `3. ผลลัพธ์จริงคือ <b>${exactVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b> ซึ่งตัวเลือกที่ใกล้เคียงคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${pct}% of ${n.toLocaleString()} = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'ร้อยละ (Percentage)'
                };
            },
            // Mixed Fraction (addition and multiplication) e.g., 1 1/4 + 1 1/5 * 3 1/2
            () => {
                const f1 = FRACTIONS_POOL[rnd(0, FRACTIONS_POOL.length - 1)];
                const f2 = FRACTIONS_POOL[rnd(0, FRACTIONS_POOL.length - 1)];
                const f3 = FRACTIONS_POOL[rnd(0, FRACTIONS_POOL.length - 1)];
                
                const a = rnd(1, 4);
                const b = rnd(1, 4);
                const c = rnd(1, 4);
                
                const v1 = a + f1.val;
                const v2 = b + f2.val;
                const v3 = c + f3.val;
                
                const exactVal = v1 + v2 * v3;
                const base = 1; // Round to nearest integer
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. แปลงเศษส่วนผสมเป็นทศนิยมเพื่อคำนวณง่าย:<br>` +
                    `   - ${a} ${f1.str} = ${v1}<br>` +
                    `   - ${b} ${f2.str} = ${v2}<br>` +
                    `   - ${c} ${f3.str} = ${v3}<br>` +
                    `2. คำนวณหาผลลัพธ์ตามหลักลำดับความสำคัญคณิตศาสตร์ (คูณก่อนบวก):<br>` +
                    `   - คูณ: ${v2} × ${v3} = ${(v2 * v3).toFixed(3)}<br>` +
                    `   - บวก: ${v1} + ${(v2 * v3).toFixed(3)} = <b>${exactVal.toFixed(3)}</b><br>` +
                    `3. ตัวเลือกจำนวนเต็มที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${a}<sup>${f1.num}</sup>/<sub>${f1.den}</sub> + ${b}<sup>${f2.num}</sup>/<sub>${f2.den}</sub> × ${c}<sup>${f3.num}</sup>/<sub>${f3.den}</sub> = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'เศษส่วนผสม (Mixed Fractions)'
                };
            },
            // Mixed Fraction (multiplication only) e.g., 3 3/16 * 12 7/8
            () => {
                const f1 = FRACTIONS_POOL[rnd(0, FRACTIONS_POOL.length - 1)];
                const f2 = FRACTIONS_POOL[rnd(0, FRACTIONS_POOL.length - 1)];
                
                const a = rnd(2, 6);
                const b = rnd(5, 15);
                
                const v1 = a + f1.val;
                const v2 = b + f2.val;
                
                const exactVal = v1 * v2;
                const base = exactVal > 25 ? 5 : 1;
                
                const data = generateChoices(exactVal, base);
                const explain = `วิธีคิด:<br>` +
                    `1. แปลงเศษส่วนผสมเป็นทศนิยมหรือค่าใกล้เคียง:<br>` +
                    `   - ${a} ${f1.str} ≈ ${v1}<br>` +
                    `   - ${b} ${f2.str} ≈ ${v2}<br>` +
                    `2. ผลคูณโดยประมาณคือ ${v1} × ${v2} = <b>${exactVal.toFixed(3)}</b><br>` +
                    `3. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${a}<sup>${f1.num}</sup>/<sub>${f1.den}</sub> × ${b}<sup>${f2.num}</sup>/<sub>${f2.den}</sub> = ?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'เศษส่วนผสม (Mixed Fractions)'
                };
            },
            // Word Problem 1: Ream of paper cost
            () => {
                const price = rndDecimal(3.15, 9.95, 2);
                const reams = rnd(11, 29);
                const exactVal = price * reams;
                
                // Round price to nearest dollar/half dollar for explanation
                const approxPrice = Math.round(price * 2) / 2;
                const approxVal = approxPrice * reams;
                
                const base = exactVal > 100 ? 10 : 5;
                
                // Generate choices with currency formatting
                const data = generateChoices(exactVal, base, true);
                
                const explain = `วิธีคิด:<br>` +
                    `1. ตั้งสมการ: ราคารวม = ราคาต่อรีม × จำนวนรีม<br>` +
                    `2. ราคาต่อรีม $${price} (ประมาณ $${approxPrice.toFixed(2)})<br>` +
                    `3. คูณด้วยจำนวน ${reams} รีม: $${approxPrice.toFixed(2)} × ${reams} = $${approxVal.toFixed(2)}<br>` +
                    `4. ผลลัพธ์ที่แท้จริงคือ $${price} × ${reams} = <b>$${exactVal.toFixed(2)}</b><br>` +
                    `5. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `If one ream of paper costs $${price.toFixed(2)} how much would ${reams} reams cost?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'โจทย์ปัญหา: ราคารีมกระดาษ'
                };
            },
            // Word Problem 2: John's work shift hours in D days
            () => {
                const name = NAMES_POOL[rnd(0, NAMES_POOL.length - 1)];
                const startHour = rnd(7, 9);
                const startMin = [0, 15, 30, 45][rnd(0, 3)];
                const endHour = rnd(4, 6);
                const endMin = [0, 15, 30, 45][rnd(0, 3)];
                
                const breaks = [30, 45, 60, 90, 120][rnd(0, 4)];
                const days = rnd(15, 30);
                
                // Calculate daily hours
                const startTotalMin = startHour * 60 + startMin;
                const endTotalMin = (endHour + 12) * 60 + endMin;
                const totalMinutes = endTotalMin - startTotalMin - breaks;
                const dailyHours = totalMinutes / 60;
                
                const exactVal = dailyHours * days;
                const base = exactVal > 200 ? 20 : 10;
                
                const data = generateChoices(exactVal, base);
                
                const formatTime = (h, m, suffix) => `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
                const timeStartStr = formatTime(startHour, startMin, 'am');
                const timeEndStr = formatTime(endHour, endMin, 'pm');
                
                const explain = `วิธีคิด:<br>` +
                    `1. หาเวลาทำงานสะสมต่อวัน:<br>` +
                    `   - เวลาเข้างาน ${timeStartStr} ถึง ${timeEndStr} คิดเป็น ${((endHour + 12) * 60 + endMin - startTotalMin) / 60} ชั่วโมง<br>` +
                    `   - หักเวลาหยุดพักผ่อน ${breaks} นาที (${breaks / 60} ชั่วโมง)<br>` +
                    `   - เวลาทำงานจริงต่อวัน = ${dailyHours} ชั่วโมง<br>` +
                    `2. คำนวณเวลาสะสมสำหรับทำงาน ${days} วัน:<br>` +
                    `   - ${dailyHours} ชั่วโมง × ${days} วัน = <b>${exactVal} ชั่วโมง</b><br>` +
                    `3. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `${name} starts work at ${timeStartStr} and finishes at ${timeEndStr}. He has ${breaks} minutes of breaks. How many hours does he work in ${days} days?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'โจทย์ปัญหา: คำนวณกะชั่วโมงทำงาน'
                };
            },
            // Word Problem 3: Restaurant bill with service charge
            () => {
                const starters = rndDecimal(100.0, 250.0, 2);
                const mains = rndDecimal(100.0, 250.0, 2);
                const deserts = rndDecimal(40.0, 99.0, 2);
                const charge = [10, 12, 15, 17, 18, 20][rnd(0, 5)];
                
                const subtotal = starters + mains + deserts;
                const exactVal = subtotal * (1 + charge / 100);
                
                const base = exactVal > 500 ? 50 : 20;
                const data = generateChoices(exactVal, base, true);
                
                const explain = `วิธีคิด:<br>` +
                    `1. สรุปราคารวมอาหารดิบก่อนบวกบริการ: $${starters.toFixed(2)} + $${mains.toFixed(2)} + $${deserts.toFixed(2)} = $${subtotal.toFixed(2)}<br>` +
                    `2. คิดรวมอัตราค่าบริการบวกเพิ่ม (Service Charge) ${charge}%:<br>` +
                    `   - $${subtotal.toFixed(2)} × ${(1 + charge/100).toFixed(2)} = $${exactVal.toFixed(2)}<br>` +
                    `3. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `A restaurant bill is made up as follows: $${starters.toFixed(2)} for starters, $${mains.toFixed(2)} for main courses and $${deserts.toFixed(2)} for deserts, plus a ${charge}% service charge. How much is the bill?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'โจทย์ปัญหา: ใบเสร็จร้านอาหาร'
                };
            },
            // Word Problem 4: Volume of rectangular solid
            () => {
                const h = rnd(12, 28);
                const w = rnd(12, 28);
                const l = rnd(12, 28);
                const exactVal = h * w * l;
                const base = exactVal > 15000 ? 1000 : 500;
                
                const data = generateChoices(exactVal, base);
                
                const explain = `วิธีคิด:<br>` +
                    `1. ปริมาตรของรูปทรงสี่เหลี่ยม = สูง × กว้าง × ยาว<br>` +
                    `2. คำนวณผลคูณปริมาตรจริง: ${h} × ${w} × ${l} = <b>${exactVal.toLocaleString()} ลูกบาศก์นิ้ว</b><br>` +
                    `3. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `A rectangular solid is ${h} inches high, ${w} inches wide and ${l} inches long. What is its volume in cubic inches?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'โจทย์ปัญหา: ปริมาตรทรงสี่เหลี่ยม'
                };
            },
            // Word Problem 5: Volume of cylindrical solid
            () => {
                const h = rnd(20, 60);
                const d = [2, 4, 6, 8, 10][rnd(0, 4)];
                const r = d / 2;
                const exactVal = Math.PI * r * r * h;
                
                const base = exactVal > 1000 ? 100 : 20;
                const data = generateChoices(exactVal, base);
                
                const explain = `วิธีคิด:<br>` +
                    `1. รัศมีวงกลมทรงกระบอก (r) = เส้นผ่านศูนย์กลาง ÷ 2 = ${d} ÷ 2 = ${r} นิ้ว<br>` +
                    `2. ปริมาตรทรงกระบอก = π × r² × สูง ≈ 3.1416 × ${r * r} × ${h} = <b>${exactVal.toFixed(2)} ลูกบาศก์นิ้ว</b><br>` +
                    `3. ตัวเลือกที่ใกล้เคียงที่สุดคือ <b>${data.choices[data.correctOptionIndex]}</b>`;
                
                return {
                    questionHtml: `A cylindrical solid is ${h} inches high, and has a diameter of ${d} inches. What is its volume in cubic inches?`,
                    exactVal: exactVal,
                    choices: data.choices,
                    correctOptionIndex: data.correctOptionIndex,
                    explain: explain,
                    type: 'โจทย์ปัญหา: ปริมาตรทรงกระบอก'
                };
            }
        ]
    };

    function generateSingleQuestion(difficulty) {
        const diffs = ['easy', 'medium', 'hard'];
        const pickedDiff = diffs[rnd(0, diffs.length - 1)];
        const pool = Generators[pickedDiff];
        const genFn = pool[rnd(0, pool.length - 1)];
        const q = genFn();
        q.picked = null;
        q.timeSpent = 0;
        return q;
    }

    function generateQuestions(difficulty, count = 35) {
        const questions = [];
        const usedHtmls = new Set();
        
        let easyCount = Math.floor(count * 10 / 35);
        let mediumCount = Math.floor(count * 10 / 35);
        let hardCount = count - easyCount - mediumCount;
        
        const distribution = [];
        for (let i = 0; i < easyCount; i++) distribution.push('easy');
        for (let i = 0; i < mediumCount; i++) distribution.push('medium');
        for (let i = 0; i < hardCount; i++) distribution.push('hard');
        
        const shuffledDiffs = shuffle(distribution);
        
        let attempts = 0;
        let qIdx = 0;
        while (questions.length < count && attempts < 1000) {
            attempts++;
            const diff = shuffledDiffs[qIdx % count];
            let q = null;
            if (diff === 'hard') {
                const rVal = Math.random();
                if (rVal < 0.40) {
                    q = Generators.hard[0]();
                } else if (rVal < 0.80) {
                    q = Generators.hard[rnd(1, 2)]();
                } else {
                    q = Generators.hard[rnd(3, 7)]();
                }
            } else {
                const pool = Generators[diff];
                const genFn = pool[rnd(0, pool.length - 1)];
                q = genFn();
            }

            if (q && !usedHtmls.has(q.questionHtml)) {
                usedHtmls.add(q.questionHtml);
                q.picked = null;
                q.timeSpent = 0;
                questions.push(q);
                qIdx++;
            }
        }
        
        while (questions.length < count) {
            const diff = shuffledDiffs[questions.length % count] || 'easy';
            const pool = Generators[diff];
            const genFn = pool[rnd(0, pool.length - 1)];
            const q = genFn();
            q.picked = null;
            q.timeSpent = 0;
            questions.push(q);
        }
        
        return questions;
    }

    // --- GUI Renders ---
    function renderChoices() {
        optionsGrid.innerHTML = '';
        
        const q = isQuizMode || isReviewMode ? questionsList[currentQIndex] : questionsList[0];
        if (!q) return;

        const userChoice = q.picked;

        q.choices.forEach((c, idx) => {
            const card = document.createElement('div');
            card.className = 'option-card estimate-card';
            card.dataset.index = idx;

            if (isReviewMode) {
                if (idx === q.correctOptionIndex) {
                    card.classList.add('correct');
                } else if (idx === userChoice) {
                    card.classList.add('wrong');
                }
            } else if (isQuizMode) {
                if (idx === userChoice) {
                    card.classList.add('selected-exam');
                }
            } else if (isAnswered) {
                if (idx === q.correctOptionIndex) {
                    card.classList.add('correct');
                } else if (idx === userPracticeAnswer) {
                    card.classList.add('wrong');
                }
            }

            card.innerHTML = `
                <span class="option-num-label">${String.fromCharCode(65 + idx)}</span>
                <span class="option-text-val">${c}</span>
            `;
            
            card.onclick = () => pickAnswer(idx, card);
            optionsGrid.appendChild(card);
        });
    }

    function initGame() {
        if (!active) return;
        
        isAnswered = false;
        userPracticeAnswer = null;
        
        nextBtn.innerText = "ข้ามข้อนี้";
        nextBtn.className = "btn-action";
        
        // Generate a single question for practice mode
        questionsList = [generateSingleQuestion(currentDifficulty)];
        currentQIndex = 0;
        
        // Clear explanation
        const explainBox = document.getElementById('numestimate-explain-box');
        if (explainBox) explainBox.remove();
        
        // Renders
        questionDisplay.innerHTML = questionsList[0].questionHtml;
        renderChoices();
        
        questionStartTime = Date.now();
    }

    function pickAnswer(idx, cardEl) {
        if (!active) return;
        
        const q = isQuizMode ? questionsList[currentQIndex] : questionsList[0];
        if (!q || q.picked !== null) return; // Answered already
        
        if (isQuizMode) {
            q.picked = idx;
            answeredCount = questionsList.filter(qi => qi.picked !== null).length;
            
            updateQuizNavigator();
            renderChoices();
            window.playSound('beep');
            
            // Advance to next question automatically in Quiz mode with small delay
            setTimeout(() => {
                if (active && isQuizMode) {
                    handleNext();
                }
            }, 240);
            return;
        }

        // --- Practice Mode ---
        isAnswered = true;
        userPracticeAnswer = idx;
        q.picked = idx;
        totalAttempts++;
        
        const isCorrect = (idx === q.correctOptionIndex);
        
        if (isCorrect) {
            window.playSound('correct');
            correctAttempts++;
            score += 10;
            cardEl.classList.add('correct');
            
            // Remove any existing explanation box from previous questions
            const explainBox = document.getElementById('numestimate-explain-box');
            if (explainBox) explainBox.remove();
            
            setTimeout(() => {
                if (active && !isQuizMode && !isReviewMode && isAnswered) {
                    initGame();
                }
            }, 500);
        } else {
            window.playSound('wrong');
            window.showToast("WRONG");
            cardEl.classList.add('wrong');
            
            // Highlight correct choice
            const cards = document.querySelectorAll('#numestimate-options-grid .estimate-card');
            if (cards[q.correctOptionIndex]) {
                cards[q.correctOptionIndex].classList.add('correct');
            }
            
            // Render explanation box below options grid
            let explainBox = document.getElementById('numestimate-explain-box');
            if (!explainBox) {
                explainBox = document.createElement('div');
                explainBox.id = 'numestimate-explain-box';
                explainBox.className = 'series-explain-box'; // Using series styling for harmony
                explainBox.style.marginTop = '20px';
                explainBox.style.padding = '15px';
                explainBox.style.borderRadius = '12px';
                explainBox.style.textAlign = 'left';
                explainBox.style.fontSize = '15px';
                explainBox.style.lineHeight = '1.6';
                optionsGrid.parentNode.appendChild(explainBox);
            }
            
            explainBox.style.background = 'rgba(244, 63, 94, 0.08)';
            explainBox.style.border = '1px solid rgba(244, 63, 94, 0.2)';
            explainBox.innerHTML = `<span style="color:var(--wrong); font-weight:700;">✘ ไม่ถูกต้อง!</span><br>${q.explain}`;
        }
        
        updateStats();
        renderChoices();
        
        nextBtn.innerText = "ข้อถัดไป ➔";
        nextBtn.className = "btn-action primary";
    }

    function updateStats() {
        scoreVal.innerText = score;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accVal.innerText = acc + "%";
    }

    // --- Timed Exam (Quiz) Flow ---
    function loadQuestion(idx) {
        currentQIndex = idx;
        const q = questionsList[idx];
        if (!q) return;
        
        isAnswered = false;
        questVal.innerText = `${idx + 1}/${maxQuizQ}`;
        
        questionDisplay.innerHTML = q.questionHtml;
        
        prevBtn.style.display = (idx === 0) ? 'none' : 'block';
        nextBtn.style.display = 'block';
        nextBtn.innerText = (idx === maxQuizQ - 1) ? "สิ้นสุดข้อสอบ" : "ถัดไป ➔";
        nextBtn.className = "btn-action primary";
        submitBtn.style.display = 'block';
        
        updateQuizNavigator();
        renderChoices();
        
        questionStartTime = Date.now();
    }

    function goToQuestion(idx) {
        if (idx < 0 || idx >= maxQuizQ) return;
        
        // Cache time spent on current question
        if (questionsList[currentQIndex]) {
            questionsList[currentQIndex].timeSpent += (Date.now() - questionStartTime);
        }
        loadQuestion(idx);
    }

    function renderQuizList(isReview = false) {
        const container = document.getElementById('numestimate-quiz-container');
        container.innerHTML = '';
        
        questionsList.forEach((q, idx) => {
            const card = document.createElement('div');
            card.id = `numestimate-qcard-${idx}`;
            card.className = 'numestimate-quiz-card';
            
            const isCorrect = (q.picked === q.correctOptionIndex);
            if (isReview) {
                if (isCorrect) {
                    card.classList.add('answered-card');
                    card.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                } else {
                    card.style.borderColor = 'rgba(244, 63, 94, 0.4)';
                }
            } else {
                if (q.picked !== null) {
                    card.classList.add('answered-card');
                }
            }
            
            // Header
            const header = document.createElement('div');
            header.className = 'numestimate-qcard-header';
            header.innerHTML = `
                <span class="numestimate-qcard-no">ข้อที่ ${idx + 1}</span>
                <span class="numestimate-qcard-lbl">${q.type || 'ทั่วไป'}</span>
            `;
            card.appendChild(header);
            
            // Question text
            const qText = document.createElement('div');
            qText.className = 'numestimate-qcard-text';
            qText.innerHTML = q.questionHtml;
            card.appendChild(qText);
            
            // Options
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'numestimate-qcard-options';
            
            q.choices.forEach((choice, choiceIdx) => {
                const optCard = document.createElement('div');
                optCard.className = 'option-card estimate-card';
                
                if (isReview) {
                    if (choiceIdx === q.correctOptionIndex) {
                        optCard.classList.add('correct');
                    } else if (choiceIdx === q.picked) {
                        optCard.classList.add('wrong');
                    }
                } else {
                    if (q.picked === choiceIdx) {
                        optCard.classList.add('selected-exam');
                    }
                }
                
                optCard.innerHTML = `
                    <span class="option-num-label">${String.fromCharCode(65 + choiceIdx)}</span>
                    <span class="option-text-val">${choice}</span>
                `;
                
                if (!isReview) {
                    optCard.onclick = () => {
                        q.picked = choiceIdx;
                        card.classList.add('answered-card');
                        
                        // Highlight selected option and remove from others
                        const siblingOptions = optionsDiv.querySelectorAll('.estimate-card');
                        siblingOptions.forEach((opt, sIdx) => {
                            if (sIdx === choiceIdx) {
                                opt.classList.add('selected-exam');
                            } else {
                                opt.classList.remove('selected-exam');
                            }
                        });
                        
                        window.playSound('beep');
                        updateQuizNavigator();

                        // Auto scroll to next unanswered card
                        for (let i = idx + 1; i < questionsList.length; i++) {
                            if (questionsList[i].picked === null) {
                                setTimeout(() => {
                                    const nextCard = document.getElementById(`numestimate-qcard-${i}`);
                                    if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 240);
                                break;
                            }
                        }
                    };
                }
                
                optionsDiv.appendChild(optCard);
            });
            card.appendChild(optionsDiv);
            
            // Explanation box for Review Mode
            if (isReview) {
                const explainBox = document.createElement('div');
                explainBox.className = 'series-explain-box';
                explainBox.style.marginTop = '15px';
                explainBox.style.padding = '12px 15px';
                explainBox.style.borderRadius = '10px';
                explainBox.style.textAlign = 'left';
                explainBox.style.fontSize = '14px';
                explainBox.style.lineHeight = '1.5';
                
                if (isCorrect) {
                    explainBox.style.background = 'rgba(16, 185, 129, 0.08)';
                    explainBox.style.border = '1px solid rgba(16, 185, 129, 0.2)';
                    explainBox.innerHTML = `<span style="color:var(--correct); font-weight:700;">✔ ถูกต้อง!</span><br>${q.explain}`;
                } else {
                    explainBox.style.background = 'rgba(244, 63, 94, 0.08)';
                    explainBox.style.border = '1px solid rgba(244, 63, 94, 0.2)';
                    const userAnsChar = q.picked !== null ? String.fromCharCode(65 + q.picked) : 'ไม่ได้ตอบ';
                    explainBox.innerHTML = `<span style="color:var(--wrong); font-weight:700;">✘ ไม่ถูกต้อง! (คุณเลือกตัวเลือก ${userAnsChar})</span><br>${q.explain}`;
                }
                card.appendChild(explainBox);
            }
            
            container.appendChild(card);
        });
    }

    function updateQuizNavigator() {
        quizNav.innerHTML = '';
        questionsList.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-nav-btn';
            if (q.picked !== null) btn.classList.add('answered');
            btn.innerText = idx + 1;
            btn.onclick = () => {
                const card = document.getElementById(`numestimate-qcard-${idx}`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };
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
        // Practice Mode next question
        initGame();
    }

    function submitQuiz() {
        const answered = questionsList.filter(q => q.picked !== null).length;
        const confirmMsg = answered === maxQuizQ ?
            "คุณต้องการส่งกระดาษคำตอบใช่หรือไม่?" :
            `คุณทำไปแล้ว ${answered}/${maxQuizQ} ข้อ มีข้อที่ยังไม่ได้ทำอีก ${maxQuizQ - answered} ข้อ ต้องการส่งคำตอบเลยหรือไม่?`;
            
        if (!confirm(confirmMsg)) return;
        finishExam();
    }

    function finishExam() {
        clearInterval(quizTimerInterval);
        
        let correct = 0;
        const historyDetails = questionsList.map((q, idx) => {
            const isCorrect = (q.picked === q.correctOptionIndex);
            if (isCorrect) correct++;
            
            return {
                type: q.type || 'ทั่วไป',
                isCorrect: isCorrect,
                timeTaken: q.timeSpent || 0,
                questionIndex: idx,
                // Cached question data for review screen
                savedQuestion: {
                    questionHtml: q.questionHtml,
                    choices: q.choices,
                    correctOptionIndex: q.correctOptionIndex,
                    explain: q.explain,
                    userAnswer: q.picked,
                    type: q.type
                }
            };
        });
        
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        
        // Hide quiz container and restore practice layout
        document.getElementById('numestimate-quiz-container').style.display = 'none';
        document.getElementById('numestimate-practice-view').style.display = 'flex';
        
        const timeSpent = 480 - quizTimer;
        window.showQuizResult('numestimate', correct, maxQuizQ, timeSpent, historyDetails, currentDifficulty);
    }

    function startQuiz() {
        isQuizMode = true;
        isReviewMode = false;
        quizTimer = 480; // 8 minutes
        answeredCount = 0;
        
        questVal.innerText = `1/${maxQuizQ}`;
        timerVal.innerText = "08:00";
        timerVal.style.color = 'var(--amber)';
        modeTag.innerText = "Timed Challenge (Complexity: Mixed / คละระดับยากง่าย)";
        
        // Remove practice explanation box if present
        const explainBox = document.getElementById('numestimate-explain-box');
        if (explainBox) explainBox.remove();
        
        // Hide practice view, show scrollable quiz container
        document.getElementById('numestimate-practice-view').style.display = 'none';
        document.getElementById('numestimate-quiz-container').style.display = 'flex';
        
        // Generate list of 35 questions
        questionsList = generateQuestions(currentDifficulty, maxQuizQ);
        
        document.querySelectorAll('#numestimate-stage .q-only').forEach(el => el.style.display = 'block');
        quizNav.style.display = 'flex';
        
        renderQuizList(false);
        updateQuizNavigator();
        
        clearInterval(quizTimerInterval);
        quizTimerInterval = setInterval(() => {
            quizTimer--;
            
            // Format timer text
            const m = Math.floor(quizTimer / 60);
            const s = (quizTimer % 60).toString().padStart(2, '0');
            timerVal.innerText = `${m}:${s}`;
            
            if (quizTimer <= 60) {
                timerVal.style.color = 'var(--wrong)';
            } else {
                timerVal.style.color = 'var(--amber)';
            }
            
            if (quizTimer <= 0) {
                clearInterval(quizTimerInterval);
                alert("หมดเวลาทำข้อสอบระบบจะส่งกระดาษคำตอบของคุณโดยอัตโนมัติ");
                finishExam();
            }
        }, 1000);
        
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
    }

    function exitQuizMode() {
        isQuizMode = false;
        isReviewMode = false;
        clearInterval(quizTimerInterval);
        
        runModeSelect.value = 'practice';
        modeTag.innerText = "Free Practice";
        document.querySelectorAll('#numestimate-stage .q-only').forEach(el => el.style.display = 'none');
        
        // Restore practice layout, hide quiz container
        document.getElementById('numestimate-practice-view').style.display = 'flex';
        document.getElementById('numestimate-quiz-container').style.display = 'none';
        
        quizNav.style.display = 'none';
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
        
        score = 0;
        totalAttempts = 0;
        correctAttempts = 0;
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
        isReviewMode = true;
        isQuizMode = false;
        isAnswered = true;
        currentQIndex = historyIndex;

        questVal.innerText = `1/${maxQuizQ}`;
        modeTag.innerText = "Review Mode (คละระดับยากง่าย)";
        
        // Hide practice layout, show quiz container
        document.getElementById('numestimate-practice-view').style.display = 'none';
        document.getElementById('numestimate-quiz-container').style.display = 'flex';
        
        document.querySelectorAll('#numestimate-stage .q-only').forEach(el => el.style.display = 'block');
        quizNav.style.display = 'flex';
        
        renderQuizList(true);
        updateQuizNavigator();
        
        // Scroll to selected card
        setTimeout(() => {
            const card = document.getElementById(`numestimate-qcard-${historyIndex}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);

        nextBtn.style.display = 'block';
        nextBtn.innerText = "กลับหน้าสรุปข้อสอบ";
        nextBtn.className = "btn-action primary";
        nextBtn.onclick = () => {
            document.getElementById('quiz-result-modal').classList.add('active');
            nextBtn.onclick = handleNext;
        };
    }

    // Event listener assignments
    runModeSelect.addEventListener('change', toggleRunMode);
    difficultySelect.addEventListener('change', () => {
        currentDifficulty = 'mixed';
        if (!isQuizMode) initGame();
    });

    prevBtn.onclick = handlePrev;
    nextBtn.onclick = handleNext;
    submitBtn.onclick = submitQuiz;

    // Keyboard shortcuts binding
    function handleKeyDown(e) {
        if (!active) return;
        const key = e.key.toLowerCase();

        if (isQuizMode) {
            if (e.key === 'ArrowLeft') {
                handlePrev();
                e.preventDefault();
                return;
            } else if (e.key === 'ArrowRight') {
                handleNext();
                e.preventDefault();
                return;
            } else if (e.key === 'Enter' && e.ctrlKey) {
                submitQuiz();
                e.preventDefault();
                return;
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
                const cards = document.querySelectorAll('#numestimate-options-grid .estimate-card');
                if (cards[idx]) pickAnswer(idx, cards[idx]);
            }
        }
    }

    return {
        start: function() {
            active = true;
            isReviewMode = false;
            
            document.getElementById('numestimate-lobby').style.display = 'flex';
            document.getElementById('numestimate-stage').style.display = 'none';

            const startBtnLobby = document.getElementById('numestimate-start-lobby');
            startBtnLobby.onclick = () => {
                const activeModeCard = document.querySelector('#numestimate-lobby .lobby-mode-card.active');
                const selectedMode = activeModeCard ? activeModeCard.dataset.mode : 'practice';

                runModeSelect.value = selectedMode;
                currentDifficulty = 'mixed';
                difficultySelect.value = currentDifficulty;

                document.getElementById('numestimate-lobby').style.display = 'none';
                document.getElementById('numestimate-stage').style.display = 'flex';

                if (selectedMode === 'quiz') {
                    startQuiz();
                } else {
                    exitQuizMode();
                }
            };

            window.renderLobbyBestForEl(document.getElementById('numestimate-lobby-best'), 'numestimate');

            document.querySelectorAll('#numestimate-lobby .lobby-mode-card').forEach(card => {
                card.onclick = () => {
                    document.querySelectorAll('#numestimate-lobby .lobby-mode-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                };
            });
        },
        stop: function() {
            active = false;
            clearInterval(quizTimerInterval);
        },
        review: reviewQuestion,
        handleKeyDown: handleKeyDown
    };
})();

window.NumEstimateEngine = NumEstimateEngine;
