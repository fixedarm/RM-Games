const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Global Game State
let gameState = {
  status: 'lobby', // lobby, active, end_round, game_over
  currentRound: 1,
  finalRound: 9, // default to 9
  timer: 0,
  timerActive: false,
  puzzleMode: 'standard', // 'standard' or 'objective'
  startingCountdown: false,
  teams: {
    alpha: { id: 'alpha', name: 'Team Alpha', score: 0, notes: '', draftAnswers: {}, roundStatus: {} },
    beta: { id: 'beta', name: 'Team Beta', score: 0, notes: '', draftAnswers: {}, roundStatus: {} },
    gamma: { id: 'gamma', name: 'Team Gamma', score: 0, notes: '', draftAnswers: {}, roundStatus: {} },
    delta: { id: 'delta', name: 'Team Delta', score: 0, notes: '', draftAnswers: {}, roundStatus: {} }
  },
  players: {}, // socketId -> { name, teamId, roleId }
  roundSolveCount: 0 // How many teams solved in the current round (used for base points ordering)
};

// Timer interval
let timerInterval = null;
let countdownTimeout = null;

// Puzzles & Answers
const puzzles = {
  1: {
    title: "Round 1: Wrench Time Optimization & PTW Bottlenecks",
    verify: (answers) => {
      const option = (answers.option || '').trim().toUpperCase();
      const wrenchTime = parseInt(answers.wrenchTime, 10);
      const gain = parseInt(String(answers.gain).replace(/[\$,]/g, ''), 10);
      return option === 'A' && wrenchTime === 20 && gain === 9000;
    },
    correctQ1: '0',
    correctQ2: '1',
    q1Options: [
      "Action A (Digitized PTW workflow)",
      "Action B (Pre-kitting Spare Parts bins)",
      "Action C (Tool Crib Centralization)"
    ],
    q2Options: [
      "$2,000/week",
      "$9,000/week",
      "$4,000/week",
      "-$1,000/week"
    ],
    solutionExplanation: "Action A (Digitized PTW) is the optimal decision. Wrench time increases by 10 hours (from 10 to 20 hours/week) due to a reduction in permit delays. Net Economic Gain = (10 hours increase * $1,000 value/hour) - $1,000 cost = $9,000. Action B yields a net gain of $3,000 (5 hours * $1k - $2k cost). Action C yields a net gain of -$1,000 (2 hours * $1k - $3k cost).",
    complianceExplanation: "This aligns with the SCL Asset Performance Framework (Wrench Time Optimization) by prioritizing the elimination of administrative bottlenecks (Permit to Work delay) to maximize direct tool time."
  },
  2: {
    title: "Round 2: Maintenance Backlog & Campaign Scheduling",
    verify: (answers) => {
      const method = (answers.method || '').trim().toLowerCase();
      const techs = parseInt(answers.techs, 10);
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return method === 'campaign' && techs === 8 && cost === 9000;
    },
    correctQ1: '0',
    correctQ2: '2',
    q1Options: [
      "Campaign Maintenance",
      "Reactive Maintenance"
    ],
    q2Options: [
      "$10,000",
      "$11,000",
      "$9,000",
      "$12,000"
    ],
    solutionExplanation: "Campaign Maintenance using 8 technicians is the optimal schedule. Planning efficiency reduces the 100 hours backlog to 80 hours. 8 technicians working 10 hours each provide exactly 80 hours of capacity. Total Cost = 8 technicians * $1,000/tech + $1,000 campaign fee = $9,000. Reactive scheduling requires 10 technicians and costs $10,000.",
    complianceExplanation: "This complies with SCL Late Life Campaign Scheduling guidelines and backlog management standards by showing that planned campaigns optimize labor expenditures."
  },
  3: {
    title: "Round 3: Preventive Maintenance (PM) Compliance & Execution",
    verify: (answers) => {
      const startDay = parseInt(answers.startDay, 10);
      const duration = parseInt(answers.duration, 10);
      return startDay === 2 && duration === 6;
    },
    correctQ1: '1',
    correctQ2: '2',
    q1Options: [
      "Day 1",
      "Day 2",
      "Day 3",
      "Day 4"
    ],
    q2Options: [
      "4 hours",
      "5 hours",
      "6 hours",
      "8 hours"
    ],
    solutionExplanation: "The PM execution must start on Day 2 and takes 6 hours. Day 2 is the only day satisfying crane access (Days 1-2), process window (Days 2-3), and vendor availability (Day 2 ONLY). The total duration is 6 hours (1-hour safety brief + 4-hour mechanical work + 1-hour clean-up).",
    complianceExplanation: "This satisfies SCL HSE Compliance Standards by integrating mandatory safety briefs and clean-ups into the vendor work window, preventing unauthorized execution outside vendor availability."
  },
  4: {
    title: "Round 4: Planning & Preparation Quality (Plan Quality Index)",
    verify: (answers) => {
      const pqi = parseInt(answers.pqi, 10);
      const wrenchTime = parseInt(answers.wrenchTime, 10);
      const kits = parseInt(answers.kits, 10);
      return pqi === 80 && wrenchTime === 8 && kits === 5;
    },
    correctQ1: '2',
    correctQ2: '1',
    q1Options: [
      "100%",
      "90%",
      "80%",
      "60%"
    ],
    q2Options: [
      "10 hours",
      "8 hours",
      "6 hours",
      "5 hours"
    ],
    solutionExplanation: "The Plan Quality Index (PQI) is 80% (4 of 5 steps completed). This reduces the planned 10-hour wrench time to 8 hours (10 * 80%). The logistics coordinator must prepare 5 material kits (1 for each of the 5 valves in the campaign).",
    complianceExplanation: "This illustrates the SCL Maintenance Excellence preparation gate checklist, where planning readiness (PQI) directly correlates to workforce execution quality."
  },
  5: {
    title: "Round 5: Subsea Well Decommissioning Strategy (LLAM)",
    verify: (answers) => {
      const strategy = (answers.strategy || '').trim().toUpperCase();
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return strategy === 'C' && cost === 35000;
    },
    correctQ1: '2',
    correctQ2: '2',
    q1Options: [
      "Immediate Plug & Abandonment (Option A)",
      "5-Year Wet Suspension (Option B)",
      "Liability Transfer Sale (Option C)"
    ],
    q2Options: [
      "$50,000",
      "$85,000",
      "$35,000",
      "$25,000"
    ],
    solutionExplanation: "Option C (Liability Transfer Sale) is the most cost-efficient decommissioning strategy. Option A costs $50,000 (5 wells * $10k/well). Option B costs $85,000 (Suspension cost: $25k + future P&A: $60k). Option C costs $35,000 (Transaction cost: $25k + liability transfer fee: $10k).",
    complianceExplanation: "This follows SCL Late Life Asset Decommissioning Guidelines (LLAD-05), which permit transfer of liability to niche operators to mitigate decommissioning liabilities."
  },
  6: {
    title: "Round 6: Turbine Bearing Spare Parts Logistics (MMS)",
    verify: (answers) => {
      const option = (answers.option || '').trim().toUpperCase();
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return option === 'A' && cost === 1500;
    },
    correctQ1: '0',
    correctQ2: '0',
    q1Options: [
      "Local Warehouse Stocking (Option A)",
      "Central Hub Ordering (Option B)",
      "Shared Inventory Pool (Option C)"
    ],
    q2Options: [
      "$1,500",
      "$2,500",
      "$1,750",
      "$0"
    ],
    solutionExplanation: "Option A (Local Stock) is optimal with an expected cost of $1,500/week. Option B (Central Hub) expected cost is $2,500/week (50% risk of stockout * $5,000 downtime). Option C (Shared Pool) expected cost is $1,750/week ($500 membership fee + 50% * $2,500 downtime).",
    complianceExplanation: "This complies with SCL Material Management Standards (MMS-06) by prioritizing high-criticality spares local storage over delayed-delivery configurations."
  },
  7: {
    title: "Round 7: Piping Corrosion Inspection (NII)",
    verify: (answers) => {
      const strategy = (answers.strategy || '').trim().toUpperCase();
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return strategy === 'B' && cost === 10000;
    },
    correctQ1: '1',
    correctQ2: '1',
    q1Options: [
      "Manual Stripping & UT (Option A)",
      "Pulsed Eddy Current (Option B)",
      "Visual Inspection Only (Option C)"
    ],
    q2Options: [
      "$11,000",
      "$10,000",
      "$17,000",
      "$6,000"
    ],
    solutionExplanation: "Option B (Pulsed Eddy Current) minimizes total expected cost at $10,000 ($6k inspection + $4k risk penalty). Option A (Manual Stripping) costs $11,000 ($10k inspection + $1k risk). Option C (Visual) costs $17,000 ($1k inspection + $16k risk).",
    complianceExplanation: "This follows SCL Non-Intrusive Inspection (NII) guidelines, using pulsed eddy current scan arrays to test piping integrity without full insulation stripping costs."
  },
  8: {
    title: "Round 8: ESD Valve Testing Interval (Safety Critical Elements)",
    verify: (answers) => {
      const interval = (answers.interval || '').trim().toUpperCase();
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return (interval === '6 MONTHS' || interval === '6-MONTH' || interval === '6') && cost === 4000;
    },
    correctQ1: '1',
    correctQ2: '0',
    q1Options: [
      "3-Month Interval (Option C)",
      "6-Month Interval (Option A)",
      "12-Month Interval (Option B)"
    ],
    q2Options: [
      "$4,000",
      "$2,000",
      "$8,000",
      "$0"
    ],
    solutionExplanation: "Option A (6-Month Testing) is the most cost-effective compliant testing frequency. It costs $4,000/year and maintains PFD at 0.010, which meets the safety critical limits (PFD <= 0.015). Option B (12-Month) fails safety criteria (PFD 0.020). Option C (3-Month) is compliant but over-tests at a cost of $8,000.",
    complianceExplanation: "This adheres to SCL Safety Critical System integrity protocols where testing intervals are systematically balanced against failure probability thresholds."
  },
  9: {
    title: "Round 9: Operator Competency & Flaring Prevention (Operations Excellence)",
    verify: (answers) => {
      const method = (answers.method || '').trim().toUpperCase();
      const cost = parseInt(String(answers.cost).replace(/[\$,]/g, ''), 10);
      return method === 'A' && cost === 5000;
    },
    correctQ1: '0',
    correctQ2: '0',
    q1Options: [
      "Simulator-Based (Option A)",
      "Classroom Lecture (Option B)",
      "On-the-Job Mentoring (Option C)"
    ],
    q2Options: [
      "$5,000",
      "$11,000",
      "$15,000",
      "$3,000"
    ],
    solutionExplanation: "Option A (Simulator Training) is the optimal investment, yielding $5,000 total expected cost ($3,000 training + 0.02 P(flare) * $100,000 penalty = $2,000). Option B costs $11,000 ($1,000 + 0.10 * $100,000). Option C costs $15,000 ($0 + 0.15 * $100,000).",
    complianceExplanation: "This demonstrates SCL Environmental Performance standards by showing that advanced simulator certifications minimize emissions and flare penalties."
  },
  10: {
    title: "Tie-Breaker Round: SCL Maintenance Execution Cycle",
    verify: (answers) => {
      const sequence = answers.sequence || [];
      const correctSequence = [
        'Identify & Define',
        'Approve & Prioritize',
        'Plan & Prepare',
        'Schedule & Align',
        'Permit & Authorize',
        'Execute & Monitor',
        'Close & Document',
        'Review & Improve'
      ];
      if (sequence.length !== correctSequence.length) return false;
      for (let i = 0; i < correctSequence.length; i++) {
        if (sequence[i] !== correctSequence[i]) return false;
      }
      return true;
    },
    correctQ1: '1',
    correctQ2: '2',
    q1Options: [
      "Approve & Prioritize",
      "Identify & Define",
      "Plan & Prepare",
      "Schedule & Align"
    ],
    q2Options: [
      "Step 3: Plan & Prepare",
      "Step 5: Permit & Authorize",
      "Step 6: Execute & Monitor",
      "Step 7: Close & Document"
    ],
    solutionExplanation: "The correct 8-step SCL Maintenance Execution Cycle is: 1. Identify & Define, 2. Approve & Prioritize, 3. Plan & Prepare, 4. Schedule & Align, 5. Permit & Authorize, 6. Execute & Monitor, 7. Close & Document, 8. Review & Improve.",
    complianceExplanation: "This sequence represents the standard SCL Maintenance Execution workflow, showing compliance by requiring permit authorization before physical execution and final close-out documentation before review."
  }
};

