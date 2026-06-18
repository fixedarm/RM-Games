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
  currentRound: 1, // 1 to 5, 6 is tie-breaker
  timer: 0,
  timerActive: false,
  puzzleMode: 'standard', // 'standard' or 'objective'
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
    complianceExplanation: "This aligns with the Shell Performance Framework (Wrench Time Optimization) by prioritizing the elimination of administrative bottlenecks (Permit to Work delay) to maximize direct tool time."
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
    complianceExplanation: "This complies with EN 15341-2019 (Workforce Scheduling Efficiency) and IAM SSG 1517 (Backlog Management) by demonstrating that structured campaign scheduling yields greater labor optimization than reactive maintenance."
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
    complianceExplanation: "This satisfies Shell HSE Compliance Standards by integrating mandatory safety briefs and clean-ups into the vendor work window, preventing unauthorized execution outside vendor availability."
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
    complianceExplanation: "This illustrates the Shell Performance Framework's preparation gate checklist, where planning readiness (PQI) directly correlates to workforce execution quality."
  },
  5: {
    title: "Round 5: Wrench Time Measurement & Workforce Productivity",
    verify: (answers) => {
      const productivity = (answers.productivity || '').trim().toLowerCase();
      const wrenchTime = parseInt(answers.wrenchTime, 10);
      const laborValue = parseInt(String(answers.laborValue).replace(/[\$,]/g, ''), 10);
      return productivity === 'high' && wrenchTime === 50 && laborValue === 2000;
    },
    correctQ1: '0',
    correctQ2: '1',
    q1Options: [
      "High Productivity",
      "Medium Productivity",
      "Low Productivity"
    ],
    q2Options: [
      "$1,000",
      "$2,000",
      "$3,000",
      "$5,000"
    ],
    solutionExplanation: "Wrench Time is 50% (50 direct work observations / 100 total observations), placing the crew in the High productivity category (>=50%). The productive labor value gained is $2,000 (calculated as [50% - 30% baseline] = 20% gain * $10,000 weekly labor cost).",
    complianceExplanation: "This is supported by EN 15341 (O8 Workforce Productivity Indicator), utilizing systematic work sampling observations to classify and value productive labor gains against historical baselines."
  },
  6: {
    title: "Tie-Breaker Round: Shell Maintenance Execution Cycle",
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
    solutionExplanation: "The correct 8-step Shell Maintenance Execution Cycle is: 1. Identify & Define, 2. Approve & Prioritize, 3. Plan & Prepare, 4. Schedule & Align, 5. Permit & Authorize, 6. Execute & Monitor, 7. Close & Document, 8. Review & Improve.",
    complianceExplanation: "This sequence represents the standard Shell Maintenance Execution Cycle (ME) workflow, showing compliance by requiring authorization before execution and closing before post-job review."
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
    if (roundNum === 6) {
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
    if (isAdmin(socket.id) && gameState.status === 'lobby') {
      if (mode === 'standard' || mode === 'objective') {
        gameState.puzzleMode = mode;
        console.log(`Puzzle Mode set to ${mode} by facilitator`);
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
    if (isAdmin(socket.id) && !gameState.timerActive && gameState.status === 'active') {
      gameState.timerActive = true;
      timerInterval = setInterval(() => {
        gameState.timer += 1;
        io.emit('timer-tick', gameState.timer);
      }, 1000);
      io.to('facilitators').emit('facilitator-log', `Timer started for Round ${gameState.currentRound}`);
      broadcastGameState();
    }
  });

  // Facilitator controls: Pause Round Timer
  socket.on('pause-round-timer', () => {
    if (isAdmin(socket.id) && gameState.timerActive) {
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
      
      // Determine next round (Round 1-5 default, tie-breaker check)
      if (lastRound < 5) {
        gameState.currentRound += 1;
        gameState.status = 'active';
        gameState.timer = 0;
        gameState.timerActive = false;
        gameState.roundEndExplanation = '';
        gameState.roundEndCompliance = '';
        initRoundStates(gameState.currentRound);
        io.to('facilitators').emit('facilitator-log', `Advanced to Round ${gameState.currentRound}`);
      } else if (lastRound === 5) {
        // Evaluate tie-breaker condition
        const scores = Object.values(gameState.teams).map(t => t.score);
        const maxScore = Math.max(...scores);
        const winners = Object.values(gameState.teams).filter(t => t.score === maxScore);

        if (winners.length > 1) {
          // Trigger tie-breaker!
          gameState.currentRound = 6;
          gameState.status = 'active';
          gameState.timer = 0;
          gameState.timerActive = false;
          gameState.roundEndExplanation = '';
          gameState.roundEndCompliance = '';
          initRoundStates(6);
          io.to('facilitators').emit('facilitator-log', `Tie detected between ${winners.map(w => w.name).join(' and ')}! Loading Tie-Breaker Round.`);
        } else {
          // Game Over - clear winner
          gameState.status = 'game_over';
          io.to('facilitators').emit('facilitator-log', `Game over! Winner is ${winners[0].name} with ${winners[0].score} points!`);
        }
      } else {
        // If tie-breaker finished, check winner of tie-breaker
        // In tie-breaker, the first team to solve wins the game immediately
        const tieBreakerSolvers = Object.entries(gameState.teams).filter(([id, t]) => t.roundStatus[6]?.solved);
        if (tieBreakerSolvers.length > 0) {
          // First solver is winner
          const sortedSolvers = tieBreakerSolvers.sort((a, b) => (a[1].roundStatus[6].timeTaken || 9999) - (b[1].roundStatus[6].timeTaken || 9999));
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
