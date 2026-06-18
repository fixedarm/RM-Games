const socket = io();

// Local player state
let myName = '';
let myRole = '';
let myTeam = '';
let currentTab = 'tab-brief';
let activeRound = 1;
let isLeader = false;
let dismissedReportRound = 0;

// UI Panels
const lobbyScreen = document.getElementById('lobby-screen');
const playerScreen = document.getElementById('player-screen');
const facilitatorScreen = document.getElementById('facilitator-screen');
const notificationBanner = document.getElementById('notification-banner');
const notificationText = document.getElementById('notification-text');

// System Manual Database
const roundsData = {
  1: {
    brief: `
      <h3>Round 1: Wrench Time Optimization & PTW Bottlenecks</h3>
      <p>Under the <strong>Shell Performance Framework</strong>, maximizing 'Wrench Time' (Direct Tool Time) is our primary lever for workforce productivity. We must choose the single best action package to execute:</p>
      <div class="data-card alert">
        <h4>Improvement Action Packages</h4>
        <ul>
          <li><strong>Action A (Digitized PTW workflow):</strong> Cost: $1,000/week. Increases wrench time by 10 hours/week.</li>
          <li><strong>Action B (Pre-kitting Spare Parts bins):</strong> Cost: $2,000/week. Increases wrench time by 5 hours/week.</li>
          <li><strong>Action C (Tool Crib Centralization):</strong> Cost: $3,000/week. Increases wrench time by 2 hours/week.</li>
        </ul>
      </div>
      <p>Calculate the resulting wrench time (hours/week) and the net economic gain ($/week) for each action. Submit the best option (A, B, or C), optimized wrench time, and net gain.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Wrench Time Baseline</h3>
        <div class="data-card">
          <h4>Weekly Productive Time Baseline</h4>
          <p>Currently, our crew's productive wrench time is exactly <strong>10 hours per week</strong>.</p>
        </div>
      `,
      PE: `
        <h3>[PE] Wrench Time Gains</h3>
        <div class="data-card">
          <h4>Workforce Productivity Metrics (EN 15341 - O8)</h4>
          <ul>
            <li><strong>Action A (Digitized PTW):</strong> Increases wrench time by <strong>10 hours/week</strong>.</li>
            <li><strong>Action B (Pre-kitting Bins):</strong> Increases wrench time by <strong>5 hours/week</strong>.</li>
            <li><strong>Action C (Tool Crib Centralization):</strong> Increases wrench time by <strong>2 hours/week</strong>.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Labor Economics Valuation</h3>
        <div class="data-card danger">
          <h4>Work Hour Value</h4>
          <p>Under the Shell Performance Framework, each hour of productive wrench time is valued at exactly <strong>$1,000 per hour</strong> in platform maintenance benefit.</p>
        </div>
      `,
      LSC: `
        <h3>[LSC] Material Management Costs (IAM SSG 17)</h3>
        <div class="data-card alert">
          <h4>Weekly Improvement Costs</h4>
          <ul>
            <li><strong>Action A Cost:</strong> $1,000/week</li>
            <li><strong>Action B Cost:</strong> $2,000/week</li>
            <li><strong>Action C Cost:</strong> $3,000/week</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Financial & Decision Calculations</h3>
        <div class="data-card">
          <h4>Net Gain Calculation Formula</h4>
          <ul>
            <li><strong>Optimized Wrench Time:</strong> Baseline Wrench Time (10) + Wrench Time Increase of the action.</li>
            <li><strong>Net Economic Gain:</strong> (Wrench Time Increase * $1,000) - Action Cost.</li>
            <li><em>Submit the best action, its resulting optimized wrench time, and its net gain.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which improvement package is the most cost-effective to execute?",
        options: [
          "Action A (Digitized PTW workflow)",
          "Action B (Pre-kitting Spare Parts bins)",
          "Action C (Tool Crib Centralization)"
        ]
      },
      q2: {
        text: "What is the net weekly economic gain of the selected action package?",
        options: [
          "$2,000/week",
          "$9,000/week",
          "$4,000/week",
          "-$1,000/week"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Selected Action Package</label>
          <select id="ans-option" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select action...</option>
            <option value="A">Action A (Digitized PTW)</option>
            <option value="B">Action B (Pre-kitting Bins)</option>
            <option value="C">Action C (Tool Crib Centralization)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Optimized Wrench Time (Hours/Week)</label>
          <input type="number" id="ans-wrenchTime" class="draft-sync" placeholder="e.g. 20" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Net Economic Gain ($/Week)</label>
          <input type="text" id="ans-gain" class="draft-sync" placeholder="e.g. 9000" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  2: {
    brief: `
      <h3>Round 2: Maintenance Backlog & Campaign Scheduling</h3>
      <p>The corrective maintenance backlog on Platform Bravo has escalated. Under <strong>EN 15341</strong> (Workforce Scheduling Compliance), we must plan a campaign to clear critical work orders. Select the scheduling method (Campaign vs. Reactive), the number of technicians to deploy, and calculate the total cost.</p>
      <div class="data-card alert">
        <h4>Task Details</h4>
        <p>Determine: 1. Scheduling Method. 2. Technicians deployed. 3. Total cost (technician salaries + campaign mobilization fees).</p>
      </div>
    `,
    roles: {
      SE: `
        <h3>[SE] Integrity Work Backlog</h3>
        <div class="data-card danger">
          <h4>Backlog Work Orders</h4>
          <ul>
            <li><strong>Total Backlog:</strong> <strong>100 hours</strong> of critical corrective maintenance.</li>
            <li><strong>Campaign Scheduling:</strong> Planning efficiency reduces the backlog work hours required to **80 hours**.</li>
            <li><strong>Reactive Scheduling:</strong> No planning efficiency (technicians troubleshoot on the fly). Requires the full **100 hours** of work.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Operations Shift Capacity</h3>
        <div class="data-card">
          <h4>Shift Capacity Metrics</h4>
          <ul>
            <li><strong>Technician Shift:</strong> Each deployed technician works exactly **10 hours** total.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Safety & Resource Limits</h3>
        <div class="data-card alert">
          <h4>Safe Crew Limits</h4>
          <ul>
            <li><strong>Crew limits:</strong> Safety requires a minimum of 2 technicians, up to a maximum of 10 technicians on the platform.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Logistics Costs</h3>
        <div class="data-card">
          <h4>Labor & Mobilization Costs</h4>
          <ul>
            <li><strong>Salary:</strong> Each technician's salary is exactly **$1,000**.</li>
            <li><strong>Campaign Mobilization Fee:</strong> A flat **$1,000** logistics fee (applicable ONLY for Campaign Maintenance).</li>
            <li><strong>Reactive Mobilization Fee:</strong> **$0** (but no planning efficiency).</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Campaign Economics</h3>
        <div class="data-card">
          <h4>Cost & Crew Formulas</h4>
          <ul>
            <li><strong>Technicians Deployed:</strong> Work Hours Required / 10 hours per technician.</li>
            <li><strong>Total Campaign Cost:</strong> (Technicians Deployed * $1,000) + Mobilization Fee.</li>
            <li><em>Compare Campaign vs Reactive costs and submit the cheaper option, the techs needed for it, and the cost.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which scheduling method is the most cost-efficient and optimal?",
        options: [
          "Campaign Maintenance",
          "Reactive Maintenance"
        ]
      },
      q2: {
        text: "What is the total cost of the optimal scheduling method?",
        options: [
          "$10,000",
          "$11,000",
          "$9,000",
          "$12,000"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Scheduling Method</label>
          <select id="ans-method" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select method...</option>
            <option value="Campaign">Campaign Maintenance</option>
            <option value="Reactive">Reactive Maintenance</option>
          </select>
        </div>
        <div class="input-group">
          <label>Technicians Deployed</label>
          <input type="number" id="ans-techs" class="draft-sync" placeholder="e.g. 8" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Total Campaign Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="e.g. 9000" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  3: {
    brief: `
      <h3>Round 3: Preventive Maintenance (PM) Compliance & Execution</h3>
      <p>A safety-critical pressure control valve requires an overdue Preventive Maintenance (PM) service to comply with the <strong>Shell Performance Framework</strong>. You must determine the **Start Day** and the **Total PM Duration (in hours)** to execute this safely.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Lift Staging & Crane Availability</h3>
        <div class="data-card">
          <h4>Crane Support Windows</h4>
          <ul>
            <li><strong>Crane Support:</strong> Moving the valve components requires crane support. The platform crane is only available on <strong>Days 1 and 2</strong>.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Process Flow Staging</h3>
        <div class="data-card alert">
          <h4>Process Flow Compliance</h4>
          <ul>
            <li><strong>Steady Flow Window:</strong> PM isolation requires steady flow conditions, forecast for <strong>Day 2 and Day 3</strong>.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Safety Briefings & Debriefs</h3>
        <div class="data-card danger">
          <h4>HSE Compliance Procedures</h4>
          <ul>
            <li><strong>Pre-job Safety Briefing:</strong> Takes exactly <strong>1 hour</strong>.</li>
            <li><strong>Post-job Clean-up & Debrief:</strong> Takes exactly <strong>1 hour</strong>.</li>
            <li><em>Rule: Both briefing and clean-up hours must be added to the vendor's mechanical execution time.</em></li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Vendor Flight Scheduling</h3>
        <div class="data-card">
          <h4>Vendor Arrival Window</h4>
          <ul>
            <li><strong>Helicopter Booking:</strong> The specialized valve vendor is only booked on the platform for <strong>Day 2 ONLY</strong>.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Maintenance Contracts</h3>
        <div class="data-card">
          <h4>Vendor Execution Scope</h4>
          <ul>
            <li><strong>Mechanical Execution Time:</strong> The vendor service contract allocates exactly <strong>4 hours</strong> of direct mechanical work for this valve PM.</li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which day should the PM execution start?",
        options: [
          "Day 1",
          "Day 2",
          "Day 3",
          "Day 4"
        ]
      },
      q2: {
        text: "What is the total duration of the PM (briefing + mechanical + clean-up)?",
        options: [
          "4 hours",
          "5 hours",
          "6 hours",
          "8 hours"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Start Day (1-5)</label>
          <input type="number" id="ans-startDay" class="draft-sync" placeholder="e.g. 2" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Total PM Duration (Hours)</label>
          <input type="number" id="ans-duration" class="draft-sync" placeholder="e.g. 6" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  4: {
    brief: `
      <h3>Round 4: Planning & Preparation Quality (Plan Quality Index)</h3>
      <p>A maintenance campaign to overhaul shutdown valves is being prepared. Under the <strong>Shell Performance Framework</strong>, the <strong>Plan Quality Index (PQI)</strong> measures planning readiness. Poor planning directly reduces technician wrench time.</p>
      <p>You must calculate: 1. The Plan Quality Index (PQI) percentage. 2. The resulting actual Wrench Time (hours). 3. The number of material kits to prepare.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Maintenance Planning Standard</h3>
        <div class="data-card">
          <h4>Planned Execution Window</h4>
          <ul>
            <li><strong>Planned Time:</strong> The standard planned time for overhauling a shutdown valve is <strong>10 hours</strong> of direct wrench time under 100% planning quality.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Plan Quality Index Formula</h3>
        <div class="data-card alert">
          <h4>PQI Definition</h4>
          <ul>
            <li><strong>PQI Calculation:</strong> <code>PQI = (Completed Planning Steps / 5) * 100</code>.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Planning Gate Review</h3>
        <div class="data-card danger">
          <h4>Planning Readiness Checklist</h4>
          <ul>
            <li><strong>Review:</strong> Due to a scheduling rush, the team completed only <strong>4 out of the 5 planning steps</strong>.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Material Staging & Kitting</h3>
        <div class="data-card">
          <h4>Material Prep (IAM SSG 17)</h4>
          <ul>
            <li><strong>Valve Campaign Scope:</strong> The upcoming campaign covers overhauling exactly <strong>5 shutdown valves</strong>.</li>
            <li><strong>Kitting:</strong> We need 1 pre-kitted parts bag for each valve.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Productivity Loss Ledger</h3>
        <div class="data-card">
          <h4>Wrench Time Adjustment</h4>
          <ul>
            <li><strong>Wrench Time Formula:</strong> <code>Actual Wrench Time = Planned Wrench Time * (PQI / 100)</code>.</li>
            <li><em>Submit: 1. PQI (%). 2. Actual Wrench Time (hours). 3. Material Kits to prepare.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "What is the resulting Plan Quality Index (PQI) when 4 out of 5 steps are completed?",
        options: [
          "100%",
          "90%",
          "80%",
          "60%"
        ]
      },
      q2: {
        text: "How many actual wrench time hours will the technician work under this PQI?",
        options: [
          "10 hours",
          "8 hours",
          "6 hours",
          "5 hours"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Plan Quality Index (%)</label>
          <input type="number" id="ans-pqi" class="draft-sync" placeholder="e.g. 80" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Actual Wrench Time (Hours)</label>
          <input type="number" id="ans-wrenchTime" class="draft-sync" placeholder="e.g. 8" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Material Kits to Prepare</label>
          <input type="number" id="ans-kits" class="draft-sync" placeholder="e.g. 5" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  5: {
    brief: `
      <h3>Round 5: Wrench Time Measurement & Productivity Analysis</h3>
      <p>A work sampling study was conducted on a technician crew to measure Wrench Time under <strong>EN 15341 (O8 Indicator)</strong>. You must classify the productivity category, determine the Wrench Time percentage, and calculate the Net Labor Value gained relative to our historical baseline.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Work Sampling Observations</h3>
        <div class="data-card">
          <h4>Sampling Raw Data</h4>
          <ul>
            <li><strong>Total Random Observations:</strong> <strong>100 observations</strong> were recorded across the crew during the 1-week study.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Productivity Observations Breakdown</h3>
        <div class="data-card alert">
          <h4>Observation Log</h4>
          <ul>
            <li><strong>Direct Maintenance Work (Wrench Time):</strong> 50 observations.</li>
            <li><strong>All Other Delays/Transits:</strong> 50 observations.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Wrench Time Ratio Formula</h3>
        <div class="data-card danger">
          <h4>Wrench Time KPI & Classification</h4>
          <ul>
            <li><strong>Formula:</strong> <code>Wrench Time % = (Direct Work Observations / Total Observations) * 100</code>.</li>
            <li><strong>Classification Thresholds:</strong>
              <br>High (>=50%), Medium (30%-49%), Low (<30%)
            </li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Labor Cost constraints</h3>
        <div class="data-card">
          <h4>Weekly Crew Labor Cost</h4>
          <ul>
            <li><strong>Weekly labor cost:</strong> Exactly $10,000.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Labor Economics Ledger</h3>
        <div class="data-card">
          <h4>Productive Labor Gains</h4>
          <ul>
            <li><strong>Historical Baseline:</strong> Historically, Wrench Time was <strong>30%</strong>.</li>
            <li><strong>Labor Gain Formula:</strong> <code>Net Labor Value Gained = (Current Wrench Time % - Baseline Wrench Time %) * Weekly Labor Cost / 100</code>.</li>
            <li><em>Submit: 1. Productivity Class. 2. Wrench Time (%). 3. Value Gained ($).</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Under EN 15341, how is the technician crew's 50% Wrench Time classified?",
        options: [
          "High Productivity",
          "Medium Productivity",
          "Low Productivity"
        ]
      },
      q2: {
        text: "What is the net productive labor value gained per week compared to the 30% baseline?",
        options: [
          "$1,000",
          "$2,000",
          "$3,000",
          "$5,000"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Productivity Classification</label>
          <select id="ans-productivity" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select class...</option>
            <option value="High">High (>=50%)</option>
            <option value="Medium">Medium (30%-49%)</option>
            <option value="Low">Low (<30%)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Wrench Time (%)</label>
          <input type="number" id="ans-wrenchTime" class="draft-sync" placeholder="e.g. 50" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Net Labor Value Gained ($)</label>
          <input type="text" id="ans-laborValue" class="draft-sync" placeholder="e.g. 2000" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  6: {
    brief: `
      <h3>Tie-Breaker: Shell Maintenance Execution Cycle</h3>
      <p>Under the <strong>Shell Performance Framework</strong>, the maintenance execution process follows a strict 8-step cycle to maximize wrench time and technical integrity. You must work together to arrange the 8 lifecycle steps in their correct chronological order from first to last.</p>
      <div class="data-card warning">
        <h4>Tie-Breaker Protocol</h4>
        <p>The first team to submit the correct sequence of 8 actions wins the entire simulation! Use the manual clues to arrange the actions in the correct chronological order from first to last.</p>
      </div>
    `,
    roles: {
      SE: `
        <h3>[SE] Cycle Checklist Clues</h3>
        <div class="data-card alert">
          <h4>Execution Steps</h4>
          <ul>
            <li><strong>Identify & Define</strong> is Step 1.</li>
            <li><strong>Review & Improve</strong> is Step 8.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Cycle Checklist Clues</h3>
        <div class="data-card alert">
          <h4>Execution Steps</h4>
          <ul>
            <li><strong>Approve & Prioritize</strong> is Step 2.</li>
            <li><strong>Close & Document</strong> is Step 7.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Cycle Checklist Clues</h3>
        <div class="data-card alert">
          <h4>Execution Steps</h4>
          <ul>
            <li><strong>Plan & Prepare</strong> is Step 3.</li>
            <li><strong>Execute & Monitor</strong> is Step 6.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Cycle Checklist Clues</h3>
        <div class="data-card alert">
          <h4>Execution Steps</h4>
          <ul>
            <li><strong>Schedule & Align</strong> is Step 4.</li>
            <li><strong>Permit & Authorize</strong> is Step 5.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Portfolio & Management Command</h3>
        <div class="data-card alert">
          <h4>Sequencing Guide</h4>
          <ul>
            <li>Gather the step positions (1 through 8) from your teammates' screens and arrange the 8 cycle steps in chronological order.</li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which of the following represents the first step of the Shell Maintenance Execution Cycle?",
        options: [
          "Approve & Prioritize",
          "Identify & Define",
          "Plan & Prepare",
          "Schedule & Align"
        ]
      },
      q2: {
        text: "Which step in the cycle represents the physical execution and monitoring of work?",
        options: [
          "Step 3: Plan & Prepare",
          "Step 5: Permit & Authorize",
          "Step 6: Execute & Monitor",
          "Step 7: Close & Document"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <label style="font-size:0.85rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:1px;">Chronological Sequence (1 to 8)</label>
        <div id="sequence-container" class="sequence-list">
          <!-- Steps will be generated here -->
        </div>
      </div>
    `
  }
};

const defaultSteps = [
  'Schedule & Align',
  'Execute & Monitor',
  'Approve & Prioritize',
  'Identify & Define',
  'Review & Improve',
  'Plan & Prepare',
  'Close & Document',
  'Permit & Authorize'
];

let currentSequence = [...defaultSteps];

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

// Setup socket and UI listeners
function setupEventListeners() {
  // Lobby join form
  document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    myName = document.getElementById('player-name').value.trim();
    myTeam = document.getElementById('player-team').value;
    myRole = document.getElementById('player-role').value;
    isLeader = (myRole === 'FA');

    socket.emit('register', { name: myName, role: myRole, teamId: myTeam });
  });

  // Facilitator access trigger
  document.getElementById('btn-fac-login').addEventListener('click', () => {
    const pass = prompt("Enter Facilitator Access Code:");
    if (pass === '007') {
      socket.emit('register', { role: 'facilitator' });
    } else if (pass !== null) {
      showNotification("Incorrect Access Code", "error");
    }
  });

  // Player UI events: submit answer
  document.getElementById('btn-submit-answer').addEventListener('click', () => {
    if (!isLeader) return;
    const answers = gatherFormAnswers();
    socket.emit('submit-answer', answers);
  });

  // Shared Notes syncing
  document.getElementById('shared-notes').addEventListener('input', (e) => {
    socket.emit('update-notes', e.target.value);
  });

  // Facilitator UI button events
  document.getElementById('btn-fac-start-game').addEventListener('click', () => {
    socket.emit('start-game');
  });
  document.getElementById('btn-fac-start-timer').addEventListener('click', () => {
    socket.emit('start-round-timer');
  });
  document.getElementById('btn-fac-pause-timer').addEventListener('click', () => {
    socket.emit('pause-round-timer');
  });
  document.getElementById('btn-fac-end-round').addEventListener('click', () => {
    socket.emit('end-round');
  });
  document.getElementById('btn-fac-next-round').addEventListener('click', () => {
    socket.emit('next-round');
  });
  document.getElementById('fac-puzzle-mode').addEventListener('change', (e) => {
    socket.emit('set-puzzle-mode', e.target.value);
  });
  document.getElementById('btn-fac-reset').addEventListener('click', () => {
    if (confirm("Reset the entire simulation? Scores and connections will clear.")) {
      socket.emit('reset-game');
    }
  });
  document.getElementById('btn-fac-exit').addEventListener('click', () => {
    window.location.reload();
  });

  document.getElementById('btn-adjust-score').addEventListener('click', () => {
    const teamId = document.getElementById('adjust-team').value;
    const val = parseInt(document.getElementById('adjust-amount').value, 10);
    if (!isNaN(val)) {
      socket.emit('adjust-score', { teamId, adjustment: val });
      document.getElementById('adjust-amount').value = '';
    }
  });

  document.getElementById('btn-reveal-solution').addEventListener('click', () => {
    const details = document.getElementById('fac-solution-details');
    if (details.classList.contains('hidden')) {
      socket.emit('request-solution-explanation');
    } else {
      details.classList.add('hidden');
    }
  });

  // --- SOCKET LISTENERS ---
  socket.on('init-state', (state) => {
    updateGlobalState(state);
  });

  socket.on('game-state-update', (state) => {
    updateGlobalState(state);
  });

  socket.on('register-success', ({ role, name, teamId }) => {
    showNotification(`Uplink established. Access granted.`, "success");
    if (role === 'facilitator') {
      myRole = 'facilitator';
      showScreen('facilitator-screen');
      if (updateGlobalState.lastState) {
        updateGlobalState(updateGlobalState.lastState);
      }
    } else {
      showScreen('player-screen');
      document.getElementById('display-team-name').innerText = getTeamName(teamId);
      document.getElementById('display-team-name').className = `team-badge team-${teamId}`;
      document.getElementById('display-role-name').innerText = getRoleName(role);
      
      if (isLeader) {
        document.getElementById('leader-lock-badge').innerText = "Asset Manager (Leader)";
        document.getElementById('leader-lock-badge').className = "badge badge-success";
        document.getElementById('leader-only-warning').classList.add('hidden');
      } else {
        document.getElementById('leader-lock-badge').innerText = "Terminal Read-Only";
        document.getElementById('leader-lock-badge').className = "badge badge-warning";
        document.getElementById('leader-only-warning').classList.remove('hidden');
      }
    }
  });

  socket.on('register-error', (msg) => {
    showNotification(msg, "error");
  });

  socket.on('notes-updated', (notesText) => {
    document.getElementById('shared-notes').value = notesText;
  });

  socket.on('draft-answers-updated', (drafts) => {
    populateDraftAnswers(drafts);
  });

  socket.on('round-solved', ({ pointsEarned, timeTaken, attempts, score }) => {
    showNotification(`CALIBRATION SUCCESSFUL! Earned +${pointsEarned} pts.`, "success");
    document.getElementById('display-team-score').innerText = score;
    const audio = new Audio(); // Placeholder for sound
  });

  socket.on('submit-response', ({ success, message }) => {
    if (!success) {
      showNotification(message, "error");
    }
  });

  socket.on('teammate-submit-failed', ({ attempts }) => {
    showNotification(`Decisional Calibration failed. Retrying... (Attempt #${attempts})`, "error");
    document.getElementById('display-attempts-count').innerText = attempts;
  });

  socket.on('timer-tick', (sec) => {
    const timeStr = formatTime(sec);
    if (document.getElementById('player-timer')) {
      document.getElementById('player-timer').innerText = timeStr;
    }
    if (document.getElementById('fac-timer')) {
      document.getElementById('fac-timer').innerText = timeStr;
    }
  });

  socket.on('facilitator-log', (logText) => {
    addConsoleLog(logText);
  });

  socket.on('game-reset', () => {
    showNotification("Simulation reset by Facilitator.", "warning");
    if (myRole && myRole !== 'facilitator') {
      showScreen('lobby-screen');
    }
  });

  socket.on('solution-explanation-data', ({ round, explanation }) => {
    const titleData = puzzles[round];
    document.getElementById('solution-round-title').innerText = titleData?.title || `Round ${round}`;
    document.getElementById('solution-explanation').innerText = explanation;
    document.getElementById('fac-solution-details').classList.remove('hidden');
  });
}

// Global UI manager
function showScreen(screenId) {
  document.querySelectorAll('.screen-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  // Find button targeting this tab
  event.target.classList.add('active');
}

function showNotification(text, type = "info") {
  notificationText.innerText = text;
  notificationBanner.className = `notification-banner ${type}`;
  notificationBanner.classList.remove('hidden');
  
  setTimeout(() => {
    closeNotification();
  }, 5000);
}

function closeNotification() {
  notificationBanner.classList.add('hidden');
}

// Convert state updates into DOM updates
function updateGlobalState(state) {
  updateGlobalState.lastState = state;
  activeRound = state.currentRound;
  
  // Update Lobby Lists
  updateLobbyCrew(state.players);

  // If in Player Screen
  if (myRole && myRole !== 'facilitator') {
    updatePlayerView(state);
  }

  // If in Facilitator Screen
  if (myRole === 'facilitator') {
    updateFacilitatorView(state);
  }
}

// Update crew lists on lobby & facilitator console
function updateLobbyCrew(players) {
  const teams = { alpha: [], beta: [], gamma: [], delta: [] };
  
  Object.values(players).forEach(p => {
    if (teams[p.teamId]) {
      teams[p.teamId].push(p);
    }
  });

  for (let teamId in teams) {
    // Lobby lists
    const lobbyList = document.getElementById(`crew-${teamId}`);
    if (lobbyList) {
      lobbyList.innerHTML = '';
      if (teams[teamId].length === 0) {
        lobbyList.innerHTML = `<li style="opacity:0.5; font-style:italic;">No uplink established</li>`;
      } else {
        teams[teamId].forEach(p => {
          const isLeaderRow = p.roleId === 'FA';
          const li = document.createElement('li');
          if (isLeaderRow) li.className = 'leader-row';
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="crew-role-lbl">${p.roleId}</span>
          `;
          lobbyList.appendChild(li);
        });
      }
    }

    // Facilitator console lists
    const facList = document.getElementById(`fac-crew-${teamId}`);
    if (facList) {
      facList.innerHTML = '';
      if (teams[teamId].length === 0) {
        facList.innerHTML = `<li style="opacity:0.5; font-style:italic;">No uplink established</li>`;
      } else {
        teams[teamId].forEach(p => {
          const isLeaderRow = p.roleId === 'FA';
          const li = document.createElement('li');
          if (isLeaderRow) li.className = 'leader-row';
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="crew-role-lbl">${p.roleId}</span>
          `;
          facList.appendChild(li);
        });
      }
    }
  }
}

// Update Player Panel
function updatePlayerView(state) {
  const team = state.teams[myTeam];
  const roundNum = state.currentRound;

  // Title & Score Display
  const titleData = puzzles[roundNum];
  document.getElementById('round-title-display').innerText = titleData?.title || `Round ${roundNum}`;
  document.getElementById('display-team-score').innerText = team.score;
  
  const status = team.roundStatus[roundNum] || { solved: false, attempts: 0 };
  document.getElementById('display-attempts-count').innerText = status.attempts;

  // Sync shared notes if not active user typing
  if (document.activeElement !== document.getElementById('shared-notes')) {
    document.getElementById('shared-notes').value = team.notes || '';
  }

  // Load Round Specific HTML Template if it changed
  const formContainer = document.getElementById('dynamic-submit-form');
  const renderedRoundAttribute = formContainer.getAttribute('data-round');
  const renderedModeAttribute = formContainer.getAttribute('data-mode');
  
  if (renderedRoundAttribute !== String(roundNum) || renderedModeAttribute !== state.puzzleMode) {
    formContainer.setAttribute('data-round', roundNum);
    formContainer.setAttribute('data-mode', state.puzzleMode);
    
    if (state.puzzleMode === 'objective') {
      formContainer.innerHTML = generateObjectiveFormHtml(roundNum);
    } else {
      formContainer.innerHTML = roundsData[roundNum].inputs;
    }
    
    // Inject briefs & manuals
    document.getElementById('brief-content').innerHTML = roundsData[roundNum].brief;
    document.getElementById('manual-content').innerHTML = roundsData[roundNum].roles[myRole] || '<p>No specific manual for this role.</p>';

    // Initialize sequence array if Round 6 and standard mode
    if (roundNum === 6) {
      currentSequence = [...defaultSteps];
      if (state.puzzleMode === 'standard') {
        renderSequenceItems();
      }
    }
    
    // Pre-populate input drafts
    populateDraftAnswers(team.draftAnswers);
  }

  // Lock status styling
  const statusBox = document.getElementById('team-round-status-box');
  const statusText = document.getElementById('team-round-status-text');
  const submitBtn = document.getElementById('btn-submit-answer');

  // Sync draft edits if they were changed elsewhere
  if (Object.keys(team.draftAnswers).length > 0) {
    populateDraftAnswers(team.draftAnswers);
  }

  // Disable inputs if solved or timer not active
  toggleInputs(status.solved || !state.timerActive);

  if (status.solved) {
    statusBox.className = "status-box status-solved";
    statusBox.style.flexDirection = "column";
    statusBox.style.alignItems = "flex-start";
    
    const submittedText = formatSubmittedAnswersForPlayer(roundNum, status.submittedAnswers, state.puzzleMode);
    
    statusText.innerHTML = `
      <span>DECISION SECURED. Correct calibration in ${formatTime(status.timeTaken)}! (+${status.pointsEarned} pts)</span>
      ${submittedText ? `
      <div style="margin-top: 8px; font-size: 0.85rem; border-top: 1px dashed rgba(46, 204, 113, 0.25); padding-top: 8px; width: 100%; color: var(--text-muted); text-align: left;">
        <strong>SUBMITTED DECISION:</strong> <span style="color: var(--text-main);">${submittedText}</span>
      </div>
      ` : ''}
    `;
    submitBtn.disabled = true;
  } else if (!state.timerActive) {
    statusBox.className = "status-box status-idle";
    statusBox.style.flexDirection = "";
    statusBox.style.alignItems = "";
    statusText.innerText = "System Awaiting Authorization... (Timer Paused)";
    submitBtn.disabled = true;
  } else {
    statusBox.className = "status-box status-active";
    statusBox.style.flexDirection = "";
    statusBox.style.alignItems = "";
    statusText.innerText = "CALIBRATION TERMINALS ACTIVE. Awaiting inputs...";
    // Only Team Lead can press submit
    submitBtn.disabled = !isLeader;
  }

  // Update Report Modal if status is end_round
  updateReportModal(state);

  // Handle countdown alarm color
  const timerDiv = document.getElementById('player-timer').parentElement;
  if (state.timerActive && state.timer > 300) { // e.g. warn after 5 mins
    timerDiv.classList.add('alert');
  } else {
    timerDiv.classList.remove('alert');
  }
}

// Disable/Enable input fields helper
function toggleInputs(disabled) {
  const inputs = document.querySelectorAll('.draft-sync');
  inputs.forEach(input => {
    input.disabled = disabled;
  });

  // Also disable sequence shifts in Round 6
  document.querySelectorAll('.btn-seq-move').forEach(b => {
    b.disabled = disabled;
  });
}

// Gather all inputs to build answers object
function gatherFormAnswers() {
  const puzzleMode = (updateGlobalState.lastState ? updateGlobalState.lastState.puzzleMode : 'standard');
  if (activeRound === 6 && puzzleMode === 'standard') {
    return { sequence: currentSequence };
  }

  const answers = {};
  if (puzzleMode === 'objective') {
    const q1Checked = document.querySelector('input[name="ans-q1"]:checked');
    const q2Checked = document.querySelector('input[name="ans-q2"]:checked');
    answers.q1 = q1Checked ? q1Checked.value : '';
    answers.q2 = q2Checked ? q2Checked.value : '';
  } else {
    document.querySelectorAll('.draft-sync').forEach(el => {
      const key = el.id.replace('ans-', '');
      answers[key] = el.value;
    });
  }
  return answers;
}

// Sync edits in drafts to teammates
function syncDraftAnswers() {
  const puzzleMode = (updateGlobalState.lastState ? updateGlobalState.lastState.puzzleMode : 'standard');
  if (activeRound === 6 && puzzleMode === 'standard') {
    socket.emit('update-draft-answers', { sequence: currentSequence });
    return;
  }

  const drafts = gatherFormAnswers();
  socket.emit('update-draft-answers', drafts);
}

// Populate draft edits from socket updates
function populateDraftAnswers(drafts) {
  if (!drafts) return;
  
  const puzzleMode = (updateGlobalState.lastState ? updateGlobalState.lastState.puzzleMode : 'standard');
  if (activeRound === 6 && puzzleMode === 'standard' && drafts.sequence) {
    currentSequence = [...drafts.sequence];
    renderSequenceItems();
    return;
  }

  if (puzzleMode === 'objective') {
    if (drafts.q1 !== undefined) {
      const radio = document.querySelector(`input[name="ans-q1"][value="${drafts.q1}"]`);
      if (radio) radio.checked = true;
    }
    if (drafts.q2 !== undefined) {
      const radio = document.querySelector(`input[name="ans-q2"][value="${drafts.q2}"]`);
      if (radio) radio.checked = true;
    }
  } else {
    for (let key in drafts) {
      const input = document.getElementById(`ans-${key}`);
      // Only update if the current user isn't actively focusing/typing on it
      if (input && document.activeElement !== input) {
        input.value = drafts[key];
      }
    }
  }
}

// Shift items in Tie Breaker sequence
function moveSequenceItem(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentSequence.length) return;
  
  // Swap
  const temp = currentSequence[index];
  currentSequence[index] = currentSequence[targetIndex];
  currentSequence[targetIndex] = temp;
  
  renderSequenceItems();
  syncDraftAnswers();
}

// Render the 8 steps for Round 6
function renderSequenceItems() {
  const container = document.getElementById('sequence-container');
  if (!container) return;
  
  container.innerHTML = '';
  currentSequence.forEach((step, idx) => {
    const div = document.createElement('div');
    div.className = 'sequence-item';
    
    div.innerHTML = `
      <div class="sequence-number">${idx + 1}</div>
      <div class="sequence-label">${step}</div>
      <div class="sequence-controls">
        <button class="btn-seq-move" onclick="moveSequenceItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="btn-seq-move" onclick="moveSequenceItem(${idx}, 1)" ${idx === currentSequence.length - 1 ? 'disabled' : ''}>&darr;</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// Format submitted answers on client side for display
function formatSubmittedAnswersForPlayer(roundNum, submittedAnswers, puzzleMode) {
  if (!submittedAnswers) return '';
  if (puzzleMode === 'objective') {
    const data = roundsData[roundNum];
    if (!data || !data.objectiveQuestions) return '';
    const q1Idx = parseInt(submittedAnswers.q1, 10);
    const q2Idx = parseInt(submittedAnswers.q2, 10);
    const q1Text = data.objectiveQuestions.q1.options[q1Idx] || (submittedAnswers.q1 || 'None');
    const q2Text = data.objectiveQuestions.q2.options[q2Idx] || (submittedAnswers.q2 || 'None');
    return `Q1: "${q1Text}" | Q2: "${q2Text}"`;
  } else {
    if (roundNum === 6) {
      const seq = submittedAnswers.sequence || [];
      return `Sequence: ${seq.join(' > ')}`;
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

// Update the round end report modal view
function updateReportModal(state) {
  const modal = document.getElementById('report-modal');
  if (!modal) return;

  if (state.status === 'end_round') {
    if (dismissedReportRound !== state.currentRound) {
      const team = state.teams[myTeam];
      const status = team ? (team.roundStatus[state.currentRound] || {}) : {};
      
      // Title
      document.getElementById('modal-round-title').innerText = `ROUND ${state.currentRound} END REPORT`;
      
      // Status Badge
      const statusBadge = document.getElementById('modal-team-status-badge');
      if (status.solved) {
        statusBadge.className = "badge badge-success";
        statusBadge.innerText = `DECISION SECURED`;
      } else {
        statusBadge.className = "badge badge-warning";
        statusBadge.innerText = `CALIBRATION FAILED / TIMEOUT`;
      }
      
      // Score details
      document.getElementById('modal-base-points').innerText = status.basePoints || 0;
      document.getElementById('modal-speed-bonus').innerText = `+${status.speedBonus || 0}`;
      document.getElementById('modal-penalty-points').innerText = `-${status.incorrectPenalties || 0}`;
      document.getElementById('modal-final-points').innerText = status.pointsEarned || 0;
      
      // Partial Multiplier Note
      const partialNote = document.getElementById('modal-partial-multiplier-note');
      if (status.partialMultiplier === 0.5) {
        partialNote.classList.remove('hidden');
      } else {
        partialNote.classList.add('hidden');
      }
      
      // Explanation text
      document.getElementById('modal-explanation-text').innerText = state.roundEndExplanation || "No explanation details available.";
      
      // Compliance text
      document.getElementById('modal-compliance-text').innerText = state.roundEndCompliance || "No compliance details available.";
      
      modal.classList.remove('hidden');
    }
  } else {
    modal.classList.add('hidden');
  }
}

// Close/Dismiss the report modal globally
window.closeReportModal = function() {
  document.getElementById('report-modal').classList.add('hidden');
  dismissedReportRound = activeRound;
};

// Update Facilitator Dashboard
function updateFacilitatorView(state) {
  // Update status labels
  document.getElementById('fac-game-status').innerText = state.status.toUpperCase();
  document.getElementById('fac-current-round').innerText = state.currentRound === 6 ? "TIE-BREAKER" : `Round ${state.currentRound}`;

  const modeSelector = document.getElementById('fac-puzzle-mode');
  if (modeSelector) {
    modeSelector.value = state.puzzleMode;
    modeSelector.disabled = (state.status !== 'lobby');
  }

  // Enable/Disable admin buttons appropriately
  document.getElementById('btn-fac-start-timer').disabled = (state.status !== 'active' || state.timerActive);
  document.getElementById('btn-fac-pause-timer').disabled = (!state.timerActive);
  document.getElementById('btn-fac-end-round').disabled = (state.status !== 'active');
  document.getElementById('btn-fac-next-round').disabled = (state.status !== 'end_round');

  // Update Leaderboard bars dynamically sorted descending
  const leaderboardContainer = document.getElementById('fac-leaderboard-bars');
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

  // Update Progress Matrix Table
  const tableBody = document.getElementById('fac-matrix-body');
  tableBody.innerHTML = '';
  
  for (let teamId in state.teams) {
    const team = state.teams[teamId];
    const status = team.roundStatus[state.currentRound] || { solved: false, attempts: 0, timeTaken: null, pointsEarned: 0 };
    
    const tr = document.createElement('tr');
    if (status.solved) tr.className = 'matrix-row-solved';
    
    tr.innerHTML = `
      <td><strong>${team.name}</strong></td>
      <td>
        <span class="badge ${status.solved ? 'badge-success' : 'badge-warning'}">
          ${status.solved ? 'SOLVED' : 'SOLVING'}
        </span>
      </td>
      <td>${status.solved && status.timeTaken ? formatTime(status.timeTaken) : '--:--'}</td>
      <td>${status.attempts}</td>
      <td>+${status.pointsEarned} pts</td>
    `;
    tableBody.appendChild(tr);
  }

  // Update Solution Box details
  document.getElementById('solution-round-title').innerText = puzzles[state.currentRound]?.title || `Round ${state.currentRound}`;
  document.getElementById('solution-explanation').innerText = puzzles[state.currentRound]?.solutionExplanation || 'No solution details available.';
}

// Add console entry helper
function addConsoleLog(text) {
  const logDiv = document.getElementById('fac-console-logs');
  if (logDiv) {
    const p = document.createElement('p');
    p.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    p.innerHTML = `<span style="color:var(--primary); font-weight:600;">[${time}]</span> ${text}`;
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
}

// Helpers
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

const puzzles = {
  1: { title: "Round 1: Wrench Time Optimization" },
  2: { title: "Round 2: Maintenance Backlog" },
  3: { title: "Round 3: Preventive Maintenance (PM)" },
  4: { title: "Round 4: Planning Quality (PQI)" },
  5: { title: "Round 5: Wrench Time Measurement" },
  6: { title: "Tie-Breaker: Shell Maintenance Cycle" }
};

function generateObjectiveFormHtml(roundNum) {
  const data = roundsData[roundNum];
  if (!data || !data.objectiveQuestions) return '<p>No questions configured for this round.</p>';
  
  const q1 = data.objectiveQuestions.q1;
  const q2 = data.objectiveQuestions.q2;
  
  let html = `
    <div class="objective-form-wrap" style="display: flex; flex-direction: column; gap: 20px; text-align: left;">
      <div class="input-group">
        <label style="font-weight: 600; display: block; margin-bottom: 10px; font-size: 0.95rem; color: var(--text);">
          Question 1: ${q1.text}
        </label>
        <div class="objective-options" style="display: flex; flex-direction: column; gap: 10px;">
  `;
  
  q1.options.forEach((opt, idx) => {
    html += `
      <label class="radio-option-lbl" style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; transition: background 0.2s;">
        <input type="radio" name="ans-q1" id="ans-q1-${idx}" value="${idx}" class="draft-sync" onchange="syncDraftAnswers()" style="margin-top: 3px; cursor: pointer;">
        <span>${opt}</span>
      </label>
    `;
  });
  
  html += `
        </div>
      </div>
      <div class="input-group">
        <label style="font-weight: 600; display: block; margin-bottom: 10px; font-size: 0.95rem; color: var(--text);">
          Question 2: ${q2.text}
        </label>
        <div class="objective-options" style="display: flex; flex-direction: column; gap: 10px;">
  `;
  
  q2.options.forEach((opt, idx) => {
    html += `
      <label class="radio-option-lbl" style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; transition: background 0.2s;">
        <input type="radio" name="ans-q2" id="ans-q2-${idx}" value="${idx}" class="draft-sync" onchange="syncDraftAnswers()" style="margin-top: 3px; cursor: pointer;">
        <span>${opt}</span>
      </label>
    `;
  });
  
  html += `
        </div>
      </div>
    </div>
  `;
  
  return html;
}
