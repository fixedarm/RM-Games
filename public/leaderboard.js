const socket = io();

// UI elements
const monitorGameStatus = document.getElementById('monitor-game-status');
const monitorCurrentRound = document.getElementById('monitor-current-round');
const monitorTimer = document.getElementById('monitor-timer');
const monitorMatrixBody = document.getElementById('monitor-matrix-body');

// Theme initialization
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('game-theme') || 'dark';
  applyTheme(savedTheme);
});

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

  // Sync timer display immediately
  if (monitorTimer) {
    monitorTimer.innerText = formatTime(state.timer || 0);
  }

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
      monitorCurrentRound.innerText = state.currentRound === 10 ? "TIE-BREAKER" : `ROUND ${state.currentRound}`;
      monitorCurrentRound.className = 'badge badge-success';
    }
  }

  // 2. Leaderboard scores dynamically sorted descending
  const leaderboardContainer = document.getElementById('monitor-leaderboard-bars');
  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = '';
    const maxScore = Math.max(...Object.values(state.teams).map(t => t.score), 1);
    const sortedTeams = Object.values(state.teams).sort((a, b) => b.score - a.score);
    const displayMax = Math.max(maxScore, 1000);

    const teamIcons = {
      alpha: `<svg class="facility-icon" viewBox="0 0 40 40"><path d="M6 36 L14 18 L26 18 L34 36 M15 18 L15 6 L25 6 L25 18 M12 24 L28 24 M8 31 L32 31 M10 36 L18 18 M30 36 L22 18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="6" r="2" fill="currentColor"/></svg>`,
      beta: `<svg class="facility-icon" viewBox="0 0 40 40"><path d="M4 25 L6 14 L34 14 L36 25 L32 30 L8 30 Z" stroke="currentColor" stroke-width="2" fill="currentColor"/><rect x="14" y="6" width="4" height="8" fill="currentColor"/><rect x="22" y="4" width="3" height="10" fill="currentColor"/><path d="M8 30 Q20 33 32 30" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
      gamma: `<svg class="facility-icon" viewBox="0 0 40 40"><rect x="8" y="6" width="10" height="30" rx="1.5" fill="currentColor"/><rect x="22" y="14" width="10" height="22" rx="1" fill="currentColor"/><path d="M13 14 L27 22 M13 22 L27 30 M18 6 L18 36 M22 14 L22 36" stroke="currentColor" stroke-width="1.5"/><path d="M13 6 Q13 3 15 3 Q17 3 17 6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
      delta: `<svg class="facility-icon" viewBox="0 0 40 40"><path d="M4 22 L10 12 L30 12 L36 22 L33 29 L7 29 Z" fill="currentColor" stroke="currentColor" stroke-width="1"/><circle cx="20" cy="18" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 18 L24 18 M20 14 L20 22" stroke="currentColor" stroke-width="2"/><rect x="6" y="29" width="28" height="3" fill="currentColor"/></svg>`
    };

    const tanksWrapper = document.createElement('div');
    tanksWrapper.className = 'leaderboard-tanks';

    sortedTeams.forEach(team => {
      const percentage = Math.min(Math.max((team.score / displayMax) * 100, 5), 100);
      const tankHtml = `
        <div class="tank-container tank-${team.id}">
          <div class="tank-label">${team.name}</div>
          <div class="glass-tank">
            <div class="tank-scale">
              <span>${displayMax}</span>
              <span>${Math.round(displayMax * 0.75)}</span>
              <span>${Math.round(displayMax * 0.5)}</span>
              <span>${Math.round(displayMax * 0.25)}</span>
              <span>0</span>
            </div>
            <div class="tank-liquid" style="height: ${percentage}%;">
              <div class="liquid-wave"></div>
              <div class="bubble b1"></div>
              <div class="bubble b2"></div>
              <div class="bubble b3"></div>
            </div>
            <div class="tank-float-badge" style="bottom: ${percentage}%;">
              <span class="badge-val">${team.score}</span>
            </div>
          </div>
          <div class="tank-base">
            ${teamIcons[team.id] || ''}
            <div class="base-led-score">${team.score}</div>
          </div>
        </div>
      `;
      tanksWrapper.innerHTML += tankHtml;
    });
    
    leaderboardContainer.appendChild(tanksWrapper);
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

  // Show victory announcement popup when game ends
  if (state.status === 'game_over') {
    showWinnerAnnouncement(state);
  } else {
    // Hide winner modal if game reset or not game over
    const modal = document.getElementById('winner-modal');
    if (modal) modal.classList.add('hidden');
    stopFireworks();
  }
}