// Format submitted answers for network logging
function formatSubmittedAnswers(roundNum, submittedAnswers, puzzleMode) {
  if (puzzleMode === 'objective') {
    const pz = puzzles[roundNum];
    const q1Idx = parseInt(submittedAnswers.q1, 10);
    const q2Idx = parseInt(submittedAnswers.q2, 10);
    const q1Text = pz && pz.q1Options && pz.q1Options[q1Idx] !== undefined ? pz.q1Options[q1Idx] : (submittedAnswers.q1 || 'None selected');
    const q2Text = pz && pz.q2Options && pz.q2Options[q2Idx] !== undefined ? pz.q2Options[q2Idx] : (submittedAnswers.q2 || 'None selected');
    return `Q1: "${q1Text}", Q2: "${q2Text}"`;
  } else {
    if (roundNum === 10) {
      const seq = submittedAnswers.sequence || [];
      return `Sequence: [${seq.join(' > ')}]`;
    }
    const parts = [];
    for (let key in submittedAnswers) {
      if (submittedAnswers.hasOwnProperty(key)) {
        const niceKey = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase());
        parts.push(`${niceKey}: "${submittedAnswers[key]}"`);
      }
    }
    return parts.join(', ');
  }
}

// Initialize round states for all teams
function initRoundStates(roundNum) {
  for (let teamId in gameState.teams) {
    gameState.teams[teamId].roundStatus[roundNum] = {
      solved: false,
      attempts: 0,
      timeTaken: null,
      pointsEarned: 0,
      incorrectPenalties: 0
    };
    gameState.teams[teamId].draftAnswers = {};
  }
  gameState.roundSolveCount = 0;
}

