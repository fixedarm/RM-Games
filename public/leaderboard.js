const socket = io();

// UI elements
const monitorGameStatus = document.getElementById('monitor-game-status');
const monitorCurrentRound = document.getElementById('monitor-current-round');
const monitorTimer = document.getElementById('monitor-timer');
const monitorMatrixBody = document.getElementById('monitor-matrix-body');

// Setup socket listeners
socket.on('init-state', (state) => {
  updateMonitor(state);
});

socket.on('game-state-update', (state) => {
  updateMonitor(state);
});

socket.on('timer-tick', (sec) => {
  if (monitorTimer) {
    monitorTimer.innerText = formatTime(sec);
  }
});

socket.on('game-reset', () => {
  // Simply reload if reset
  window.location.reload();
});

function updateMonitor(state) {
  if (!state) return;

  // 1. Header status
  if (monitorGameStatus) {
    monitorGameStatus.innerText = state.status.toUpperCase();
    
    // Set badge color based on status
    if (state.status === 'lobby') {
      monitorGameStatus.className = 'badge badge-warning';
    } else if (state.status === 'active') {
      monitorGameStatus.className = 'badge badge-success';
    } else if (state.status === 'end_round') {
      monitorGameStatus.className = 'badge badge-warning';
    } else if (state.status === 'game_over') {
      monitorGameStatus.className = 'badge badge-success';
    }
  }
  
  if (monitorCurrentRound) {
    if (state.status === 'lobby') {
      monitorCurrentRound.innerText = 'LOBBY';
      monitorCurrentRound.className = 'badge badge-warning';
    } else {
      monitorCurrentRound.innerText = state.currentRound === 6 ? "TIE-BREAKER" : `ROUND ${state.currentRound}`;
      monitorCurrentRound.className = 'badge badge-success';
    }
  }

  // 2. Leaderboard scores dynamically sorted descending
  const leaderboardContainer = document.getElementById('monitor-leaderboard-bars');
  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = '';
    const maxScore = Math.max(...Object.values(state.teams).map(t => t.score), 1);
    const sortedTeams = Object.values(state.teams).sort((a, b) => b.score - a.score);
    const teamGradients = {
      alpha: 'linear-gradient(90deg, hsl(190, 85%, 45%), hsl(190, 85%, 60%))',
      beta: 'linear-gradient(90deg, hsl(280, 80%, 50%), hsl(280, 80%, 65%))',
      gamma: 'linear-gradient(90deg, hsl(30, 95%, 45%), hsl(30, 95%, 60%))',
      delta: 'linear-gradient(90deg, hsl(120, 70%, 40%), hsl(120, 70%, 55%))'
    };

    sortedTeams.forEach(team => {
      const percentage = Math.max((team.score / maxScore) * 100, 5);
      const row = document.createElement('div');
      row.className = 'leader-bar-row';
      row.innerHTML = `
        <div class="leader-team-name">${team.name}</div>
        <div class="leader-bar-wrapper">
          <div id="bar-${team.id}" class="leader-bar" style="width: ${percentage}%; background: ${teamGradients[team.id] || 'var(--primary)'};"></div>
        </div>
        <div id="score-${team.id}" class="leader-score">${team.score} pts</div>
      `;
      leaderboardContainer.appendChild(row);
    });
  }

  // 3. Crew progress matrix
  if (monitorMatrixBody) {
    monitorMatrixBody.innerHTML = '';
    for (let teamId in state.teams) {
      const team = state.teams[teamId];
      const status = team.roundStatus[state.currentRound] || { solved: false, attempts: 0, timeTaken: null, pointsEarned: 0 };
      
      const tr = document.createElement('tr');
      if (status.solved) tr.className = 'matrix-row-solved';
      
      // Status label text
      let statusText = 'SOLVING';
      let statusClass = 'badge-warning';
      if (status.solved) {
        statusText = 'SOLVED';
        statusClass = 'badge-success';
      } else if (state.status === 'lobby') {
        statusText = 'AWAITING START';
        statusClass = 'badge-warning';
      } else if (state.status === 'game_over') {
        statusText = 'FINISHED';
        statusClass = 'badge-success';
      }
      
      tr.innerHTML = `
        <td><strong>${team.name}</strong></td>
        <td>
          <span class="badge ${statusClass}">
            ${statusText}
          </span>
        </td>
        <td>${status.solved && status.timeTaken ? formatTime(status.timeTaken) : '--:--'}</td>
        <td>${status.attempts}</td>
        <td>+${status.pointsEarned} pts</td>
      `;
      monitorMatrixBody.appendChild(tr);
    }
  }

  // 4. Connected Crew terminals list
  const teams = { alpha: [], beta: [], gamma: [], delta: [] };
  Object.values(state.players).forEach(p => {
    if (teams[p.teamId]) {
      teams[p.teamId].push(p);
    }
  });

  for (let teamId in teams) {
    const listEl = document.getElementById(`monitor-crew-${teamId}`);
    if (listEl) {
      listEl.innerHTML = '';
      if (teams[teamId].length === 0) {
        listEl.innerHTML = `<li style="opacity:0.5; font-style:italic;">No uplink established</li>`;
      } else {
        teams[teamId].forEach(p => {
          const isLeaderRow = p.roleId === 'FA';
          const li = document.createElement('li');
          if (isLeaderRow) li.className = 'leader-row';
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="crew-role-lbl">${p.roleId}</span>
          `;
          listEl.appendChild(li);
        });
      }
    }
  }
}

function formatTime(sec) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