function formatTime(sec) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Theme Management Functions
function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
    const icon = document.querySelector('#theme-toggle-btn .theme-icon');
    if (icon) icon.innerHTML = '&#x263E;'; // Moon symbol
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
    const icon = document.querySelector('#theme-toggle-btn .theme-icon');
    if (icon) icon.innerHTML = '&#x2600;'; // Sun symbol
  }
}

window.toggleTheme = function() {
  const currentTheme = localStorage.getItem('game-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.classList.add('clicked');
    setTimeout(() => {
      btn.classList.remove('clicked');
    }, 500);
  }

  const overlay = document.getElementById('theme-transition-overlay');
  if (overlay) {
    overlay.style.backgroundColor = newTheme === 'light' ? 'hsl(210, 20%, 92%)' : 'hsl(222, 28%, 7%)';
    overlay.classList.add('animating');
    document.body.classList.add('theme-toggling');
    
    setTimeout(() => {
      localStorage.setItem('game-theme', newTheme);
      applyTheme(newTheme);
    }, 350);
    
    setTimeout(() => {
      overlay.classList.remove('animating');
      document.body.classList.remove('theme-toggling');
    }, 850);
  } else {
    localStorage.setItem('game-theme', newTheme);
    applyTheme(newTheme);
  }
};

// Immediately execute to prevent flash of wrong theme before DOM load
(function() {
  const savedTheme = localStorage.getItem('game-theme') || 'dark';
  document.body.classList.add(savedTheme === 'light' ? 'theme-light' : 'theme-dark');
  document.body.classList.remove(savedTheme === 'light' ? 'theme-dark' : 'theme-light');
})();

// Fireworks animation system
let fireworksAnimationId = null;
function startFireworks() {
  const canvas = document.getElementById('fireworks-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const particles = [];
  const rockets = [];
  
  class Rocket {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = canvas.height;
      this.tx = Math.random() * canvas.width;
      this.ty = Math.random() * (canvas.height * 0.5);
      this.speed = 4 + Math.random() * 4;
      this.angle = Math.atan2(this.ty - this.y, this.tx - this.x);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.color = `hsl(${Math.random() * 360}, 100%, 65%)`;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      const dist = Math.hypot(this.tx - this.x, this.ty - this.y);
      if (dist < 10 || this.y < this.ty) {
        explode(this.x, this.y, this.color);
        return false;
      }
      return true;
    }
    draw() {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.vx = (Math.random() - 0.5) * 8;
      this.vy = (Math.random() - 0.5) * 8;
      this.alpha = 1;
      this.gravity = 0.08;
      this.decay = 0.012 + Math.random() * 0.015;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.alpha -= this.decay;
      return this.alpha > 0;
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  
  function explode(x, y, color) {
    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(x, y, color));
    }
  }
  
  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (Math.random() < 0.06 && rockets.length < 5) {
      rockets.push(new Rocket());
    }
    
    for (let i = rockets.length - 1; i >= 0; i--) {
      if (!rockets[i].update()) {
        rockets.splice(i, 1);
      } else {
        rockets[i].draw();
      }
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
      if (!particles[i].update()) {
        particles.splice(i, 1);
      } else {
        particles[i].draw();
      }
    }
    
    fireworksAnimationId = requestAnimationFrame(animate);
  }
  
  animate();
  
  const resizeHandler = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);
  canvas._resizeHandler = resizeHandler;
}

function stopFireworks() {
  if (fireworksAnimationId) {
    cancelAnimationFrame(fireworksAnimationId);
    fireworksAnimationId = null;
  }
  const canvas = document.getElementById('fireworks-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvas._resizeHandler) {
      window.removeEventListener('resize', canvas._resizeHandler);
      delete canvas._resizeHandler;
    }
  }
}

// Show victory screen
function showWinnerAnnouncement(state) {
  const modal = document.getElementById('winner-modal');
  if (!modal) return;

  const sortedTeams = Object.values(state.teams).sort((a, b) => b.score - a.score);
  const winnerTeam = sortedTeams[0];
  if (!winnerTeam) return;

  const winnerPlayers = Object.values(state.players)
    .filter(p => p.teamId === winnerTeam.id)
    .map(p => `${p.name} (${getRoleName(p.roleId)})`);

  const teamTitleEl = document.getElementById('winner-team-title');
  if (teamTitleEl) {
    teamTitleEl.innerText = winnerTeam.name.toUpperCase();
  }
  
  const namesEl = document.getElementById('winner-crew-names');
  if (namesEl) {
    namesEl.innerHTML = winnerPlayers.length > 0 ? winnerPlayers.join(', ') : '<span style="font-style: italic; opacity: 0.6;">(No operators registered on this team)</span>';
  }

  modal.classList.remove('hidden');
  startFireworks();
}

window.closeWinnerModal = function() {
  const modal = document.getElementById('winner-modal');
  if (modal) modal.classList.add('hidden');
  stopFireworks();
};

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