// Broadcast game state helper
function broadcastGameState() {
  io.emit('game-state-update', gameState);
}

// Socket logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Send initial game state on connect
  socket.emit('init-state', gameState);

  // Handle player/facilitator registration
  socket.on('register', ({ name, role, teamId }) => {
    if (role === 'facilitator') {
      gameState.players[socket.id] = { name: 'Facilitator', roleId: 'facilitator', teamId: 'admin' };
      socket.join('facilitators');
      console.log(`Facilitator registered: ${socket.id}`);
      socket.emit('register-success', { role: 'facilitator' });
      broadcastGameState();
      return;
    }

    // Role selection conflict check
    const isRoleTaken = Object.values(gameState.players).some(
      (p) => p.teamId === teamId && p.roleId === role
    );

    if (isRoleTaken) {
      socket.emit('register-error', `The role of ${getRoleName(role)} is already taken on ${getTeamName(teamId)}. Please choose a different role.`);
      return;
    }

    // Register player
    gameState.players[socket.id] = { name, roleId: role, teamId };
    socket.join(teamId);
    console.log(`Player registered: ${name} as ${role} on team ${teamId}`);
    socket.emit('register-success', { name, role, teamId });
    broadcastGameState();
  });

  // Handle shared team notes sync
  socket.on('update-notes', (notesText) => {
    const player = gameState.players[socket.id];
    if (player && player.teamId !== 'admin') {
      gameState.teams[player.teamId].notes = notesText;
      // Broadcast to other team members
      socket.to(player.teamId).emit('notes-updated', notesText);
    }
  });

  // Handle draft answers sync
  socket.on('update-draft-answers', (drafts) => {
    const player = gameState.players[socket.id];
    if (player && player.teamId !== 'admin') {
      gameState.teams[player.teamId].draftAnswers = drafts;
      // Sync with other teammates
      socket.to(player.teamId).emit('draft-answers-updated', drafts);
    }
  });

  // Handle answer submission
  socket.on('submit-answer', (submittedAnswers) => {
    const player = gameState.players[socket.id];
    if (!player || player.teamId === 'admin') return;

    const teamId = player.teamId;
    const team = gameState.teams[teamId];
    const roundNum = gameState.currentRound;
    const roundStatus = team.roundStatus[roundNum] || { solved: false, attempts: 0, pointsEarned: 0, incorrectPenalties: 0 };

    // Strict Team Leader (FA) verification
    if (player.roleId !== 'FA') {
      socket.emit('submit-response', { success: false, message: "Only the Asset Manager (Team Leader) can submit the final answer." });
      return;
    }

    if (roundStatus.solved) {
      socket.emit('submit-response', { success: false, message: "Your team has already solved this round!" });
      return;
    }

    if (!gameState.timerActive) {
      socket.emit('submit-response', { success: false, message: "The round timer is not active. Submissions are locked." });
      return;
    }

    // Format the answer choice details for network logging
    const answerSummary = formatSubmittedAnswers(roundNum, submittedAnswers, gameState.puzzleMode);

    // Verify answers
    let isCorrect = false;
    let partialSuccess = false;
    let questionsCorrectCount = 0;

    if (gameState.puzzleMode === 'objective') {
      const pz = puzzles[roundNum];
      const ansQ1 = String(submittedAnswers.q1 || '').trim();
      const ansQ2 = String(submittedAnswers.q2 || '').trim();
      
      const q1Correct = ansQ1 === pz.correctQ1;
      const q2Correct = ansQ2 === pz.correctQ2;

      if (q1Correct) questionsCorrectCount++;
      if (q2Correct) questionsCorrectCount++;

      if (questionsCorrectCount === 2) {
        isCorrect = true;
      } else if (questionsCorrectCount === 1) {
        partialSuccess = true;
        isCorrect = true; // Solved with partial points
      }
    } else {
      isCorrect = puzzles[roundNum].verify(submittedAnswers);
    }

    roundStatus.attempts += 1;

    if (isCorrect) {
      roundStatus.solved = true;
      roundStatus.timeTaken = gameState.timer;
      roundStatus.submittedAnswers = submittedAnswers; // Store team's final correct submission
      gameState.roundSolveCount += 1;

      // Base points calculation: 1st: 100, 2nd: 80, 3rd: 60, 4th: 40
      let basePoints = 100 - (gameState.roundSolveCount - 1) * 20;
      if (basePoints < 40) basePoints = 40;

      // Speed bonus calculation:
      let speedBonus = 0;
      if (gameState.timer < 180) { // under 3 mins
        speedBonus = 30;
      } else if (gameState.timer < 360) { // under 6 mins
        speedBonus = 20;
      } else if (gameState.timer < 600) { // under 10 mins
        speedBonus = 10;
      }

      // Incorrect attempts penalty: -10 points per incorrect attempt
      const attemptPenalty = (roundStatus.attempts - 1) * 10;
      roundStatus.incorrectPenalties = attemptPenalty;

      // Final round points (minimum 10 points for completing it)
      let finalPoints = basePoints + speedBonus - attemptPenalty;
      let partialMultiplier = 1.0;
      
      if (gameState.puzzleMode === 'objective' && partialSuccess) {
        partialMultiplier = 0.5;
        finalPoints = Math.round(finalPoints * 0.5);
      }

      if (finalPoints < 10) finalPoints = 10;

      roundStatus.basePoints = basePoints;
      roundStatus.speedBonus = speedBonus;
      roundStatus.partialMultiplier = partialMultiplier;
      roundStatus.pointsEarned = finalPoints;
      team.score += finalPoints;

      // Save updated roundStatus back
      team.roundStatus[roundNum] = roundStatus;

      // Emit feedback to player and team
      io.to(teamId).emit('round-solved', {
        pointsEarned: finalPoints,
        timeTaken: gameState.timer,
        attempts: roundStatus.attempts,
        score: team.score,
        questionsCorrectCount: questionsCorrectCount,
        partial: partialSuccess,
        submittedAnswers: submittedAnswers
      });

      // Notify facilitators
      const solvedMsg = gameState.puzzleMode === 'objective' && partialSuccess 
        ? `solved Round ${roundNum} with 1 of 2 questions correct`
        : `solved Round ${roundNum} (100% correct)`;

      io.to('facilitators').emit('facilitator-log', `${team.name} ${solvedMsg} in ${formatTime(gameState.timer)} (Attempts: ${roundStatus.attempts}) with choices [${answerSummary}]. Points: +${finalPoints}`);

      // Check if all teams have solved
      let allTeamsSolved = Object.values(gameState.teams).every(t => t.roundStatus[roundNum]?.solved);
      if (allTeamsSolved) {
        handleRoundEnd(roundNum);
        io.to('facilitators').emit('facilitator-log', `All teams have completed Round ${roundNum}!`);
      }

      broadcastGameState();
    } else {
      // Save updated status
      team.roundStatus[roundNum] = roundStatus;

      socket.emit('submit-response', { success: false, message: `Incorrect answer. Attempt #${roundStatus.attempts} registered. (-10 pts penalty)` });
      // Notify teammates of failure
      socket.to(teamId).emit('teammate-submit-failed', { attempts: roundStatus.attempts });
      // Log for facilitator
      io.to('facilitators').emit('facilitator-log', `${team.name} submitted an incorrect answer for Round ${roundNum} (Attempt #${roundStatus.attempts}) with choices [${answerSummary}].`);

      broadcastGameState();
    }
  });

  // Facilitator controls: Set Puzzle Mode
  socket.on('set-puzzle-mode', (mode) => {
    if (isAdmin(socket.id)) {
      const canChange = (gameState.status === 'lobby' || gameState.status === 'end_round' || (gameState.status === 'active' && gameState.timer === 0 && !gameState.timerActive));
      if (canChange && (mode === 'standard' || mode === 'objective')) {
        gameState.puzzleMode = mode;
        console.log(`Puzzle Mode set to ${mode} by facilitator`);
        io.to('facilitators').emit('facilitator-log', `Puzzle Mode set to ${mode === 'standard' ? 'Standard' : 'Objective'} Mode`);
        broadcastGameState();
      }
    }
  });

  // Facilitator controls: Start Game
  socket.on('start-game', () => {
    if (isAdmin(socket.id)) {
      gameState.status = 'active';
      gameState.currentRound = 1;
      gameState.timer = 0;
      gameState.timerActive = false;
      gameState.roundEndExplanation = '';
      gameState.roundEndCompliance = '';
      // Reset scores and notes
      for (let teamId in gameState.teams) {
        gameState.teams[teamId].score = 0;
        gameState.teams[teamId].notes = '';
        gameState.teams[teamId].draftAnswers = {};
        gameState.teams[teamId].roundStatus = {};
      }
      initRoundStates(1);
      stopTimer();
      console.log("Game started by facilitator");
      io.to('facilitators').emit('facilitator-log', "Game initialized. Round 1 lobby ready.");
      broadcastGameState();
    }
  });

  // Facilitator controls: Start Round Timer
  socket.on('start-round-timer', () => {
    if (isAdmin(socket.id) && !gameState.timerActive && gameState.status === 'active' && !gameState.startingCountdown) {
      if (gameState.timer === 0) {
        // Enter 5-second countdown phase
        gameState.startingCountdown = true;
        broadcastGameState();

        if (countdownTimeout) clearTimeout(countdownTimeout);
        countdownTimeout = setTimeout(() => {
          countdownTimeout = null;
          gameState.startingCountdown = false;
          gameState.timerActive = true;
          timerInterval = setInterval(() => {
            gameState.timer += 1;
            io.emit('timer-tick', gameState.timer);
          }, 1000);
          io.to('facilitators').emit('facilitator-log', `Timer started for Round ${gameState.currentRound}`);
          broadcastGameState();
        }, 5000);
      } else {
        // Resume timer immediately (no countdown)
        gameState.timerActive = true;
        timerInterval = setInterval(() => {
          gameState.timer += 1;
          io.emit('timer-tick', gameState.timer);
        }, 1000);
        io.to('facilitators').emit('facilitator-log', `Timer resumed for Round ${gameState.currentRound}`);
        broadcastGameState();
      }
    }
  });

  // Facilitator controls: Pause Round Timer
  socket.on('pause-round-timer', () => {
    if (isAdmin(socket.id) && (gameState.timerActive || gameState.startingCountdown)) {
      stopTimer();
      io.to('facilitators').emit('facilitator-log', `Timer paused for Round ${gameState.currentRound}`);
      broadcastGameState();
    }
  });

  // Facilitator controls: End Round
  socket.on('end-round', () => {
    if (isAdmin(socket.id) && gameState.status === 'active') {
      handleRoundEnd(gameState.currentRound);
      io.to('facilitators').emit('facilitator-log', `Round ${gameState.currentRound} has been closed by the facilitator.`);
      broadcastGameState();
    }
  });

  // Facilitator controls: Next Round
  socket.on('next-round', () => {
    if (isAdmin(socket.id) && gameState.status === 'end_round') {
      const lastRound = gameState.currentRound;
      const finalRound = gameState.finalRound || 9;
      
      if (lastRound < finalRound) {
        gameState.currentRound += 1;
        gameState.status = 'active';
        gameState.timer = 0;
        gameState.timerActive = false;
        gameState.roundEndExplanation = '';
        gameState.roundEndCompliance = '';
        initRoundStates(gameState.currentRound);
        io.to('facilitators').emit('facilitator-log', `Advanced to Round ${gameState.currentRound}`);
      } else if (lastRound === finalRound) {
        // Evaluate tie-breaker condition
        const scores = Object.values(gameState.teams).map(t => t.score);
        const maxScore = Math.max(...scores);
        const winners = Object.values(gameState.teams).filter(t => t.score === maxScore);

        if (winners.length > 1) {
          // Trigger tie-breaker! (Round 10)
          gameState.currentRound = 10;
          gameState.status = 'active';
          gameState.timer = 0;
          gameState.timerActive = false;
          gameState.roundEndExplanation = '';
          gameState.roundEndCompliance = '';
          initRoundStates(10);
          io.to('facilitators').emit('facilitator-log', `Tie detected between ${winners.map(w => w.name).join(' and ')}! Loading Tie-Breaker Round.`);
        } else {
          // Game Over - clear winner
          gameState.status = 'game_over';
          io.to('facilitators').emit('facilitator-log', `Game over! Winner is ${winners[0].name} with ${winners[0].score} points!`);
        }
      } else {
        // If tie-breaker (Round 10) finished, check winner of tie-breaker
        // In tie-breaker, the first team to solve wins the game immediately
        const tieBreakerSolvers = Object.entries(gameState.teams).filter(([id, t]) => t.roundStatus[10]?.solved);
        if (tieBreakerSolvers.length > 0) {
          // First solver is winner
          const sortedSolvers = tieBreakerSolvers.sort((a, b) => (a[1].roundStatus[10].timeTaken || 9999) - (b[1].roundStatus[10].timeTaken || 9999));
          const winnerTeam = sortedSolvers[0][1];
          gameState.status = 'game_over';
          io.to('facilitators').emit('facilitator-log', `Tie-breaker complete! Winner is ${winnerTeam.name}!`);
        } else {
          // Force closed tie breaker without answers
          gameState.status = 'game_over';
        }
      }
      broadcastGameState();
    }
  });

  // Facilitator controls: Set Final Round
  socket.on('set-final-round', (val) => {
    if (isAdmin(socket.id) && gameState.status === 'lobby') {
      const fr = parseInt(val, 10);
      if (fr >= 1 && fr <= 9) {
        gameState.finalRound = fr;
        console.log(`Final Round set to ${fr} by facilitator`);
        io.to('facilitators').emit('facilitator-log', `Final Round set to Round ${fr}`);
        broadcastGameState();
      }
    }
  });

  // Facilitator controls: Reset Game
  socket.on('reset-game', () => {
    if (isAdmin(socket.id)) {
      stopTimer();
      gameState.status = 'lobby';
      gameState.currentRound = 1;
      gameState.timer = 0;
      gameState.timerActive = false;
      gameState.roundEndExplanation = '';
      gameState.roundEndCompliance = '';
      for (let teamId in gameState.teams) {
        gameState.teams[teamId].score = 0;
        gameState.teams[teamId].notes = '';
        gameState.teams[teamId].draftAnswers = {};
        gameState.teams[teamId].roundStatus = {};
      }
      gameState.roundSolveCount = 0;
      console.log("Game reset by facilitator");
      io.emit('game-reset');
      broadcastGameState();
    }
  });

  // Facilitator controls: Adjust Scores
  socket.on('adjust-score', ({ teamId, adjustment }) => {
    if (isAdmin(socket.id)) {
      if (gameState.teams[teamId]) {
        const val = parseInt(adjustment, 10);
        gameState.teams[teamId].score += val;
        io.to('facilitators').emit('facilitator-log', `Facilitator manually adjusted ${gameState.teams[teamId].name} score by ${val > 0 ? '+' : ''}${val}.`);
        broadcastGameState();
      }
    }
  });

  // Facilitator controls: Request solution explanation (Securely fetched)
  socket.on('request-solution-explanation', () => {
    if (isAdmin(socket.id)) {
      socket.emit('solution-explanation-data', {
        round: gameState.currentRound,
        explanation: puzzles[gameState.currentRound]?.solutionExplanation || "No explanation available."
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const player = gameState.players[socket.id];
    if (player) {
      delete gameState.players[socket.id];
      console.log(`Player ${player.name} left. Room updated.`);
      broadcastGameState();
    }
  });
});

// Helper functions
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (countdownTimeout) {
    clearTimeout(countdownTimeout);
    countdownTimeout = null;
  }
  gameState.startingCountdown = false;
  gameState.timerActive = false;
}

