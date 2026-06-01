const ShortMemoryEngine = (function() {
    let active = false;
    let phase = 'lobby'; // 'lobby' | 'read' | 'math' | 'recall'
    
    // Game State
    let score = 0;
    let totalAttempts = 0;
    let correctAttempts = 0;
    let isAnswered = false;
    let isReviewMode = false;
    
    let currentSetIndex = 0; // 0 to 49
    let currentQIndex = 0; // 0 to 29 (for recall phase)
    let userAnswers = []; // Array of length 30 for user's recall answers
    
    // Timers
    let timerValue = 180; // 3 minutes = 180 seconds
    let timerInterval = null;
    let questionStartTime = 0;
    let timeSpentReading = 0;
    let timeSpentMath = 0;
    
    // Math Interference Phase State
    const mathQuestionsTotal = 50;
    let generatedMathQuestions = [];
    let userMathAnswers = [];
    let correctMathCount = 0;
    
    // UI elements
    let lobbyView, stageView, readArea, mathArea, recallArea;
    let timerEl, scoreEl, accEl, phaseNameEl, timerLabelEl;
    let doneReadingBtn, quitBtn, prevBtn, nextBtn, submitBtn, recallNavs;
    let quizNav;
    
    // ----------------------------------------------------
    // 50 FLIGHT SCENARIOS DATABASE
    // ----------------------------------------------------
    
    const airlinesList = [
        "Garuda Indonesia", "Singapore Airlines", "Emirates", "Cathay Pacific", "Qantas",
        "Lufthansa", "Japan Airlines", "Thai Airways", "British Airways", "Qatar Airways",
        "KLM Royal Dutch", "United Airlines", "Delta Air Lines", "American Airlines", "Air France",
        "Vietnam Airlines", "EgyptAir", "AirAsia", "Nok Air", "Korean Air",
        "Royal Brunei Airlines", "Bangkok Airways", "Thai Lion Air", "Scoot", "VietJet Air",
        "Malaysia Airlines", "EVA Air", "China Airlines", "Asiana Airlines", "Etihad Airways"
    ];

    const aircraftsList = [
        { type: "Boeing 737-800", mtow: 79, fuel: 20 },
        { type: "Airbus A350-900", mtow: 280, fuel: 110 },
        { type: "Boeing 777-300ER", mtow: 351, fuel: 145 },
        { type: "Airbus A330-300", mtow: 242, fuel: 75 },
        { type: "Boeing 787-9", mtow: 254, fuel: 101 },
        { type: "Airbus A321neo", mtow: 97, fuel: 26 },
        { type: "Boeing 787-8", mtow: 227, fuel: 89 },
        { type: "Airbus A380-800", mtow: 575, fuel: 250 },
        { type: "Airbus A320neo", mtow: 79, fuel: 21 },
        { type: "Boeing 777-200ER", mtow: 297, fuel: 117 }
    ];

    const routesList = [
        { origin: "Jakarta (CGK)", dest: "Denpasar (DPS)", transit: "Surabaya (SUB)", final: "Lombok (LOP)" },
        { origin: "Singapore (SIN)", dest: "Melbourne (MEL)", transit: "Adelaide (ADL)", final: "Sydney (SYD)" },
        { origin: "Nairobi (NBO)", dest: "Dubai (DXB)", transit: "Muscat (MCT)", final: "Dhaka (DAC)" },
        { origin: "Hong Kong (HKG)", dest: "Bangkok (BKK)", transit: "Phuket (HKT)", final: "Mumbai (BOM)" },
        { origin: "Perth (PER)", dest: "Singapore (SIN)", transit: "Kuala Lumpur (KUL)", final: "Brisbane (BNE)" },
        { origin: "Beijing (PEK)", dest: "Bangkok (BKK)", transit: "Singapore (SIN)", final: "Munich (MUC)" },
        { origin: "Bangkok (BKK)", dest: "Osaka (KIX)", transit: "Nagoya (NGO)", final: "Tokyo Narita (NRT)" },
        { origin: "Chiang Mai (CNX)", dest: "Bangkok (BKK)", transit: "Phuket (HKT)", final: "Phuket (HKT)" },
        { origin: "London Heathrow (LHR)", dest: "New York JFK", transit: "Boston (BOS)", final: "New York JFK" },
        { origin: "Doha (DOH)", dest: "Kuala Lumpur (KUL)", transit: "Singapore (SIN)", final: "Jakarta (CGK)" }
    ];

    // Generate 50 unique flight metadata items based on combinations of the arrays above
    const flightsMetadata = [];
    
    function generateFlightMetadata(i) {
        const routeIdx = i % routesList.length;
        const airlineIdx = (i * 3) % airlinesList.length;
        const aircraftIdx = (i * 7) % aircraftsList.length;
        
        const route = routesList[routeIdx];
        const airline = airlinesList[airlineIdx];
        const aircraft = aircraftsList[aircraftIdx];
        
        const flightNumLetters = airline.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "FL";
        const flightNo = flightNumLetters + (Math.floor(Math.random() * 900) + 100);
        
        const depHour = 5 + Math.floor(Math.random() * 17); // 05:00 to 21:00
        const depMin = Math.floor(Math.random() * 12) * 5;
        const departureTime = `${depHour.toString().padStart(2, '0')}:${depMin.toString().padStart(2, '0')}`;
        
        const fuelWeight = Math.round(aircraft.fuel * (0.85 + Math.random() * 0.25));
        const takeoffWeight = Math.round(aircraft.mtow * (0.85 + Math.random() * 0.12));
        
        const pilots = (Math.random() < 0.2) ? 3 : 2;
        const cabinCrew = Math.max(3, Math.round(takeoffWeight * 0.035) + 3 + Math.floor(Math.random() * 3));
        
        const maxCapacity = Math.round(takeoffWeight * 1.2) + 50;
        const passengers = Math.round(maxCapacity * (0.65 + Math.random() * 0.25));
        const businessClass = Math.round(passengers * (0.08 + Math.random() * 0.08));
        const hasPremiumEco = (aircraft.mtow > 150 && Math.random() < 0.5);
        const premiumEconomy = hasPremiumEco ? Math.round(passengers * (0.05 + Math.random() * 0.05)) : 0;
        const economyClass = passengers - businessClass - premiumEconomy;
        
        const cruisingLevels = [310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410];
        const cruiseLevel = `FL${cruisingLevels[Math.floor(Math.random() * cruisingLevels.length)]}`;
        
        const gates = ["A1", "A3", "B2", "B5", "C12", "C18", "D2", "D5", "E6", "E8", "F4", "F12"];
        const gateIdx = Math.floor(Math.random() * gates.length);
        const gate = gates[gateIdx];
        let nextGateIdx = Math.floor(Math.random() * gates.length);
        while (nextGateIdx === gateIdx) {
            nextGateIdx = Math.floor(Math.random() * gates.length);
        }
        const nextGate = gates[nextGateIdx];
        
        const runways = ["19L", "19R", "01L", "01R", "27", "27R", "27L", "30L", "30R", "20C", "20R", "31L", "31R", "32L", "32R"];
        const rwyIdx = Math.floor(Math.random() * runways.length);
        const runway = runways[rwyIdx];
        let nextRwyIdx = Math.floor(Math.random() * runways.length);
        while (nextRwyIdx === rwyIdx) {
            nextRwyIdx = Math.floor(Math.random() * runways.length);
        }
        const nextRunway = runways[nextRwyIdx];
        
        const weatherTypes = [
            "fine with some scattered clouds over the sea",
            "mostly clear with a temperature of 28 degrees",
            "cloudy with light wind from the north",
            "overcast with smooth flight conditions en route",
            "excellent visibility with strong tailwinds",
            "clear skies and calm air over the mountains",
            "scattered rain clouds with slight convective activity"
        ];
        const weather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
        
        const incidentTypes = [
            "medical_emergency", "coffee_spill", "hydraulic_leak", "traffic_holding", 
            "refueling_delay", "aircraft_swap", "weather_diversion", "catering_error", 
            "autopilot_disconnect", "generator_fault"
        ];
        const incidentType = incidentTypes[i % incidentTypes.length];
        
        let incidentParam = {};
        if (incidentType === "medical_emergency") {
            const seats = ["9A", "12B", "14F", "22C", "7K", "3B", "18D", "25A"];
            const treatments = ["oxygen using a portable bottle", "nitroglycerin tablets", "an inhaler and resting", "applying a cold compress"];
            incidentParam = {
                seat: seats[Math.floor(Math.random() * seats.length)],
                desc: "reported chest pain and sudden shortness of breath",
                provider: Math.random() < 0.5 ? "a registered nurse on board" : "a doctor traveling as passenger",
                treatment: treatments[Math.floor(Math.random() * treatments.length)]
            };
        } else if (incidentType === "coffee_spill") {
            const seats = ["4K", "2A", "12C", "24D", "33E", "1F", "15B", "8D"];
            incidentParam = {
                seat: seats[Math.floor(Math.random() * seats.length)],
                desc: "accidentally spilled hot coffee on their lap",
                treatment: "a cold burn compress and minor dressing"
            };
        } else if (incidentType === "hydraulic_leak") {
            const delayMins = [25, 30, 35, 40, 45, 50];
            const locations = ["near the left landing gear bay", "on the main gear door actuator", "within the hydraulic reservoir bay", "in the nose landing gear compartment"];
            incidentParam = {
                delay: delayMins[Math.floor(Math.random() * delayMins.length)],
                location: locations[Math.floor(Math.random() * locations.length)]
            };
        } else if (incidentType === "traffic_holding") {
            const holdMins = [10, 12, 15, 18, 20, 25];
            const seats = ["24C", "33B", "18A", "9D", "15F", "28E"];
            incidentParam = {
                holdTime: holdMins[Math.floor(Math.random() * holdMins.length)],
                seat: seats[Math.floor(Math.random() * seats.length)],
                issue: "ear pain due to pressure changes"
            };
        } else if (incidentType === "refueling_delay") {
            const delayMins = [20, 25, 27, 30, 35, 40];
            incidentParam = {
                delay: delayMins[Math.floor(Math.random() * delayMins.length)],
                reason: "fuel truck replacement due to a broken sensor"
            };
        } else if (incidentType === "aircraft_swap") {
            const regNo = `G-STB${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
            const delayMins = [45, 60, 75, 90, 120];
            incidentParam = {
                reg: regNo,
                delay: delayMins[Math.floor(Math.random() * delayMins.length)],
                gate: gate,
                swapGate: nextGate
            };
        } else if (incidentType === "weather_diversion") {
            const visibilityList = [150, 200, 300, 400, 500];
            const stayHrs = [3, 4, 5, 6];
            incidentParam = {
                visibility: visibilityList[Math.floor(Math.random() * visibilityList.length)],
                alternate: route.transit,
                stay: stayHrs[Math.floor(Math.random() * stayHrs.length)],
                gate: gate
            };
        } else if (incidentType === "catering_error") {
            const errorTypes = ["breakfast instead of afternoon meal", "vegetarian meals instead of standard sets", "missing crew meal boxes", "wrong drink selections"];
            const delayMins = [8, 10, 12, 15, 18];
            incidentParam = {
                error: errorTypes[Math.floor(Math.random() * errorTypes.length)],
                delay: delayMins[Math.floor(Math.random() * delayMins.length)]
            };
        } else if (incidentType === "autopilot_disconnect") {
            const flyMins = [8, 10, 12, 15, 20];
            incidentParam = {
                handFly: flyMins[Math.floor(Math.random() * flyMins.length)]
            };
        } else if (incidentType === "generator_fault") {
            const generators = ["generator control unit 2", "main AC generator 1", "electrical supply board C", "backup electrical control module"];
            incidentParam = {
                faultName: generators[Math.floor(Math.random() * generators.length)]
            };
        }
        
        const disembarkPct = 0.3 + Math.random() * 0.25;
        const disembarkCount = Math.round(passengers * disembarkPct);
        const continueCount = passengers - disembarkCount;
        const newBoardPct = 0.25 + Math.random() * 0.25;
        const newBoardCount = Math.round(passengers * newBoardPct);
        const totalNewPassengers = continueCount + newBoardCount;
        const fuelTurnaround = Math.round(fuelWeight * (0.4 + Math.random() * 0.25));
        
        const flightDurationMins = 90 + Math.floor(Math.random() * 180);
        const totalMinutes = depHour * 60 + depMin + flightDurationMins;
        const landH = Math.floor(totalMinutes / 60) % 24;
        const landM = totalMinutes % 60;
        const landingTime = `${landH.toString().padStart(2, '0')}:${landM.toString().padStart(2, '0')}`;
        
        const turnaroundMins = 40 + Math.floor(Math.random() * 45);
        const startMins = totalMinutes + 35;
        const completeMins = startMins + 20;
        const nextDepMins = completeMins + 10;
        
        const boardingStart = `${(Math.floor(startMins / 60) % 24).toString().padStart(2, '0')}:${(startMins % 60).toString().padStart(2, '0')}`;
        const boardingEnd = `${(Math.floor(completeMins / 60) % 24).toString().padStart(2, '0')}:${(completeMins % 60).toString().padStart(2, '0')}`;
        const nextDeparture = `${(Math.floor(nextDepMins / 60) % 24).toString().padStart(2, '0')}:${(nextDepMins % 60).toString().padStart(2, '0')}`;
        
        return {
            flightNo,
            airline,
            aircraft: aircraft.type,
            origin: route.origin.split(" ")[0],
            originFull: route.origin,
            destination: route.dest.split(" ")[0],
            destinationFull: route.dest,
            finalDest: route.final.split(" ")[0],
            finalDestFull: route.final,
            departureTime,
            fuel: `${fuelWeight} tons`,
            takeoffWeight: `${takeoffWeight} tons`,
            pilots,
            cabinCrew,
            passengers,
            businessClass,
            premiumEconomy,
            economyClass,
            weather,
            cruiseLevel,
            gate,
            nextGate,
            runway,
            nextRunway,
            disembarkCount,
            continueCount,
            newBoardCount,
            totalNewPassengers,
            fuelTurnaround: `${fuelTurnaround} tons`,
            boardingStart,
            boardingEnd,
            nextDeparture,
            landingTime,
            turnaroundMins,
            incidentType,
            param: incidentParam
        };
    }
    
    // We construct 50 diverse flight metadata objects programmatically on startup
    for (let i = 0; i < 50; i++) {
        flightsMetadata.push(generateFlightMetadata(i));
    }

    // ----------------------------------------------------
    // COMPILERS: TEXT & QUESTIONS GENERATOR
    // ----------------------------------------------------

    function compileFlightReport(f) {
        let text = `Flight <b>${f.flightNo}</b>, operated by <b>${f.airline}</b> using a <b>${f.aircraft}</b>, departed <b>${f.originFull}</b> at <b>${f.departureTime}</b> local time for <b>${f.destinationFull}</b>. Fuel loaded was <b>${f.fuel}</b>, and takeoff weight was <b>${f.takeoffWeight}</b>. The cockpit crew consisted of <b>${f.pilots}</b> pilots, and the cabin was staffed by <b>${f.cabinCrew}</b> flight attendants. There were <b>${f.passengers}</b> passengers on board, including <b>${f.businessClass}</b> in business class`;
        
        if (f.premiumEconomy > 0) {
            text += `, <b>${f.premiumEconomy}</b> in premium economy, and <b>${f.economyClass}</b> in economy class. `;
        } else {
            text += ` and <b>${f.economyClass}</b> in economy class. `;
        }
        
        text += `Weather along the route was <b>${f.weather}</b>. The flight climbed to a cruise altitude of <b>${f.cruiseLevel}</b>. `;

        // Append incident details
        if (f.incidentType === "medical_emergency") {
            text += `About 45 minutes into the flight, a passenger in seat <b>${f.param.seat}</b> experienced a medical condition and <b>${f.param.desc}</b>. The lead flight attendant notified the captain immediately. Medical help was requested from passengers, and <b>${f.param.provider}</b> responded to assist the crew, administering <b>${f.param.treatment}</b>. The flight path remained unchanged. `;
        } else if (f.incidentType === "coffee_spill") {
            text += `During cruise, a passenger in seat <b>${f.param.seat}</b> <b>${f.param.desc}</b>. Cabin attendants immediately provided first aid, applying <b>${f.param.treatment}</b>. The purser logged the minor incident, and the cockpit continued the flight as planned. `;
        } else if (f.incidentType === "hydraulic_leak") {
            text += `During pre-flight cockpit inspections, the crew noticed a minor alert. Ground maintenance engineers discovered a hydraulic fluid leak <b>${f.param.location}</b>. The leak was successfully repaired after a delay of <b>${f.param.delay}</b> minutes. The flight proceeded without further system problems. `;
        } else if (f.incidentType === "traffic_holding") {
            text += `Upon approaching the destination area, Air Traffic Control (ATC) placed the aircraft in a holding pattern for <b>${f.param.holdTime}</b> minutes due to air traffic congestion. During the hold, a passenger in seat <b>${f.param.seat}</b> requested assistance for <b>${f.param.issue}</b>. Crew provided cotton swabs to help. `;
        } else if (f.incidentType === "refueling_delay") {
            text += `During cruise, operations notified the cockpit of a ground delay at the destination due to a refueling truck issue. The aircraft was delayed by <b>${f.param.delay}</b> minutes at the gate during turnaround due to a <b>${f.param.reason}</b>. `;
        } else if (f.incidentType === "aircraft_swap") {
            text += `A technical inspection at Gate <b>${f.param.gate}</b> discovered a minor airframe defect. Operations immediately ordered an aircraft swap. Ground crews transferred all luggage to the replacement aircraft, registration <b>${f.param.reg}</b>, parked at Gate <b>${f.param.swapGate}</b>. The swap caused a delay of <b>${f.param.delay}</b> minutes. `;
        } else if (f.incidentType === "weather_diversion") {
            text += `Approaching the destination, the weather degraded rapidly. Heavy fog caused runway visibility to drop to <b>${f.param.visibility} meters</b>, which was below safe landing limits. The captain made the decision to divert to the alternate airport, <b>${f.param.alternate}</b>, landing safely at Gate <b>${f.param.gate}</b> where passengers stayed on board. The delay lasted for <b>${f.param.stay}</b> hours. `;
        } else if (f.incidentType === "catering_error") {
            text += `During boarding, the cabin crew discovered a catering issue where the contractor loaded <b>${f.param.error}</b>. The purser refused the delivery and requested a replacement. The catering truck returned <b>${f.param.delay}</b> minutes later with the correct order. `;
        } else if (f.incidentType === "autopilot_disconnect") {
            text += `During cruise flight, the crew experienced an autopilot disconnect warning. The captain took manual control and hand-flew the aircraft for <b>${f.param.handFly}</b> minutes while the first officer verified system diagnostics and reset the flight computers. `;
        } else if (f.incidentType === "generator_fault") {
            text += `During the climb phase, the cockpit crew received a master caution indicating that <b>${f.param.faultName}</b> had failed and gone offline. The crew completed the checklist, and the secondary generator took over automatically to power the electrical systems. `;
        }

        text += `The aircraft landed at <b>${f.landingTime}</b> local time on <b>${f.runway}</b> and taxiied to <b>${f.gate}</b>. `;
        text += `During the scheduled turnaround, ground crews performed standard refueling, adding <b>${f.fuelTurnaround}</b>. A passenger exchange was conducted: <b>${f.disembarkCount}</b> passengers disembarked at the destination, while <b>${f.continueCount}</b> passengers continued on the next leg to <b>${f.finalDestFull}</b>. `;
        text += `Ground staff boarded <b>${f.newBoardCount}</b> new passengers, making a total of <b>${f.totalNewPassengers}</b> passengers for the next sector. Boarding began at <b>${f.boardingStart}</b>, was completed at <b>${f.boardingEnd}</b>, and the aircraft departed for the final leg at <b>${f.nextDeparture}</b>.`;

        return text;
    }

    function compileQuestions(f) {
        const qList = [];

        const makeNumChoices = (correct, step = 1, suffix = '') => {
            const correctNum = parseInt(correct);
            const rawSet = new Set([correctNum]);
            let attempts = 0;
            while (rawSet.size < 5 && attempts < 100) {
                attempts++;
                const offset = (Math.floor(Math.random() * 9) - 4) * step; // range -4 to +4
                const cand = correctNum + offset;
                if (cand > 0 && offset !== 0) rawSet.add(cand);
            }
            if (rawSet.size < 5) {
                let fallback = correctNum + 1;
                while (rawSet.size < 5) {
                    rawSet.add(fallback);
                    fallback++;
                }
            }
            const opts = Array.from(rawSet).sort((a, b) => a - b).map(n => n + suffix);
            return {
                options: opts,
                ans: opts.indexOf(correctNum + suffix)
            };
        };

        const makeTimeChoices = (correctTime) => {
            const [h, m] = correctTime.split(":").map(Number);
            const correctSec = h * 60 + m;
            const rawSet = new Set([correctSec]);
            let attempts = 0;
            while (rawSet.size < 5 && attempts < 100) {
                attempts++;
                const offset = (Math.floor(Math.random() * 9) - 4) * 5; // step 5 mins, range -20 to +20 mins
                const cand = correctSec + offset;
                if (cand >= 0 && offset !== 0) rawSet.add(cand);
            }
            if (rawSet.size < 5) {
                let fallback = correctSec + 5;
                while (rawSet.size < 5) {
                    rawSet.add(fallback);
                    fallback += 5;
                }
            }
            const opts = Array.from(rawSet).sort((a, b) => a - b).map(sec => {
                const hh = Math.floor(sec / 60) % 24;
                const mm = sec % 60;
                return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
            });
            return {
                options: opts,
                ans: opts.indexOf(correctTime)
            };
        };

        const makeStringChoices = (correct, pool) => {
            const rawSet = new Set([correct]);
            const filteredPool = pool.filter(item => item !== correct);
            let attempts = 0;
            while (rawSet.size < 5 && filteredPool.length > 0 && attempts < 100) {
                attempts++;
                const randItem = filteredPool[Math.floor(Math.random() * filteredPool.length)];
                rawSet.add(randItem);
            }
            if (rawSet.size < 5) {
                const fallbackPool = ["Option A", "Option B", "Option C", "Option D", "Option E"];
                for (let item of fallbackPool) {
                    if (rawSet.size >= 5) break;
                    if (item !== correct) rawSet.add(item);
                }
            }
            const opts = Array.from(rawSet).sort();
            return {
                options: opts,
                ans: opts.indexOf(correct)
            };
        };

        // Q1: Flight No
        const fNoChoices = makeStringChoices(f.flightNo, ["GA431", "SQ223", "EK724", "CX619", "QF642", "LH721", "JL720", "TG223", "BA175", "QR905", "TG910", "EK413", "NH816", "AF258", "VN611", "MS957"]);
        qList.push({ q: "What was the flight number?", options: fNoChoices.options, ans: fNoChoices.ans });

        // Q2: Airline
        const airlineChoices = makeStringChoices(f.airline, airlinesList);
        qList.push({ q: "Which airline operated the flight?", options: airlineChoices.options, ans: airlineChoices.ans });

        // Q3: Aircraft
        const aircraftChoices = makeStringChoices(f.aircraft, aircraftsList.map(a => a.type));
        qList.push({ q: "What was the aircraft type?", options: aircraftChoices.options, ans: aircraftChoices.ans });

        // Q4: Origin
        const originChoices = makeStringChoices(f.originFull, routesList.map(r => r.origin));
        qList.push({ q: "What was the origin airport of the flight?", options: originChoices.options, ans: originChoices.ans });

        // Q5: Destination
        const destChoices = makeStringChoices(f.destinationFull, routesList.map(r => r.dest));
        qList.push({ q: "What was the scheduled destination of the first sector?", options: destChoices.options, ans: destChoices.ans });

        // Q6: Departure Time
        const depChoices = makeTimeChoices(f.departureTime);
        qList.push({ q: "What was the local departure time from the origin airport?", options: depChoices.options, ans: depChoices.ans });

        // Q7: Fuel loaded
        const fuelVal = parseInt(f.fuel);
        const fuelChoices = makeNumChoices(fuelVal, 2, " tons");
        qList.push({ q: "How much fuel was loaded at departure?", options: fuelChoices.options, ans: fuelChoices.ans });

        // Q8: Takeoff weight
        const weightVal = parseInt(f.takeoffWeight);
        const weightChoices = makeNumChoices(weightVal, 5, " tons");
        qList.push({ q: "What was the takeoff weight of the aircraft?", options: weightChoices.options, ans: weightChoices.ans });

        // Q9: Pilots count
        const pilotChoices = makeStringChoices(f.pilots + " pilots", ["1 pilot", "2 pilots", "3 pilots", "4 pilots", "5 pilots"]);
        qList.push({ q: "How many cockpit pilots were on duty?", options: pilotChoices.options, ans: pilotChoices.ans });

        // Q10: Cabin crew count
        const crewChoices = makeNumChoices(f.cabinCrew, 1, " flight attendants");
        qList.push({ q: "How many cabin crew flight attendants were on board?", options: crewChoices.options, ans: crewChoices.ans });

        // Q11: Total passengers
        const paxChoices = makeNumChoices(f.passengers, 10, " passengers");
        qList.push({ q: "What was the total number of passengers on board?", options: paxChoices.options, ans: paxChoices.ans });

        // Q12: Business Class count
        const bizChoices = makeNumChoices(f.businessClass, 2, " passengers");
        qList.push({ q: "How many passengers were in business class?", options: bizChoices.options, ans: bizChoices.ans });

        // Q13: Cruise Altitude
        const levelVal = parseInt(f.cruiseLevel.substring(2));
        const levelChoices = makeNumChoices(levelVal, 10, "");
        const levelOpts = levelChoices.options.map(o => "FL" + o);
        qList.push({ q: "What was the cruise altitude flight level (FL) of the flight?", options: levelOpts, ans: levelOpts.indexOf(f.cruiseLevel) });

        // Q14: Incident description / parameters
        let incQ = "What operational or cabin incident occurred en route?";
        let incOpts = [];
        if (f.incidentType === "medical_emergency") {
            incOpts = ["Passenger medical emergency (chest pain)", "Coffee spill burn", "Hydraulic fluid leak delay", "ATC holding pattern", "Autopilot computer disconnect"];
        } else if (f.incidentType === "coffee_spill") {
            incOpts = ["Coffee spill on lap", "Passenger medical emergency", "Cargo door warning alert", "Electrical generator failure", "Volcanic ash delay"];
        } else if (f.incidentType === "hydraulic_leak") {
            incOpts = ["Hydraulic leak repaired pre-flight", "Autopilot disconnect", "Cabin catering meals error", "Overnight crew duty rest stop", "Air conditioning unit failure"];
        } else if (f.incidentType === "traffic_holding") {
            incOpts = ["ATC holding pattern congestion", "Catering replacement delay", "Electrical power box alert", "Passenger medical emergency", "Fuel truck broken sensor"];
        } else if (f.incidentType === "refueling_delay") {
            incOpts = ["Fuel truck replacement delay at gate", "Severe en route headwind", "Hydraulic valve actuator leak", "Cockpit autopilot disconnect", "Passenger sprained ankle"];
        } else if (f.incidentType === "aircraft_swap") {
            incOpts = ["Aircraft swap due to structural defect", "Volcanic ash route deviation", "Catering meal type error", "Passenger spilled hot coffee", "Weather runway closure diversion"];
        } else if (f.incidentType === "weather_diversion") {
            incOpts = ["Diversion to alternate due to heavy fog", "Cargo door warning alert", "Catering replacement delay", "Autopilot system reset", "Electrical generator offline"];
        } else if (f.incidentType === "catering_error") {
            incOpts = ["Wrong menu type loaded by caterers", "Passenger chest pain emergency", "Hydraulic leak en route", "Severe traffic hold at BKK", "Aircraft swap required"];
        } else if (f.incidentType === "autopilot_disconnect") {
            incOpts = ["Autopilot system disconnect warning", "Ground refueling truck failure", "Weather runway closure diversion", "Premium catering meal mixup", "Generator unit breakdown"];
        } else if (f.incidentType === "generator_fault") {
            incOpts = ["Electrical generator control unit offline", "Spilled hot drink en route", "Hydraulic actuator replacement", "ATC holding delay", "Air conditioning sensor fault"];
        }
        const incChoices = makeStringChoices(incOpts[0], ["Passenger medical emergency (chest pain)", "Coffee spill burn", "Hydraulic fluid leak delay", "ATC holding pattern", "Autopilot computer disconnect", "Electrical generator control unit offline", "Diversion to alternate due to heavy fog", "Wrong menu type loaded by caterers", "Fuel truck replacement delay at gate", "Aircraft swap due to structural defect"]);
        qList.push({ q: incQ, options: incChoices.options, ans: incChoices.ans });

        // Q15: Incident details (e.g. seat, location, gate, delay)
        let detQ = "";
        let detCorrect = "";
        let detPool = [];
        if (f.incidentType === "medical_emergency") {
            detQ = "What was the seat number of the sick passenger?";
            detCorrect = f.param.seat;
            detPool = ["9A", "12B", "14F", "22C", "7K", "3B", "18A", "12C"];
        } else if (f.incidentType === "coffee_spill") {
            detQ = "What was the seat number where coffee was spilled?";
            detCorrect = f.param.seat;
            detPool = ["4K", "2A", "12C", "24D", "33E", "1F", "9A", "14F"];
        } else if (f.incidentType === "hydraulic_leak") {
            detQ = "Where was the hydraulic system leak discovered by engineers?";
            detCorrect = f.param.location;
            detPool = ["near the left landing gear bay", "on the main gear door actuator", "within the hydraulic reservoir bay", "in the nose landing gear compartment", "near the right wing flap actuator"];
        } else if (f.incidentType === "traffic_holding") {
            detQ = "How long did the aircraft hold in the ATC pattern?";
            detCorrect = f.param.holdTime + " minutes";
            detPool = ["10 minutes", "12 minutes", "15 minutes", "18 minutes", "20 minutes", "25 minutes"];
        } else if (f.incidentType === "refueling_delay") {
            detQ = "How long did the ground refueling delay last at the gate?";
            detCorrect = f.param.delay + " minutes";
            detPool = ["20 minutes", "25 minutes", "27 minutes", "30 minutes", "35 minutes", "15 minutes"];
        } else if (f.incidentType === "aircraft_swap") {
            detQ = "What was the registration number of the replacement aircraft?";
            detCorrect = f.param.reg;
            detPool = ["G-STBA", "G-STBE", "G-STBF", "G-STBH", "G-STBC", "G-STBK"];
        } else if (f.incidentType === "weather_diversion") {
            detQ = "What Alternate Airport did the flight divert to?";
            detCorrect = f.param.alternate;
            detPool = routesList.map(r => r.transit);
        } else if (f.incidentType === "catering_error") {
            detQ = "How many minutes did the catering truck take to return with correct meals?";
            detCorrect = f.param.delay + " minutes";
            detPool = ["8 minutes", "10 minutes", "12 minutes", "15 minutes", "18 minutes", "20 minutes"];
        } else if (f.incidentType === "autopilot_disconnect") {
            detQ = "How many minutes did the captain hand-fly the plane?";
            detCorrect = f.param.handFly + " minutes";
            detPool = ["8 minutes", "10 minutes", "12 minutes", "15 minutes", "18 minutes", "20 minutes"];
        } else if (f.incidentType === "generator_fault") {
            detQ = "Which electrical system unit was reported offline?";
            detCorrect = f.param.faultName;
            detPool = ["generator control unit 2", "main AC generator 1", "electrical supply board C", "backup electrical control module", "auxiliary power supply box B"];
        }
        const detChoices = makeStringChoices(detCorrect, detPool);
        qList.push({ q: detQ, options: detChoices.options, ans: detChoices.ans });

        // Q16: Landing Time
        const landChoices = makeTimeChoices(f.landingTime);
        qList.push({ q: "What time did the flight land at the first sector destination?", options: landChoices.options, ans: landChoices.ans });

        // Q17: Gate parked
        const gateChoices = makeStringChoices(f.gate, ["Gate A1", "Gate A3", "Gate B2", "Gate B5", "Gate C12", "Gate C18", "Gate D2", "Gate D5", "Gate E6", "Gate E8", "Gate F4", "Gate F12"]);
        qList.push({ q: "Which gate did the aircraft taxi to upon arrival?", options: gateChoices.options, ans: gateChoices.ans });

        // Q18: Disembarked Count
        const disChoices = makeNumChoices(f.disembarkCount, 5, " passengers");
        qList.push({ q: "How many passengers disembarked at this transit stop?", options: disChoices.options, ans: disChoices.ans });

        // Q19: Fuel refueled at turnaround
        const turnFuelVal = parseInt(f.fuelTurnaround);
        const turnFuelChoices = makeNumChoices(turnFuelVal, 2, " tons");
        qList.push({ q: "How much fuel was refueled during the turnaround?", options: turnFuelChoices.options, ans: turnFuelChoices.ans });

        // Q20: Boarding End Time
        const boardEndChoices = makeTimeChoices(f.boardingEnd);
        qList.push({ q: "What time was passenger boarding completed for the next leg?", options: boardEndChoices.options, ans: boardEndChoices.ans });

        // Q21: Economy Class Passengers
        const econChoices = makeNumChoices(f.economyClass, 10, " passengers");
        qList.push({ q: "How many passengers were in economy class?", options: econChoices.options, ans: econChoices.ans });

        // Q22: Premium Economy Passengers
        const premEconChoices = makeNumChoices(f.premiumEconomy, 5, " passengers");
        qList.push({ q: "How many passengers were in premium economy?", options: premEconChoices.options, ans: premEconChoices.ans });

        // Q23: Weather Conditions
        const weatherChoices = makeStringChoices(f.weather, [
            "fine with some scattered clouds over the sea",
            "mostly clear with a temperature of 28 degrees",
            "cloudy with light wind from the north",
            "overcast with smooth flight conditions en route",
            "excellent visibility with strong tailwinds",
            "clear skies and calm air over the mountains",
            "scattered rain clouds with slight convective activity"
        ]);
        qList.push({ q: "What was the weather along the flight route?", options: weatherChoices.options, ans: weatherChoices.ans });

        // Q24: Final Destination Airport
        const finalDestChoices = makeStringChoices(f.finalDestFull, routesList.map(r => r.final));
        qList.push({ q: "What was the final destination airport of the entire flight itinerary?", options: finalDestChoices.options, ans: finalDestChoices.ans });

        // Q25: Continuing Passengers count
        const continueChoices = makeNumChoices(f.continueCount, 10, " passengers");
        qList.push({ q: "How many passengers continued on the next leg to the final destination?", options: continueChoices.options, ans: continueChoices.ans });

        // Q26: New Boarding Passengers count
        const newBoardChoices = makeNumChoices(f.newBoardCount, 5, " passengers");
        qList.push({ q: "How many new passengers boarded the aircraft during turnaround?", options: newBoardChoices.options, ans: newBoardChoices.ans });

        // Q27: Next sector total passengers
        const totalNewChoices = makeNumChoices(f.totalNewPassengers, 10, " passengers");
        qList.push({ q: "What was the total number of passengers on board for the next sector?", options: totalNewChoices.options, ans: totalNewChoices.ans });

        // Q28: Boarding Start Time
        const boardStartChoices = makeTimeChoices(f.boardingStart);
        qList.push({ q: "What time did passenger boarding begin for the next leg?", options: boardStartChoices.options, ans: boardStartChoices.ans });

        // Q29: Landing Runway
        const rwyChoices = makeStringChoices(f.runway, ["19L", "19R", "01L", "01R", "27", "27R", "27L", "30L", "30R", "20C", "20R", "31L", "31R", "32L", "32R"]);
        qList.push({ q: "What was the runway used for landing at the transit airport?", options: rwyChoices.options, ans: rwyChoices.ans });

        // Q30: Secondary Incident Detail
        let secCorrect = "";
        let secQ = "";
        let secPool = [];
        if (f.incidentType === "medical_emergency") {
            secQ = "Who responded to assist the cabin crew during the passenger's medical emergency?";
            secCorrect = f.param.provider;
            secPool = ["a registered nurse on board", "a doctor traveling as passenger", "an off-duty flight attendant", "a paramedic en board"];
        } else if (f.incidentType === "coffee_spill") {
            secQ = "What treatment was applied to the passenger's coffee burn?";
            secCorrect = f.param.treatment;
            secPool = ["a cold burn compress and minor dressing", "applying cold running water", "a sterile bandage and burn ointment", "a cold compress and resting"];
        } else if (f.incidentType === "hydraulic_leak") {
            secQ = "How long was the pre-flight ground delay due to the hydraulic leak?";
            secCorrect = f.param.delay + " minutes";
            secPool = ["25 minutes", "30 minutes", "35 minutes", "40 minutes", "45 minutes", "50 minutes"];
        } else if (f.incidentType === "traffic_holding") {
            secQ = "What seat was occupied by the passenger experiencing ear pain during holding?";
            secCorrect = f.param.seat;
            secPool = ["24C", "33B", "18A", "9D", "15F", "28E"];
        } else if (f.incidentType === "refueling_delay") {
            secQ = "What was the specific cause of the ground refueling delay?";
            secCorrect = f.param.reason;
            secPool = ["fuel truck replacement due to a broken sensor", "a fuel leak en route", "fuel computer sensor calibration", "turnaround refuel pump failure"];
        } else if (f.incidentType === "aircraft_swap") {
            secQ = "How long was the flight delayed due to the aircraft swap?";
            secCorrect = f.param.delay + " minutes";
            secPool = ["45 minutes", "60 minutes", "75 minutes", "90 minutes", "120 minutes"];
        } else if (f.incidentType === "weather_diversion") {
            secQ = "How many hours did passengers stay en board the alternate airport during the diversion?";
            secCorrect = f.param.stay + " hours";
            secPool = ["3 hours", "4 hours", "5 hours", "6 hours", "2 hours"];
        } else if (f.incidentType === "catering_error") {
            secQ = "What specific mistake was made with the aircraft catering?";
            secCorrect = f.param.error;
            secPool = ["breakfast instead of afternoon meal", "vegetarian meals instead of standard sets", "missing crew meal boxes", "wrong drink selections", "no meal boxes loaded"];
        } else if (f.incidentType === "autopilot_disconnect") {
            secQ = "For how many minutes did the captain hand-fly the plane en autopilot disconnect?";
            secCorrect = f.param.handFly + " minutes";
            secPool = ["8 minutes", "10 minutes", "12 minutes", "15 minutes", "20 minutes"];
        } else if (f.incidentType === "generator_fault") {
            secQ = "What occurred immediately after the generator control unit failed climb phase?";
            secCorrect = "secondary generator took over automatically";
            secPool = ["secondary generator took over automatically", "emergency checklist execution", "the engine was shut down en caution", "APU took over en climbing caution"];
        }
        const secChoices = makeStringChoices(secCorrect, secPool);
        qList.push({ q: secQ, options: secChoices.options, ans: secChoices.ans });

        return qList;
    }

    // ----------------------------------------------------
    // ARITHMETIC GENERATOR (INTERFERENCE TASK)
    // ----------------------------------------------------

    function generateAllMathQuestions() {
        generatedMathQuestions = [];
        userMathAnswers = new Array(50).fill(null);
        
        const types = ['+', '-', '*', '/'];
        
        for (let i = 0; i < 50; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            let a = 0, b = 0, ans = 0, equation = "";
            
            if (type === '+') {
                a = Math.floor(Math.random() * 80) + 15; // 15 to 94
                b = Math.floor(Math.random() * 80) + 15;
                ans = a + b;
                equation = `${a} + ${b}`;
            } else if (type === '-') {
                a = Math.floor(Math.random() * 80) + 20; // 20 to 99
                b = Math.floor(Math.random() * (a - 10)) + 10; // 10 to a - 1
                ans = a - b;
                equation = `${a} - ${b}`;
            } else if (type === '*') {
                a = Math.floor(Math.random() * 11) + 2; // 2 to 12
                b = Math.floor(Math.random() * 14) + 2; // 2 to 15
                ans = a * b;
                equation = `${a} × ${b}`;
            } else if (type === '/') {
                b = Math.floor(Math.random() * 9) + 2; // 2 to 10
                ans = Math.floor(Math.random() * 14) + 2; // 2 to 15
                a = ans * b;
                equation = `${a} ÷ ${b}`;
            }
            
            // Distractors close in value (close distractors requirement)
            const optsSet = new Set([ans]);
            const offsets = [-3, -2, -1, 1, 2, 3];
            
            while (optsSet.size < 4) {
                const randOffset = offsets[Math.floor(Math.random() * offsets.length)];
                const val = ans + randOffset;
                if (val > 0) optsSet.add(val);
            }
            
            const options = Array.from(optsSet).sort((x, y) => x - y);
            
            generatedMathQuestions.push({
                equation,
                answer: ans,
                options,
                answerIndex: options.indexOf(ans)
            });
        }
    }

    function renderMathQuestionsList() {
        const container = document.getElementById('shortmemory-math-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        generatedMathQuestions.forEach((mq, qIdx) => {
            const card = document.createElement('div');
            card.className = 'math-quiz-card';
            card.id = `math-q-card-${qIdx}`;
            card.style.background = 'var(--bg-card)';
            card.style.border = '1.5px solid var(--border-glass)';
            card.style.borderRadius = '16px';
            card.style.padding = '20px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '15px';
            card.style.transition = 'all 0.2s ease';
            
            const cardHeader = document.createElement('div');
            cardHeader.style.display = 'flex';
            cardHeader.style.justifyContent = 'space-between';
            cardHeader.style.alignItems = 'center';
            
            const qNo = document.createElement('span');
            qNo.className = 'math-card-no';
            qNo.innerText = `โจทย์ข้อที่ ${qIdx + 1} / 50`;
            qNo.style.fontFamily = 'var(--font-mono)';
            qNo.style.fontSize = '13px';
            qNo.style.color = 'var(--text-dim)';
            qNo.style.fontWeight = '700';
            
            cardHeader.appendChild(qNo);
            
            const eqDisplay = document.createElement('div');
            eqDisplay.className = 'math-card-eq';
            eqDisplay.innerText = `${mq.equation} = ?`;
            eqDisplay.style.fontSize = '28px';
            eqDisplay.style.fontWeight = '700';
            eqDisplay.style.color = '#fff';
            eqDisplay.style.textAlign = 'center';
            eqDisplay.style.fontFamily = "'Outfit', sans-serif";
            
            const optsGrid = document.createElement('div');
            optsGrid.className = 'options-grid-4';
            optsGrid.style.marginTop = '10px';
            
            mq.options.forEach((opt, oIdx) => {
                const btn = document.createElement('button');
                btn.className = 'btn-action math-opt-btn';
                btn.innerText = opt;
                btn.style.fontSize = '18px';
                btn.style.padding = '10px';
                btn.onclick = () => handleMathAnswerClick(qIdx, oIdx);
                optsGrid.appendChild(btn);
            });
            
            card.appendChild(cardHeader);
            card.appendChild(eqDisplay);
            card.appendChild(optsGrid);
            
            container.appendChild(card);
        });
    }

    function handleMathAnswerClick(qIdx, oIdx) {
        if (isReviewMode) return; // Prevent clicking in review mode
        
        userMathAnswers[qIdx] = oIdx;
        window.playSound('beep');
        
        // Update visual selection for this card
        const card = document.getElementById(`math-q-card-${qIdx}`);
        if (card) {
            const btns = card.querySelectorAll('.math-opt-btn');
            btns.forEach((btn, idx) => {
                btn.classList.toggle('selected', idx === oIdx);
            });
        }
        
        // Automatically scroll to the next card after a very short delay for smoothness
        const nextCard = document.getElementById(`math-q-card-${qIdx + 1}`);
        if (nextCard) {
            setTimeout(() => {
                nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        
        // Check if all 50 questions are answered
        const allAnswered = userMathAnswers.every(ans => ans !== null);
        if (allAnswered) {
            setTimeout(() => {
                if (phase === 'math') {
                    proceedToRecall();
                }
            }, 600);
        }
    }

    function renderMathSolutionsReview() {
        const container = document.getElementById('shortmemory-math-review-container');
        if (!container) return;
        
        container.innerHTML = '';
        container.style.display = 'block';
        
        // Header
        const heading = document.createElement('h3');
        heading.innerText = '📝 เฉลยส่วนคิดเลขคั่นเวลา (Math Interference Solutions)';
        heading.style.fontSize = '16px';
        heading.style.color = 'var(--accent)';
        heading.style.marginBottom = '15px';
        heading.style.borderBottom = '1px solid var(--border-glass)';
        heading.style.paddingBottom = '8px';
        container.appendChild(heading);
        
        // Main scrollable list of equations
        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
        list.style.gap = '10px';
        list.style.maxHeight = '250px';
        list.style.overflowY = 'auto';
        list.style.padding = '10px';
        list.style.background = 'rgba(0,0,0,0.2)';
        list.style.borderRadius = '10px';
        list.style.border = '1px solid var(--border-glass)';
        
        let correctMaths = 0;
        generatedMathQuestions.forEach((mq, idx) => {
            const userAnsIdx = userMathAnswers[idx];
            const correctAnsIdx = mq.answerIndex;
            const isCorrect = (userAnsIdx === correctAnsIdx);
            if (isCorrect) correctMaths++;
            
            const item = document.createElement('div');
            item.style.padding = '8px';
            item.style.borderRadius = '6px';
            item.style.fontSize = '12px';
            item.style.fontFamily = 'var(--font-mono)';
            item.style.textAlign = 'center';
            
            if (isCorrect) {
                item.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                item.style.background = 'rgba(16, 185, 129, 0.05)';
                item.innerHTML = `<span style="color:var(--text-dim)">#${idx+1}:</span> ${mq.equation} = <b style="color:var(--correct)">${mq.answer}</b> <span style="color:var(--correct)">✓</span>`;
            } else {
                item.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                item.style.background = 'rgba(239, 68, 68, 0.05)';
                const userVal = userAnsIdx !== null ? mq.options[userAnsIdx] : 'N/A';
                item.innerHTML = `<span style="color:var(--text-dim)">#${idx+1}:</span> ${mq.equation} = <b>${mq.answer}</b><br><span style="font-size:10px; color:var(--wrong)">ตอบ: ${userVal} ✗</span>`;
            }
            list.appendChild(item);
        });
        
        // Show correct math score summary
        const summary = document.createElement('div');
        summary.style.fontSize = '13px';
        summary.style.color = 'var(--text-main)';
        summary.style.marginBottom = '15px';
        summary.innerHTML = `คิดเลขถูกต้องทั้งหมด: <b style="color:var(--accent); font-size:16px;">${correctMaths} / 50</b> ข้อ`;
        
        container.appendChild(summary);
        container.appendChild(list);
    }

    function renderRecallSolutionsReview() {
        const container = document.getElementById('shortmemory-recall-review-container');
        if (!container) return;
        
        container.innerHTML = '';
        container.style.display = 'block';
        
        // Header
        const heading = document.createElement('h3');
        heading.innerText = '📝 เฉลยคำถามวัดความจำบทความ (Recall Questions Solutions)';
        heading.style.fontSize = '16px';
        heading.style.color = 'var(--accent)';
        heading.style.marginBottom = '15px';
        heading.style.borderBottom = '1px solid var(--border-glass)';
        heading.style.paddingBottom = '8px';
        container.appendChild(heading);
        
        const meta = flightsMetadata[currentSetIndex];
        
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '12px';
        
        meta.questionsList.forEach((qObj, idx) => {
            const userAnsIdx = userAnswers[idx];
            const correctAnsIdx = qObj.ans;
            const isCorrect = (userAnsIdx === correctAnsIdx);
            
            const item = document.createElement('div');
            item.style.padding = '15px';
            item.style.borderRadius = '12px';
            item.style.border = '1.5px solid var(--border-glass)';
            item.style.background = 'var(--bg-card)';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.gap = '8px';
            
            const qTitle = document.createElement('div');
            qTitle.style.fontWeight = '700';
            qTitle.style.fontSize = '14px';
            qTitle.style.color = '#fff';
            
            if (isCorrect) {
                item.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                item.style.background = 'rgba(16, 185, 129, 0.03)';
                qTitle.innerHTML = `<span style="color:var(--correct)">✓ ข้อที่ ${idx + 1}:</span> ${qObj.q}`;
            } else {
                item.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                item.style.background = 'rgba(239, 68, 68, 0.03)';
                qTitle.innerHTML = `<span style="color:var(--wrong)">✗ ข้อที่ ${idx + 1}:</span> ${qObj.q}`;
            }
            
            const userText = userAnsIdx !== null ? qObj.options[userAnsIdx] : 'ข้ามข้อนี้ (No answer)';
            const correctText = qObj.options[correctAnsIdx];
            
            const ansDetails = document.createElement('div');
            ansDetails.style.fontSize = '12px';
            ansDetails.style.lineHeight = '1.5';
            
            if (isCorrect) {
                ansDetails.innerHTML = `
                    <div style="color: var(--text-dim);">คำตอบของคุณ: <b style="color: var(--correct)">${correctText}</b></div>
                `;
            } else {
                ansDetails.innerHTML = `
                    <div style="color: var(--text-dim);">คำตอบของคุณ: <b style="color: var(--wrong)">${userText}</b></div>
                    <div style="color: var(--text-dim); margin-top: 2px;">คำตอบที่ถูกต้อง: <b style="color: var(--correct)">${correctText}</b></div>
                `;
            }
            
            item.appendChild(qTitle);
            item.appendChild(ansDetails);
            list.appendChild(item);
        });
        
        container.appendChild(list);
    }

    function getMathCorrectCount() {
        let correctCount = 0;
        generatedMathQuestions.forEach((mq, idx) => {
            if (userMathAnswers[idx] === mq.answerIndex) {
                correctCount++;
            }
        });
        return correctCount;
    }

    // ----------------------------------------------------
    // ENGINE GAME LOOP
    // ----------------------------------------------------

    function initGame() {
        if (!active) return;
        
        isAnswered = false;
        isReviewMode = false;
        
        // Randomize a scenario out of 50
        currentSetIndex = Math.floor(Math.random() * flightsMetadata.length);
        currentQIndex = 0;
        
        // Dynamically regenerate the flight metadata for this index to randomize numbers new every time
        flightsMetadata[currentSetIndex] = generateFlightMetadata(currentSetIndex);
        
        // Generate current question lists
        const meta = flightsMetadata[currentSetIndex];
        meta.reportText = compileFlightReport(meta);
        meta.questionsList = compileQuestions(meta);
        
        userAnswers = new Array(30).fill(null);
        
        // Clean Math state
        correctMathCount = 0;
        generatedMathQuestions = [];
        userMathAnswers = new Array(50).fill(null);
        
        showPhase('read');
    }

    function showPhase(newPhase) {
        phase = newPhase;
        
        // Hide all areas
        readArea.style.display = 'none';
        mathArea.style.display = 'none';
        recallArea.style.display = 'none';
        recallNavs.style.display = 'none';
        quizNav.style.display = 'none';
        
        // Adjust Header visibility
        const scoreDiv = document.getElementById('sm-stat-score-div');
        const accDiv = document.getElementById('sm-stat-acc-div');
        
        if (phase === 'read') {
            scoreDiv.style.display = 'none';
            accDiv.style.display = 'none';
            phaseNameEl.innerText = "Phase 1 / 3";
            timerLabelEl.innerText = "Reading Time";
            
            // Set text
            const meta = flightsMetadata[currentSetIndex];
            document.getElementById('shortmemory-read-title').innerText = `${meta.airline} Flight ${meta.flightNo} Report`;
            document.getElementById('shortmemory-read-text').innerHTML = meta.reportText;
            
            readArea.style.display = 'block';
            startTimer(180, proceedToMath); // 3 minutes for reading
            
        } else if (phase === 'math') {
            scoreDiv.style.display = 'none';
            accDiv.style.display = 'none';
            phaseNameEl.innerText = "Phase 2 / 3";
            timerLabelEl.innerText = "Math Interference Time";
            
            mathArea.style.display = 'block';
            generateAllMathQuestions();
            renderMathQuestionsList();
            startTimer(180, proceedToRecall); // 3 minutes for math task
            
        } else if (phase === 'recall') {
            scoreDiv.style.display = 'block';
            accDiv.style.display = 'block';
            phaseNameEl.innerText = "Phase 3 / 3";
            timerLabelEl.innerText = "Exam Time (No Limit)";
            timerEl.innerText = "— : —";
            stopTimerInterval();
            
            recallArea.style.display = 'block';
            recallNavs.style.display = 'flex';
            quizNav.style.display = 'flex';
            
            score = 0;
            totalAttempts = 0;
            correctAttempts = 0;
            currentQIndex = 0;
            buildQuizNavigator();
            renderRecallQuestionsList();
            
            setTimeout(() => {
                const navBtns = quizNav.querySelectorAll('.quiz-nav-btn');
                if (navBtns.length > 0) {
                    navBtns.forEach((b, i) => b.classList.toggle('current', i === 0));
                }
            }, 100);
            
            // Render briefing card en-route during review
            const briefingContainer = document.getElementById('shortmemory-recall-briefing-container');
            if (briefingContainer) {
                if (isReviewMode) {
                    const meta = flightsMetadata[currentSetIndex];
                    briefingContainer.style.display = 'block';
                    briefingContainer.innerHTML = `
                        <div class="briefing-card">
                            <div class="briefing-header">
                                <h3>FLIGHT REPORT BRIEFING (REVIEW MODE)</h3>
                                <span class="briefing-badge" style="color: var(--accent); border-color: var(--accent);">STUDY REFERENCE</span>
                            </div>
                            <div class="briefing-content" style="font-size: 15px; line-height: 1.8; color: var(--text-main); font-family: monospace; white-space: pre-line; max-height: 250px; overflow-y: auto;">
                                ${meta.reportText}
                            </div>
                        </div>
                    `;
                } else {
                    briefingContainer.style.display = 'none';
                }
            }
            
            // Render recall questions solutions list en-route during review
            const recallReviewContainer = document.getElementById('shortmemory-recall-review-container');
            if (recallReviewContainer) {
                if (isReviewMode) {
                    renderRecallSolutionsReview();
                } else {
                    recallReviewContainer.style.display = 'none';
                }
            }
            
            // Render math solutions list if in review mode
            const reviewContainer = document.getElementById('shortmemory-math-review-container');
            if (reviewContainer) {
                if (isReviewMode) {
                    renderMathSolutionsReview();
                } else {
                    reviewContainer.style.display = 'none';
                }
            }
        }
    }

    // ----------------------------------------------------
    // TIMERS UTILS
    // ----------------------------------------------------

    function startTimer(duration, callback) {
        stopTimerInterval();
        timerValue = duration;
        updateTimerDisplay();
        
        timerInterval = setInterval(() => {
            timerValue--;
            updateTimerDisplay();
            if (timerValue <= 0) {
                stopTimerInterval();
                callback();
            }
        }, 1000);
    }

    function stopTimerInterval() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimerDisplay() {
        const mm = Math.floor(timerValue / 60).toString().padStart(2, '0');
        const ss = (timerValue % 60).toString().padStart(2, '0');
        timerEl.innerText = `${mm}:${ss}`;
        
        if (timerValue <= 10) {
            timerEl.style.color = 'var(--wrong)';
        } else {
            timerEl.style.color = 'var(--text-main)';
        }
    }

    // ----------------------------------------------------
    // TRANSITIONS
    // ----------------------------------------------------

    function proceedToMath() {
        timeSpentReading = 180 - timerValue;
        proceedToMathEffect();
    }

    function proceedToMathEffect() {
        stopTimerInterval();
        window.playSound('beep');
        showPhase('math');
    }

    function proceedToRecall() {
        timeSpentMath = 180 - timerValue;
        stopTimerInterval();
        window.playSound('levelUp');
        showPhase('recall');
    }

    // ----------------------------------------------------
    // PHASE 2: MATH LOGIC
    // ----------------------------------------------------

    function buildQuizNavigator() {
        quizNav.innerHTML = '';
        const meta = flightsMetadata[currentSetIndex];
        
        meta.questionsList.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-nav-btn';
            btn.innerText = idx + 1;
            
            if (userAnswers[idx] !== null) {
                btn.classList.add('answered');
            }
            
            btn.onclick = () => {
                const targetCard = document.getElementById(`recall-q-card-${idx}`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const navBtns = quizNav.querySelectorAll('.quiz-nav-btn');
                    navBtns.forEach((b, i) => b.classList.toggle('current', i === idx));
                    currentQIndex = idx;
                }
            };
            quizNav.appendChild(btn);
        });
    }

    function renderRecallQuestionsList() {
        const container = document.getElementById('shortmemory-recall-container');
        if (!container) return;
        container.innerHTML = '';
        
        const meta = flightsMetadata[currentSetIndex];
        
        meta.questionsList.forEach((qObj, qIdx) => {
            const card = document.createElement('div');
            card.className = 'recall-quiz-card';
            card.id = `recall-q-card-${qIdx}`;
            card.style.background = 'var(--bg-card)';
            card.style.border = '1.5px solid var(--border-glass)';
            card.style.borderRadius = '16px';
            card.style.padding = '20px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '15px';
            card.style.transition = 'all 0.2s ease';
            
            if (isReviewMode) {
                const userAns = userAnswers[qIdx];
                const correctAns = qObj.ans;
                if (userAns === correctAns) {
                    card.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                    card.style.background = 'rgba(16, 185, 129, 0.03)';
                } else {
                    card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                    card.style.background = 'rgba(239, 68, 68, 0.03)';
                }
            }
            
            const cardHeader = document.createElement('div');
            cardHeader.style.display = 'flex';
            cardHeader.style.justifyContent = 'space-between';
            cardHeader.style.alignItems = 'center';
            
            const qNo = document.createElement('span');
            qNo.innerText = `Recall Question ${qIdx + 1} / 30`;
            qNo.style.fontFamily = 'var(--font-mono)';
            qNo.style.fontSize = '13px';
            qNo.style.color = 'var(--text-dim)';
            qNo.style.fontWeight = '700';
            cardHeader.appendChild(qNo);
            
            const qText = document.createElement('div');
            qText.innerText = qObj.q;
            qText.style.fontSize = '18px';
            qText.style.fontWeight = '600';
            qText.style.color = '#fff';
            qText.style.lineHeight = '1.5';
            
            const optsGrid = document.createElement('div');
            optsGrid.style.display = 'flex';
            optsGrid.style.flexDirection = 'column';
            optsGrid.style.gap = '10px';
            
            qObj.options.forEach((opt, oIdx) => {
                const btn = document.createElement('button');
                btn.className = 'btn-action recall-opt-btn';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'flex-start';
                btn.style.textAlign = 'left';
                btn.style.padding = '12px 15px';
                btn.style.fontSize = '15px';
                btn.style.width = '100%';
                btn.style.gap = '15px';
                
                const indicator = document.createElement('span');
                indicator.className = 'opt-indicator';
                indicator.innerText = String.fromCharCode(65 + oIdx);
                indicator.style.background = 'rgba(255,255,255,0.1)';
                indicator.style.borderRadius = '50%';
                indicator.style.width = '24px';
                indicator.style.height = '24px';
                indicator.style.display = 'inline-flex';
                indicator.style.alignItems = 'center';
                indicator.style.justifyContent = 'center';
                indicator.style.fontWeight = 'bold';
                indicator.style.flexShrink = '0';
                
                const optText = document.createElement('span');
                optText.className = 'opt-text';
                optText.innerText = opt;
                
                btn.appendChild(indicator);
                btn.appendChild(optText);
                
                if (isReviewMode) {
                    btn.disabled = true;
                    const userAns = userAnswers[qIdx];
                    const correctAns = qObj.ans;
                    if (oIdx === correctAns) {
                        btn.classList.add('correct');
                    } else if (oIdx === userAns) {
                        btn.classList.add('wrong');
                    }
                } else {
                    btn.disabled = false;
                    if (userAnswers[qIdx] === oIdx) {
                        btn.classList.add('selected');
                    }
                    btn.onclick = () => handleRecallAnswerClick(qIdx, oIdx);
                }
                
                optsGrid.appendChild(btn);
            });
            
            card.appendChild(cardHeader);
            card.appendChild(qText);
            card.appendChild(optsGrid);
            container.appendChild(card);
        });
    }

    function handleRecallAnswerClick(qIdx, oIdx) {
        if (isReviewMode) return;
        
        userAnswers[qIdx] = oIdx;
        window.playSound('beep');
        
        // Update visual selection for this card
        const card = document.getElementById(`recall-q-card-${qIdx}`);
        if (card) {
            const btns = card.querySelectorAll('.recall-opt-btn');
            btns.forEach((btn, idx) => {
                btn.classList.toggle('selected', idx === oIdx);
            });
        }
        
        // Mark answered in navigator
        const navBtns = quizNav.querySelectorAll('.quiz-nav-btn');
        if (navBtns[qIdx]) {
            navBtns[qIdx].classList.add('answered');
        }
        
        recalculateLiveStats();
        
        // Automatically scroll to the next card after a very short delay for smoothness
        const nextCard = document.getElementById(`recall-q-card-${qIdx + 1}`);
        if (nextCard) {
            setTimeout(() => {
                nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const navBtns2 = quizNav.querySelectorAll('.quiz-nav-btn');
                navBtns2.forEach((b, i) => b.classList.toggle('current', i === qIdx + 1));
                currentQIndex = qIdx + 1;
            }, 150);
        }
    }

    function recalculateLiveStats() {
        const meta = flightsMetadata[currentSetIndex];
        let correctCount = 0;
        let answeredCount = 0;
        
        userAnswers.forEach((ans, idx) => {
            if (ans !== null) {
                answeredCount++;
                if (ans === meta.questionsList[idx].ans) {
                    correctCount++;
                }
            }
        });
        
        correctAttempts = correctCount;
        totalAttempts = answeredCount;
        score = correctCount * 10;
        
        updateStats();
    }

    function updateStats() {
        scoreEl.innerText = score;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
        accEl.innerText = `${acc}%`;
    }

    function submitQuiz() {
        stopTimerInterval();
        
        const meta = flightsMetadata[currentSetIndex];
        
        const historyData = meta.questionsList.map((q, idx) => {
            const userAns = userAnswers[idx];
            const isCorrect = (userAns === q.ans);
            
            return {
                type: 'Recall Question',
                timeTaken: 0,
                isCorrect,
                reviewId: idx,
                userAnswer: userAns,
                correctAnswer: q.ans
            };
        });
        
        const totalCorrect = historyData.filter(h => h.isCorrect).length;
        const durationSec = timeSpentReading + timeSpentMath;
        
        if (window.showQuizResult) {
            window.showQuizResult('shortmemory', totalCorrect, 30, durationSec, historyData, 'standard');
        }
    }

    function reviewQuestion(questionIdx) {
        isReviewMode = true;
        
        document.getElementById('shortmemory-review-banner').style.display = 'block';
        
        showPhase('recall');
        
        setTimeout(() => {
            const targetCard = document.getElementById(`recall-q-card-${questionIdx}`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
    }

    function exitReview() {
        isReviewMode = false;
        document.getElementById('shortmemory-review-banner').style.display = 'none';
        
        // Back to quiz modal
        if (document.getElementById('quiz-result-modal')) {
            document.getElementById('quiz-result-modal').classList.add('active');
        }
    }

    // ----------------------------------------------------
    // INITIALIZATION & LISTENERS
    // ----------------------------------------------------

    function stop() {
        active = false;
        stopTimerInterval();
        
        if (lobbyView) lobbyView.style.display = 'none';
        if (stageView) stageView.style.display = 'none';
        
        const briefingContainer = document.getElementById('shortmemory-recall-briefing-container');
        if (briefingContainer) briefingContainer.style.display = 'none';
        const recallReviewContainer = document.getElementById('shortmemory-recall-review-container');
        if (recallReviewContainer) recallReviewContainer.style.display = 'none';
        const reviewContainer = document.getElementById('shortmemory-math-review-container');
        if (reviewContainer) reviewContainer.style.display = 'none';
    }

    function start() {
        active = true;
        isReviewMode = false;
        
        // Fetch HTML references
        lobbyView = document.getElementById('shortmemory-lobby');
        stageView = document.getElementById('shortmemory-stage');
        readArea = document.getElementById('shortmemory-read-area');
        mathArea = document.getElementById('shortmemory-math-area');
        recallArea = document.getElementById('shortmemory-recall-area');
        
        timerEl = document.getElementById('shortmemory-timer');
        timerLabelEl = document.querySelector('#shortmemory-stage .g-stat:last-child .gs-label');
        scoreEl = document.getElementById('shortmemory-score');
        accEl = document.getElementById('shortmemory-accuracy');
        phaseNameEl = document.getElementById('shortmemory-phase-name');
        
        doneReadingBtn = document.getElementById('shortmemory-done-reading-btn');
        quitBtn = document.getElementById('shortmemory-quit-btn');
        prevBtn = document.getElementById('shortmemory-prev-btn');
        nextBtn = document.getElementById('shortmemory-next-btn');
        submitBtn = document.getElementById('shortmemory-submit-btn');
        recallNavs = document.getElementById('shortmemory-recall-navs');
        quizNav = document.getElementById('shortmemory-quiz-navigator');
        
        lobbyView.style.display = 'flex';
        stageView.style.display = 'none';
        
        // Load best record from localStorage
        const lobbyBestEl = document.getElementById('shortmemory-lobby-best');
        if (lobbyBestEl && window.getBestRecord) {
            const best = window.getBestRecord('shortmemory', 'standard');
            if (best) {
                lobbyBestEl.innerHTML = `🏆 <b>Best Record:</b> Accuracy: ${best.pct}% | Time: ${best.sec}s`;
            } else {
                lobbyBestEl.innerHTML = `🏆 <b>Best Record:</b> No previous record found`;
            }
        }
        
        // Bind Start button
        document.getElementById('shortmemory-start-lobby').onclick = () => {
            lobbyView.style.display = 'none';
            stageView.style.display = 'block';
            initGame();
        };
    }

    // Bind document events
    document.addEventListener('DOMContentLoaded', () => {
        // Bind Recall Click options
        document.querySelectorAll('.recall-opt-btn').forEach((btn, idx) => {
            btn.onclick = () => handleRecallClick(idx);
        });
        
        // Done reading
        document.getElementById('shortmemory-done-reading-btn').onclick = () => {
            proceedToMath();
        };
        
        // Quit button
        document.getElementById('shortmemory-quit-btn').onclick = () => {
            stop();
            if (window.switchView) {
                window.switchView('dashboard');
            }
        };
        
        // Review banner
        document.getElementById('shortmemory-review-banner').onclick = () => {
            exitReview();
        };
        
        // Nav actions
        document.getElementById('shortmemory-prev-btn').onclick = () => {
            if (currentQIndex > 0) {
                currentQIndex--;
                const targetCard = document.getElementById(`recall-q-card-${currentQIndex}`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const navBtns = quizNav.querySelectorAll('.quiz-nav-btn');
                    navBtns.forEach((b, i) => b.classList.toggle('current', i === currentQIndex));
                }
            }
        };
        
        document.getElementById('shortmemory-next-btn').onclick = () => {
            if (currentQIndex < 29) {
                currentQIndex++;
                const targetCard = document.getElementById(`recall-q-card-${currentQIndex}`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const navBtns = quizNav.querySelectorAll('.quiz-nav-btn');
                    navBtns.forEach((b, i) => b.classList.toggle('current', i === currentQIndex));
                }
            }
        };
        
        document.getElementById('shortmemory-submit-btn').onclick = () => {
            submitQuiz();
        };
    });

    return {
        start,
        stop,
        review: reviewQuestion,
        getMathCorrectCount: getMathCorrectCount
    };
})();

// Export globally
window.ShortMemoryEngine = ShortMemoryEngine;