function handleRoundEnd(roundNum) {
  stopTimer();
  gameState.status = 'end_round';
  gameState.roundEndExplanation = puzzles[roundNum]?.solutionExplanation || "No explanation available.";
  gameState.roundEndCompliance = puzzles[roundNum]?.complianceExplanation || "No compliance details available.";
  
  // Fill missing details for teams that did not solve
  for (let teamId in gameState.teams) {
    const team = gameState.teams[teamId];
    if (!team.roundStatus[roundNum]) {
      team.roundStatus[roundNum] = {
        solved: false,
        attempts: 0,
        timeTaken: null,
        pointsEarned: 0,
        incorrectPenalties: 0,
        basePoints: 0,
        speedBonus: 0,
        partialMultiplier: 1.0,
        submittedAnswers: null
      };
    } else {
      const status = team.roundStatus[roundNum];
      if (!status.solved) {
        status.solved = false;
        status.pointsEarned = 0;
        status.basePoints = 0;
        status.speedBonus = 0;
        status.incorrectPenalties = status.attempts * 10;
        status.partialMultiplier = 1.0;
        status.submittedAnswers = null;
      }
    }
  }
}

function isAdmin(socketId) {
  const player = gameState.players[socketId];
  return player && player.roleId === 'facilitator';
}

function getRoleName(roleId) {
  const roles = {
    SE: "Structural & Integrity Engineer",
    PE: "Process & Production Engineer",
    HSE: "HSE & Regulatory Compliance Officer",
    LSC: "Logistics & Supply Chain Manager",
    FA: "Financial Analyst / Asset Manager (Team Leader)"
  };
  return roles[roleId] || roleId;
}

function getTeamName(teamId) {
  const teams = {
    alpha: "Team Alpha",
    beta: "Team Beta",
    gamma: "Team Gamma",
    delta: "Team Delta"
  };
  return teams[teamId] || teamId;
}

function formatTime(sec) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Start server
server.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`Offshore Asset Management Game running on port ${PORT}`);
  console.log(`Access the game locally at http://localhost:${PORT}`);
  console.log(`========================================================`);
});
