const socket = io();

// Local player state
let myName = '';
let myRole = '';
let myTeam = '';
let currentTab = 'tab-brief';
let activeRound = 1;
let isLeader = false;
let dismissedReportRound = 0;
let lastPuzzleModeVal = 'normal';
let lastFinalRoundVal = 9;

// UI Panels
const lobbyScreen = document.getElementById('lobby-screen');
const playerScreen = document.getElementById('player-screen');
const facilitatorScreen = document.getElementById('facilitator-screen');
const notificationBanner = document.getElementById('notification-banner');
const notificationText = document.getElementById('notification-text');

// System Manual Database
const roundsData = {
  1: {
    tips: `<strong>Round 1 Tips:</strong> Action A (Digitized PTW) is the optimal decision. Wrench time increases from 10 to 20 hours/week. Net Economic Gain = (10 hrs * $1,000/hr) - $1,000 cost = $9,000. Action B yields a net gain of $3,000. Action C yields -$1,000. Correct answer: <strong>A, 20, $9,000</strong>.`,
    brief: `
      <h3>Round 1: Wrench Time Optimization & PTW Bottlenecks</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Workforce Improvement Packages</text>
          
          <rect x="100" y="45" width="220" height="20" rx="3" fill="url(#r1-blue)" stroke="#00b4d8" stroke-width="1"/>
          <text x="15" y="59" fill="var(--text-muted)" font-size="11">Action A</text>
          <text x="110" y="59" fill="#fff" font-size="10">Digitized PTW Workflow</text>
          
          <rect x="100" y="75" width="220" height="20" rx="3" fill="url(#r1-blue)" stroke="#00b4d8" stroke-width="1"/>
          <text x="15" y="89" fill="var(--text-muted)" font-size="11">Action B</text>
          <text x="110" y="89" fill="#fff" font-size="10">Pre-kitting Bins</text>
          
          <rect x="100" y="105" width="220" height="20" rx="3" fill="url(#r1-blue)" stroke="#00b4d8" stroke-width="1"/>
          <text x="15" y="119" fill="var(--text-muted)" font-size="11">Action C</text>
          <text x="110" y="119" fill="#fff" font-size="10">Tool Crib Centralization</text>
          
          <defs>
            <linearGradient id="r1-blue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#0077b6"/><stop offset="100%" stop-color="#00b4d8"/></linearGradient>
          </defs>
        </svg>
      </div>
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
          <h4>Workforce Productivity Metrics (Shell Performance Framework)</h4>
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
          <input type="number" id="ans-wrenchTime" class="draft-sync" placeholder="Enter hours/week" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Net Economic Gain ($/Week)</label>
          <input type="text" id="ans-gain" class="draft-sync" placeholder="Enter gain $/week" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  2: {
    tips: `<strong>Round 2 Tips:</strong> Campaign scheduling reduces backlog hours required to 80 hours. 8 technicians working 10 hours each provide 80 hours capacity. Cost = (8 * $1,000) + $1,000 campaign fee = $9,000. Reactive requires 10 technicians at a cost of $10,000. Campaign is optimal. Correct answer: <strong>campaign, 8, $9,000</strong>.`,
    brief: `
      <h3>Round 2: Maintenance Backlog & Campaign Scheduling</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="22" fill="#fff" font-size="12" font-weight="600">Scheduling Efficiency Comparison</text>
          
          <text x="15" y="55" fill="#00b4d8" font-size="11" font-weight="bold">Campaign Scheduling:</text>
          <g transform="translate(170, 40)">
            <rect x="0" y="0" width="180" height="20" rx="3" fill="rgba(0, 180, 216, 0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="10" y="14" fill="#fff" font-size="9">Structured Campaign Execution</text>
          </g>

          <text x="15" y="105" fill="#00b4d8" font-size="11" font-weight="bold">Reactive Scheduling:</text>
          <g transform="translate(170, 90)">
            <rect x="0" y="0" width="180" height="20" rx="3" fill="rgba(0, 180, 216, 0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="10" y="14" fill="#fff" font-size="9">Ad-Hoc Troubleshooting</text>
          </g>
        </svg>
      </div>
      <p>The corrective maintenance backlog on Platform Bravo has escalated. Under the <strong>Shell Performance Framework</strong> (Workforce Scheduling Efficiency), we must plan a campaign to clear critical work orders. Select the scheduling method (Campaign vs. Reactive), the number of technicians to deploy, and calculate the total cost.</p>
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
          <input type="number" id="ans-techs" class="draft-sync" placeholder="Enter technicians" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Total Campaign Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter total cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  3: {
    tips: `<strong>Round 3 Tips:</strong> PM must start on Day 2 satisfies crane access (Days 1-2), process window (Days 2-3), and vendor availability (Day 2 ONLY). Total duration = 1-hour brief + 4-hour mechanical work + 1-hour clean-up = 6 hours. Correct answer: <strong>2, 6</strong>.`,
    brief: `
      <h3>Round 3: Preventive Maintenance (PM) Compliance & Execution</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="130" y="22" fill="var(--text-muted)" font-size="10">DAY 1</text>
          <text x="200" y="22" fill="var(--text-muted)" font-size="10">DAY 2</text>
          <text x="270" y="22" fill="var(--text-muted)" font-size="10">DAY 3</text>
          <text x="340" y="22" fill="var(--text-muted)" font-size="10">DAY 4</text>
          <text x="410" y="22" fill="var(--text-muted)" font-size="10">DAY 5</text>
          
          <text x="15" y="48" fill="var(--text-muted)" font-size="10">Crane Support</text>
          <rect x="115" y="38" width="120" height="14" rx="2" fill="rgba(0,180,216,0.25)" stroke="#00b4d8" stroke-width="1"/>
          
          <text x="15" y="78" fill="var(--text-muted)" font-size="10">Flow Isolation</text>
          <rect x="185" y="68" width="120" height="14" rx="2" fill="rgba(46,204,113,0.25)" stroke="#2ecc71" stroke-width="1"/>
          
          <text x="15" y="108" fill="var(--text-muted)" font-size="10">Vendor Flight</text>
          <rect x="185" y="98" width="50" height="14" rx="2" fill="rgba(243,156,18,0.25)" stroke="#f39c12" stroke-width="1"/>
        </svg>
      </div>
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
          <input type="number" id="ans-startDay" class="draft-sync" placeholder="Enter start day" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Total PM Duration (Hours)</label>
          <input type="number" id="ans-duration" class="draft-sync" placeholder="Enter duration in hours" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  4: {
    tips: `<strong>Round 4 Tips:</strong> PQI = 4 out of 5 steps completed = 80%. Actual Wrench Time = 10 hours planned * 80% = 8 hours. Material kits required = 5 valves * 1 kit/valve = 5 kits. Correct answer: <strong>80, 8, 5</strong>.`,
    brief: `
      <h3>Round 4: Planning & Preparation Quality (Plan Quality Index)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 130" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Plan Quality Index (PQI) Checklist Steps</text>
          
          <g transform="translate(15, 45)">
            <rect x="0" y="0" width="80" height="30" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="40" y="18" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Step 1</text>
            
            <rect x="90" y="0" width="80" height="30" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="130" y="18" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Step 2</text>
            
            <rect x="180" y="0" width="80" height="30" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="220" y="18" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Step 3</text>
            
            <rect x="270" y="0" width="80" height="30" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="310" y="18" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Step 4</text>
            
            <rect x="360" y="0" width="80" height="30" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="400" y="18" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Step 5</text>
          </g>
        </svg>
      </div>
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
          <input type="number" id="ans-pqi" class="draft-sync" placeholder="Enter PQI percentage" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Actual Wrench Time (Hours)</label>
          <input type="number" id="ans-wrenchTime" class="draft-sync" placeholder="Enter wrench time" oninput="syncDraftAnswers()">
        </div>
        <div class="input-group">
          <label>Material Kits to Prepare</label>
          <input type="number" id="ans-kits" class="draft-sync" placeholder="Enter material kits" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  5: {
    tips: `<strong>Round 5 Tips:</strong> Option A costs $50,000. Option B costs $25,000 + 5 * $12,000 = $85,000. Option C costs $25,000 + 5 * $2,000 = $35,000. Option C (Liability Transfer Sale) is optimal. Correct answer: <strong>C, $35,000</strong>.`,
    brief: `
      <h3>Round 5: Subsea Well Decommissioning Strategy (LLAM)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Decommissioning Options Evaluation</text>
          
          <g transform="translate(20, 45)">
            <rect x="0" y="0" width="140" height="60" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="70" y="25" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Option A</text>
            <text x="70" y="42" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">Immediate P&amp;A</text>
            
            <rect x="160" y="0" width="140" height="60" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="230" y="25" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Option B</text>
            <text x="230" y="42" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">5-Year Suspension</text>
            
            <rect x="320" y="0" width="140" height="60" rx="4" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="390" y="25" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Option C</text>
            <text x="390" y="42" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">Liability Transfer</text>
          </g>
        </svg>
      </div>
      <p>Under <strong>SCL Late Life Asset Decommissioning Guidelines (LLAD-05)</strong>, we must determine the most cost-efficient strategy for 5 subsea wells nearing their late-life stage. We have three main decommissioning options to evaluate: Option A (Immediate Plug & Abandonment), Option B (5-Year Wet Suspension), and Option C (Liability Transfer Sale). Compare the total expected costs and select the optimal strategy and calculate the total cost.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Well Count & Condition</h3>
        <div class="data-card">
          <h4>Subsea Well Portfolio</h4>
          <ul>
            <li><strong>Well Count:</strong> We have exactly <strong>5 subsea wells</strong> that must be decommissioned.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Decommissioning Options</h3>
        <div class="data-card alert">
          <h4>Options Description</h4>
          <ul>
            <li><strong>Option A (Immediate P&A):</strong> Seal the wells immediately. Costs $10,000 per well.</li>
            <li><strong>Option B (5-Year Suspension):</strong> Temporarily suspend the wells. Suspension cost is a flat $25,000 for the field, but future P&A costs will be $12,000 per well.</li>
            <li><strong>Option C (Liability Transfer):</strong> Sell the wells to a niche operator. Transaction cost is a flat $25,000, plus a liability transfer fee of $2,000 per well.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Decommissioning Regulatory Codes</h3>
        <div class="data-card danger">
          <h4>HSE Guidelines</h4>
          <ul>
            <li><strong>Compliance:</strong> All strategies must satisfy SCL Late Life Asset Decommissioning Guidelines (LLAD-05) to ensure structural integrity during decommissioning.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Logistics Mobilization</h3>
        <div class="data-card">
          <h4>Mobilization Constraints</h4>
          <ul>
            <li><strong>Option A:</strong> Requires heavy vessel mobilization (included in the $10,000/well cost).</li>
            <li><strong>Option B:</strong> Suspension prep includes monitoring equipment setup.</li>
            <li><strong>Option C:</strong> Requires legal and regulatory transfer approvals.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Decommissioning Ledger</h3>
        <div class="data-card">
          <h4>Total Cost Formulas</h4>
          <ul>
            <li><strong>Option A Cost:</strong> 5 wells * $10,000/well.</li>
            <li><strong>Option B Cost:</strong> $25,000 flat + (5 wells * $12,000/well).</li>
            <li><strong>Option C Cost:</strong> $25,000 flat + (5 wells * $2,000/well).</li>
            <li><em>Calculate the total cost of each strategy and submit the best Option (A, B, or C) and its total cost.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which decommissioning strategy is the most cost-efficient and optimal?",
        options: [
          "Immediate Plug & Abandonment (Option A)",
          "5-Year Wet Suspension (Option B)",
          "Liability Transfer Sale (Option C)"
        ]
      },
      q2: {
        text: "What is the total cost of the optimal decommissioning strategy?",
        options: [
          "$50,000",
          "$85,000",
          "$35,000",
          "$25,000"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Decommissioning Strategy</label>
          <select id="ans-strategy" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select strategy...</option>
            <option value="A">Option A (Immediate P&A)</option>
            <option value="B">Option B (5-Year Suspension)</option>
            <option value="C">Option C (Liability Transfer)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Total Decommissioning Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter total cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  6: {
    tips: `<strong>Round 6 Tips:</strong> Option A expected cost = $1,500. Option B expected cost = 50% * $5,000 = $2,500. Option C expected cost = $500 + 50% * $2,500 = $1,750. Option A (Local Stocking) is optimal. Correct answer: <strong>A, $1,500</strong>.`,
    brief: `
      <h3>Round 6: Turbine Bearing Spare Parts Logistics (MMS)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Material Logistics Configurations</text>
          <g transform="translate(20, 45)">
            <circle cx="50" cy="40" r="30" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="50" y="44" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">Local (A)</text>
            
            <circle cx="230" cy="40" r="30" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="230" y="44" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">Hub (B)</text>
            
            <circle cx="410" cy="40" r="30" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="410" y="44" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">Pool (C)</text>
          </g>
        </svg>
      </div>
      <p>Under <strong>SCL Material Management Standards (MMS-06)</strong>, we must determine the most cost-efficient strategy for storing a critical turbine bearing spare. We have three stocking configurations: Option A (Local Warehouse Stocking), Option B (Central Hub Ordering), and Option C (Shared Inventory Pool). Compare the total expected weekly costs (membership fees + expected downtime risk penalties) and select the optimal strategy and calculate the expected cost.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Turbine Downtime Impact</h3>
        <div class="data-card danger">
          <h4>Production Downtime Penalty</h4>
          <ul>
            <li><strong>Downtime Penalty:</strong> A turbine outage due to a missing bearing costs exactly <strong>$5,000 per week</strong> in lost production.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Warehouse Configurations</h3>
        <div class="data-card">
          <h4>Local Warehouse Stocking (Option A)</h4>
          <ul>
            <li><strong>Description:</strong> Stock the bearing in our own platform warehouse.</li>
            <li><strong>Holding Cost:</strong> $1,500/week holding cost.</li>
            <li><strong>Stockout Risk:</strong> 0% risk of stockout (immediate availability).</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Central Hub Ordering (Option B)</h3>
        <div class="data-card alert">
          <h4>Central Hub Logistics</h4>
          <ul>
            <li><strong>Description:</strong> Order from the central hub on demand.</li>
            <li><strong>Holding Cost:</strong> $0/week (stored at hub).</li>
            <li><strong>Stockout Risk:</strong> 50% probability of stockout per week due to transit delays.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Shared Inventory Pool (Option C)</h3>
        <div class="data-card">
          <h4>Shared Inventory Pool Details</h4>
          <ul>
            <li><strong>Description:</strong> Join a shared industry inventory pool.</li>
            <li><strong>Membership Fee:</strong> $500/week membership fee.</li>
            <li><strong>Downtime Risk:</strong> Expected downtime penalty under shared pool agreement is $2,500/week (50% probability of a $2,500 penalty).</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Material Cost Ledger</h3>
        <div class="data-card">
          <h4>Expected Cost Formulas</h4>
          <ul>
            <li><strong>Option A Expected Cost:</strong> $1,500 holding cost + 0% risk = $1,500.</li>
            <li><strong>Option B Expected Cost:</strong> 50% probability * $5,000 downtime penalty = $2,500.</li>
            <li><strong>Option C Expected Cost:</strong> $500 membership fee + (50% probability * $2,500 penalty) = $1,750.</li>
            <li><em>Submit: 1. Best Option (A, B, or C). 2. Expected weekly cost ($).</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which warehouse/logistics configuration is the most cost-efficient and optimal?",
        options: [
          "Local Warehouse Stocking (Option A)",
          "Central Hub Ordering (Option B)",
          "Shared Inventory Pool (Option C)"
        ]
      },
      q2: {
        text: "What is the expected weekly cost of the optimal warehouse configuration?",
        options: [
          "$1,500",
          "$2,500",
          "$1,750",
          "$0"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Warehouse Option</label>
          <select id="ans-option" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select option...</option>
            <option value="A">Option A (Local Stocking)</option>
            <option value="B">Option B (Central Hub)</option>
            <option value="C">Option C (Shared Pool)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Expected Weekly Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter expected cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  7: {
    tips: `<strong>Round 7 Tips:</strong> Option A expected cost = $10,000 + (1% * $100,000) = $11,000. Option B expected cost = $6,000 + (4% * $100,000) = $10,000. Option C expected cost = $1,000 + (16% * $100,000) = $17,000. Option B (Pulsed Eddy Current) is optimal. Correct answer: <strong>B, $10,000</strong>.`,
    brief: `
      <h3>Round 7: Piping Corrosion Inspection (NII)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Piping Inspection Techniques</text>
          <g transform="translate(10, 45)">
            <rect x="10" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="75" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">UT (A)</text>
            
            <rect x="170" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="235" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">PEC (B)</text>
            
            <rect x="330" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="395" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Visual (C)</text>
          </g>
        </svg>
      </div>
      <p>Under <strong>SCL Non-Intrusive Inspection (NII) guidelines</strong>, we must select the optimal inspection method for piping corrosion under insulation on Platform Bravo. We have three main strategies to evaluate: Option A (Manual Insulation Stripping & Ultrasonic Testing), Option B (Pulsed Eddy Current Inspection), and Option C (Visual Inspection Only). Compare the total expected costs (inspection costs + expected risk penalties) and select the optimal strategy and calculate the expected cost.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Ultrasonic Testing (Option A)</h3>
        <div class="data-card">
          <h4>Option A Details</h4>
          <ul>
            <li><strong>Description:</strong> Strip insulation manually and perform UT.</li>
            <li><strong>Inspection Cost:</strong> $10,000 inspection fee.</li>
            <li><strong>Risk of Leak:</strong> 1% remaining risk of undetected corrosion.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Pulsed Eddy Current (Option B)</h3>
        <div class="data-card alert">
          <h4>Option B Details</h4>
          <ul>
            <li><strong>Description:</strong> Scan through insulation using Pulsed Eddy Current.</li>
            <li><strong>Inspection Cost:</strong> $6,000 inspection fee.</li>
            <li><strong>Risk of Leak:</strong> 4% remaining risk of undetected corrosion.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Visual Inspection (Option C)</h3>
        <div class="data-card danger">
          <h4>Option C Details</h4>
          <ul>
            <li><strong>Description:</strong> External visual inspection only (no insulation removal).</li>
            <li><strong>Inspection Cost:</strong> $1,000 inspection fee.</li>
            <li><strong>Risk of Leak:</strong> 16% remaining risk of undetected corrosion.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Leak Risk Penalties</h3>
        <div class="data-card">
          <h4>Environmental & Safety Penalty</h4>
          <ul>
            <li><strong>Leak Penalty:</strong> A piping leak results in production shutdown and environmental cleanup costing exactly <strong>$100,000</strong>.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Inspection Ledger</h3>
        <div class="data-card">
          <h4>Expected Cost Formulas</h4>
          <ul>
            <li><strong>Total Expected Cost:</strong> Inspection Cost + (Risk % * $100,000).</li>
            <li><strong>Option A:</strong> $10,000 + (1% * $100,000) = $11,000.</li>
            <li><strong>Option B:</strong> $6,000 + (4% * $100,000) = $10,000.</li>
            <li><strong>Option C:</strong> $1,000 + (16% * $100,000) = $17,000.</li>
            <li><em>Submit the best Option (A, B, or C) and its total expected cost.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which piping corrosion inspection method is the most cost-efficient and optimal?",
        options: [
          "Manual Stripping & UT (Option A)",
          "Pulsed Eddy Current (Option B)",
          "Visual Inspection Only (Option C)"
        ]
      },
      q2: {
        text: "What is the expected total cost of the optimal inspection strategy?",
        options: [
          "$11,000",
          "$10,000",
          "$17,000",
          "$6,000"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Inspection Strategy</label>
          <select id="ans-strategy" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select strategy...</option>
            <option value="A">Option A (Manual UT)</option>
            <option value="B">Option B (Pulsed Eddy Current)</option>
            <option value="C">Option C (Visual Only)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Expected Total Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter expected cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  8: {
    tips: `<strong>Round 8 Tips:</strong> PFD limit is <= 0.015. 12-Month interval fails safety criteria (PFD 0.020). 6-Month interval has PFD 0.010 (compliant). 3-Month interval has PFD 0.005 (compliant). Longest compliant interval is 6-Month. Annual cost = 2 tests * $2,000 = $4,000. Correct answer: <strong>6-Month, $4,000</strong>.`,
    brief: `
      <h3>Round 8: ESD Valve Testing Interval (Safety Critical Elements)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Testing Intervals &amp; PFD Comparison</text>
          <g transform="translate(10, 45)">
            <rect x="10" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="75" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">12-Month (B)</text>
            
            <rect x="170" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="235" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">6-Month (A)</text>
            
            <rect x="330" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="395" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">3-Month (C)</text>
          </g>
        </svg>
      </div>
      <p>Under <strong>SCL Safety Critical System integrity protocols</strong>, we must balance testing frequency against compliance limits. The platform Emergency Shutdown (ESD) valve must maintain a Probability of Failure on Demand (PFD) of 0.015 or lower to remain compliant. We have three testing intervals: 3-Month, 6-Month, and 12-Month. Select the longest testing interval that remains regulatory-compliant, and calculate its total annual testing cost.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] ESD Valve Reliability</h3>
        <div class="data-card danger">
          <h4>Regulatory PFD Threshold</h4>
          <ul>
            <li><strong>PFD Limit:</strong> The regulatory safety ceiling requires a PFD of **&le; 0.015** (compliant). Any PFD above 0.015 is non-compliant.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] PFD by Testing Interval</h3>
        <div class="data-card">
          <h4>Testing Intervals & PFD Rates</h4>
          <ul>
            <li><strong>12-Month Testing (Option B):</strong> Results in a PFD of <strong>0.020</strong>.</li>
            <li><strong>6-Month Testing (Option A):</strong> Results in a PFD of <strong>0.010</strong>.</li>
            <li><strong>3-Month Testing (Option C):</strong> Results in a PFD of <strong>0.005</strong>.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Safety critical standards</h3>
        <div class="data-card alert">
          <h4>Compliance Check</h4>
          <ul>
            <li><strong>Compliance Rule:</strong> Non-compliant options (PFD > 0.015) are prohibited. Among compliant options, we must select the longest interval to minimize unnecessary intervention risk.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] Valve Mobilization Logistics</h3>
        <div class="data-card">
          <h4>Unit Testing Cost</h4>
          <ul>
            <li><strong>Testing Fee:</strong> Each valve testing operation costs exactly <strong>$2,000</strong> in technicians and specialized equipment mobilization.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Annual Testing Budgets</h3>
        <div class="data-card">
          <h4>Annual Cost Calculations</h4>
          <ul>
            <li><strong>12-Month (Option B):</strong> 1 test/year * $2,000 = $2,000.</li>
            <li><strong>6-Month (Option A):</strong> 2 tests/year * $2,000 = $4,000.</li>
            <li><strong>3-Month (Option C):</strong> 4 tests/year * $2,000 = $8,000.</li>
            <li><em>Determine the longest compliant interval and submit the Interval (e.g. 6-Month) and its annual cost.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which testing interval is the most cost-effective compliant testing frequency?",
        options: [
          "3-Month Interval (Option C)",
          "6-Month Interval (Option A)",
          "12-Month Interval (Option B)"
        ]
      },
      q2: {
        text: "What is the total annual testing cost of the selected compliant interval?",
        options: [
          "$4,000",
          "$2,000",
          "$8,000",
          "$0"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Testing Interval</label>
          <select id="ans-interval" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select interval...</option>
            <option value="3-Month">3-Month Interval (Option C)</option>
            <option value="6-Month">6-Month Interval (Option A)</option>
            <option value="12-Month">12-Month Interval (Option B)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Annual Testing Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter annual cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  9: {
    tips: `<strong>Round 9 Tips:</strong> Option A expected cost = $3,000 + (2% * $100,000) = $5,000. Option B expected cost = $1,000 + (10% * $100,000) = $11,000. Option C expected cost = $0 + (15% * $100,000) = $15,000. Option A (Simulator-Based) is optimal. Correct answer: <strong>A, $5,000</strong>.`,
    brief: `
      <h3>Round 9: Operator Competency & Flaring Prevention (Operations Excellence)</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 500 150" style="width: 100%; max-width: 500px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <text x="15" y="25" fill="#fff" font-size="12" font-weight="600">Training Program Configurations</text>
          <g transform="translate(10, 45)">
            <rect x="10" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="75" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Simulator (A)</text>
            
            <rect x="170" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="235" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Classroom (B)</text>
            
            <rect x="330" y="10" width="130" height="50" rx="3" fill="rgba(0,180,216,0.15)" stroke="#00b4d8" stroke-width="1"/>
            <text x="395" y="40" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">Mentoring (C)</text>
          </g>
        </svg>
      </div>
      <p>Under <strong>SCL Environmental Performance standards</strong>, we must minimize greenhouse gas emissions and flaring events. We are evaluating three training configurations for control room operators to prevent accidental flaring: Option A (Simulator-Based Training), Option B (Classroom Lecture), and Option C (On-the-Job Mentoring). Compare the total expected costs (training cost + expected environmental flaring penalties) and select the optimal training method and calculate its total expected cost.</p>
    `,
    roles: {
      SE: `
        <h3>[SE] Flaring Penalty</h3>
        <div class="data-card danger">
          <h4>Environmental Fine</h4>
          <ul>
            <li><strong>Flaring Penalty:</strong> A reportable flaring event results in environmental penalties and shutdown costs totaling exactly <strong>$100,000</strong>.</li>
          </ul>
        </div>
      `,
      PE: `
        <h3>[PE] Simulator Training (Option A)</h3>
        <div class="data-card">
          <h4>Option A Details</h4>
          <ul>
            <li><strong>Description:</strong> Immersive simulator training.</li>
            <li><strong>Training Cost:</strong> $3,000 per operator crew.</li>
            <li><strong>Flare Probability:</strong> 2% probability of a flaring event per year.</li>
          </ul>
        </div>
      `,
      HSE: `
        <h3>[HSE] Classroom Training (Option B)</h3>
        <div class="data-card alert">
          <h4>Option B Details</h4>
          <ul>
            <li><strong>Description:</strong> Traditional classroom safety training.</li>
            <li><strong>Training Cost:</strong> $1,000 per operator crew.</li>
            <li><strong>Flare Probability:</strong> 10% probability of a flaring event per year.</li>
          </ul>
        </div>
      `,
      LSC: `
        <h3>[LSC] On-the-Job Mentoring (Option C)</h3>
        <div class="data-card">
          <h4>Option C Details</h4>
          <ul>
            <li><strong>Description:</strong> Peer-to-peer mentoring.</li>
            <li><strong>Training Cost:</strong> $0 cost.</li>
            <li><strong>Flare Probability:</strong> 15% probability of a flaring event per year.</li>
          </ul>
        </div>
      `,
      FA: `
        <h3>[FA] Training Ledger</h3>
        <div class="data-card">
          <h4>Expected Cost Formulas</h4>
          <ul>
            <li><strong>Total Expected Cost:</strong> Training Cost + (Flare Probability * $100,000).</li>
            <li><strong>Option A Expected Cost:</strong> $3,000 + (2% * $100,000) = $5,000.</li>
            <li><strong>Option B Expected Cost:</strong> $1,000 + (10% * $100,000) = $11,000.</li>
            <li><strong>Option C Expected Cost:</strong> $0 + (15% * $100,000) = $15,000.</li>
            <li><em>Submit the best Option (A, B, or C) and its total expected cost.</em></li>
          </ul>
        </div>
      `
    },
    objectiveQuestions: {
      q1: {
        text: "Which training method is the most cost-efficient and optimal?",
        options: [
          "Simulator-Based (Option A)",
          "Classroom Lecture (Option B)",
          "On-the-Job Mentoring (Option C)"
        ]
      },
      q2: {
        text: "What is the expected total cost of the optimal training strategy?",
        options: [
          "$5,000",
          "$11,000",
          "$15,000",
          "$3,000"
        ]
      }
    },
    inputs: `
      <div class="dynamic-form-wrap">
        <div class="input-group">
          <label>Training Method</label>
          <select id="ans-method" class="draft-sync" onchange="syncDraftAnswers()">
            <option value="" disabled selected>Select method...</option>
            <option value="A">Option A (Simulator)</option>
            <option value="B">Option B (Classroom)</option>
            <option value="C">Option C (Mentoring)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Expected Total Cost ($)</label>
          <input type="text" id="ans-cost" class="draft-sync" placeholder="Enter expected cost" oninput="syncDraftAnswers()">
        </div>
      </div>
    `
  },
  10: {
    tips: `<strong>Round 10 Tips:</strong> The correct chronological order of the 8 SCL Maintenance Execution Cycle steps is: 1. Identify & Define, 2. Approve & Prioritize, 3. Plan & Prepare, 4. Schedule & Align, 5. Permit & Authorize, 6. Execute & Monitor, 7. Close & Document, 8. Review & Improve.`,
    brief: `
      <h3>Tie-Breaker: SCL Maintenance Execution Cycle</h3>
      <div class="round-graphic" style="margin: 15px 0; text-align: center;">
        <svg viewBox="0 0 580 115" style="width: 100%; max-width: 580px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-family: var(--font-mono), monospace;">
          <g transform="translate(15, 12)">
            <rect x="0" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="57" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Plan &amp; Prepare</text>
            <text x="57" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 120,16 L 135,16" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#arrow)"/>
            
            <rect x="140" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="197" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Close &amp; Document</text>
            <text x="197" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 260,16 L 275,16" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#arrow)"/>
            
            <rect x="280" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="337" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Identify &amp; Define</text>
            <text x="337" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 400,16 L 415,16" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#arrow)"/>
            
            <rect x="420" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="477" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Execute &amp; Monitor</text>
            <text x="477" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
          </g>

          <path d="M 525,48 L 525,64" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#arrow-down)"/>

          <g transform="translate(15, 68)">
            <rect x="0" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="57" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Review &amp; Improve</text>
            <text x="57" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 135,16 L 122,16" stroke="var(--text-muted)" stroke-width="1.5" marker-start="url(#arrow-left)"/>
            
            <rect x="140" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="197" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Approve &amp; Prioritize</text>
            <text x="197" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 275,16 L 262,16" stroke="var(--text-muted)" stroke-width="1.5" marker-start="url(#arrow-left)"/>
            
            <rect x="280" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="337" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Permit &amp; Authorize</text>
            <text x="337" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
            
            <path d="M 415,16 L 402,16" stroke="var(--text-muted)" stroke-width="1.5" marker-start="url(#arrow-left)"/>
            
            <rect x="420" y="0" width="115" height="32" rx="4" fill="rgba(0,180,216,0.1)" stroke="#00b4d8" stroke-width="1"/>
            <text x="477" y="15" fill="#00b4d8" font-size="9" font-weight="bold" text-anchor="middle">Schedule &amp; Align</text>
            <text x="477" y="25" fill="var(--text-muted)" font-size="7.5" text-anchor="middle">Step Choice</text>
          </g>
          
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="var(--text-muted)"/>
            </marker>
            <marker id="arrow-down" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="90">
              <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="var(--text-muted)"/>
            </marker>
            <marker id="arrow-left" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="180">
              <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="var(--text-muted)"/>
            </marker>
          </defs>
        </svg>
      </div>
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
        text: "Which of the following represents the first step of the SCL Maintenance Execution Cycle?",
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
  const savedTheme = localStorage.getItem('game-theme') || 'dark';
  applyTheme(savedTheme);
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
    if (confirm("Are you sure you want to initialize the simulation?")) {
      socket.emit('start-game');
    }
  });
  document.getElementById('btn-fac-start-timer').addEventListener('click', () => {
    if (confirm("Are you sure you want to start/resume the round timer?")) {
      socket.emit('start-round-timer');
    }
  });
  document.getElementById('btn-fac-pause-timer').addEventListener('click', () => {
    if (confirm("Are you sure you want to pause the round timer?")) {
      socket.emit('pause-round-timer');
    }
  });
  document.getElementById('btn-fac-end-round').addEventListener('click', () => {
    if (confirm("Are you sure you want to force end the current round?")) {
      socket.emit('end-round');
    }
  });
  document.getElementById('btn-fac-next-round').addEventListener('click', () => {
    if (confirm("Are you sure you want to proceed to the next round?")) {
      socket.emit('next-round');
    }
  });
  document.getElementById('fac-puzzle-mode').addEventListener('change', (e) => {
    const newVal = e.target.value;
    if (confirm(`Are you sure you want to change puzzle mode to ${newVal.toUpperCase()}?`)) {
      lastPuzzleModeVal = newVal;
      socket.emit('set-puzzle-mode', newVal);
    } else {
      e.target.value = lastPuzzleModeVal;
    }
  });
  document.getElementById('btn-fac-reset').addEventListener('click', () => {
    if (confirm("Reset the entire simulation? Scores and connections will clear.")) {
      socket.emit('reset-game');
    }
  });
  document.getElementById('btn-fac-exit').addEventListener('click', () => {
    if (confirm("Are you sure you want to exit the facilitator console?")) {
      window.location.reload();
    }
  });

  document.getElementById('btn-adjust-score').addEventListener('click', () => {
    const teamId = document.getElementById('adjust-team').value;
    const val = parseInt(document.getElementById('adjust-amount').value, 10);
    if (!isNaN(val)) {
      if (confirm(`Are you sure you want to adjust Team ${teamId.toUpperCase()}'s score by ${val}?`)) {
        socket.emit('adjust-score', { teamId, adjustment: val });
        document.getElementById('adjust-amount').value = '';
      }
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

  // Facilitator manuals reference selector changes
  document.getElementById('fac-ref-round').addEventListener('change', updateFacilitatorManualRef);
  document.getElementById('fac-ref-role').addEventListener('change', updateFacilitatorManualRef);

  document.getElementById('fac-final-round').addEventListener('change', (e) => {
    const newVal = parseInt(e.target.value, 10);
    if (confirm(`Are you sure you want to set the Final Normal Round to Round ${newVal}?`)) {
      lastFinalRoundVal = newVal;
      socket.emit('set-final-round', newVal);
    } else {
      e.target.value = lastFinalRoundVal;
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
      myRole = role;
      myTeam = teamId;
      myName = name;
      isLeader = (role === 'FA');

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

      if (updateGlobalState.lastState) {
        updateGlobalState(updateGlobalState.lastState);
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

  // Update timer displays immediately from state.timer
  const timeStr = formatTime(state.timer || 0);
  if (document.getElementById('player-timer')) {
    document.getElementById('player-timer').innerText = timeStr;
  }
  if (document.getElementById('fac-timer')) {
    document.getElementById('fac-timer').innerText = timeStr;
  }

  // If in Player Screen
  if (myRole && myRole !== 'facilitator') {
    updatePlayerView(state);
  }

  // If in Facilitator Screen
  if (myRole === 'facilitator') {
    updateFacilitatorView(state);
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

let countdownInterval = null;
let lastStartingCountdown = false;

function handleCountdownOverlay(startingCountdown) {
  const overlay = document.getElementById('countdown-overlay');
  const numberEl = document.getElementById('countdown-number');
  if (!overlay || !numberEl) return;

  if (startingCountdown) {
    if (!lastStartingCountdown) {
      // Trigger new countdown
      overlay.classList.remove('hidden');
      let count = 5;
      numberEl.innerText = count;
      
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          numberEl.innerText = count;
        } else if (count === 0) {
          numberEl.innerText = "START!";
        } else {
          clearInterval(countdownInterval);
          overlay.classList.add('hidden');
        }
      }, 1000);
    }
  } else {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    overlay.classList.add('hidden');
  }
  lastStartingCountdown = startingCountdown;
}

function updateScoringDashboard(state) {
  if (!myTeam || !state.teams) return;

  const team = state.teams[myTeam];
  if (!team) return;

  // Update Score
  const scoreEl = document.getElementById('dash-team-score');
  if (scoreEl) scoreEl.innerText = team.score;

  // Calculate Rank (taking ties into account)
  const sortedTeams = Object.values(state.teams).sort((a, b) => b.score - a.score);
  let rank = 1;
  for (let i = 0; i < sortedTeams.length; i++) {
    if (sortedTeams[i].score > team.score) {
      rank++;
    }
  }
  
  // Format rank with ordinal indicator: 1st, 2nd, 3rd, 4th
  let ordinal = 'th';
  if (rank === 1) ordinal = 'st';
  else if (rank === 2) ordinal = 'nd';
  else if (rank === 3) ordinal = 'rd';

  const rankEl = document.getElementById('dash-team-rank');
  if (rankEl) rankEl.innerHTML = `${rank}<span style="font-size: 1.2rem; vertical-align: top;">${ordinal}</span>`;
}

// Update Player Panel
function updatePlayerView(state) {
  const team = state.teams[myTeam];
  const roundNum = state.currentRound;

  // Update scoring dashboard
  updateScoringDashboard(state);

  // Handle countdown overlay
  handleCountdownOverlay(state.startingCountdown);

  // Handle pause overlay visibility
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    if (state.status === 'active' && !state.timerActive && state.timer > 0) {
      pauseOverlay.classList.remove('hidden');
    } else {
      pauseOverlay.classList.add('hidden');
    }
  }

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

    // Initialize sequence array if Round 10 and standard mode
    if (roundNum === 10) {
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
  } else if (!state.timerActive) {
    statusBox.className = "status-box status-idle";
    statusBox.style.flexDirection = "";
    statusBox.style.alignItems = "";
    statusText.innerText = "System Awaiting Authorization... (Timer Paused)";
  } else {
    statusBox.className = "status-box status-active";
    statusBox.style.flexDirection = "";
    statusBox.style.alignItems = "";
    statusText.innerText = "CALIBRATION TERMINALS ACTIVE. Awaiting inputs...";
  }

  updateSubmitButtonState();

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
  if (activeRound === 10 && puzzleMode === 'standard') {
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
  if (activeRound === 10 && puzzleMode === 'standard') {
    socket.emit('update-draft-answers', { sequence: currentSequence });
    return;
  }

  const drafts = gatherFormAnswers();
  socket.emit('update-draft-answers', drafts);
  updateSubmitButtonState();
}

// Populate draft edits from socket updates
function populateDraftAnswers(drafts) {
  if (!drafts) return;
  
  const puzzleMode = (updateGlobalState.lastState ? updateGlobalState.lastState.puzzleMode : 'standard');
  if (activeRound === 10 && puzzleMode === 'standard' && drafts.sequence) {
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
  updateSubmitButtonState();
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
    if (roundNum === 10) {
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
  document.getElementById('fac-current-round').innerText = state.currentRound === 10 ? "TIE-BREAKER" : `Round ${state.currentRound}`;

  const modeSelector = document.getElementById('fac-puzzle-mode');
  if (modeSelector) {
    modeSelector.value = state.puzzleMode;
    lastPuzzleModeVal = state.puzzleMode;
    const canChangeMode = (state.status === 'lobby' || state.status === 'end_round' || (state.status === 'active' && state.timer === 0 && !state.timerActive));
    modeSelector.disabled = !canChangeMode;
  }

  const finalRoundSelector = document.getElementById('fac-final-round');
  if (finalRoundSelector) {
    if (state.finalRound !== undefined) {
      finalRoundSelector.value = state.finalRound;
      lastFinalRoundVal = state.finalRound;
    }
    finalRoundSelector.disabled = (state.status !== 'lobby');
  }

  const tipsContent = document.getElementById('fac-tips-content');
  if (tipsContent) {
    tipsContent.innerHTML = roundsData[state.currentRound]?.tips || '<p>No specific tips for this round.</p>';
  }

  // Enable/Disable admin buttons appropriately
  document.getElementById('btn-fac-start-timer').disabled = (state.status !== 'active' || state.timerActive);
  document.getElementById('btn-fac-pause-timer').disabled = (!state.timerActive);
  document.getElementById('btn-fac-end-round').disabled = (state.status !== 'active');
  document.getElementById('btn-fac-next-round').disabled = (state.status !== 'end_round');

  // Update Leaderboard tanks dynamically sorted descending
  const leaderboardContainer = document.getElementById('fac-leaderboard-bars');
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

  // Auto-sync manuals reference round to current active round on round change
  const refRoundSelect = document.getElementById('fac-ref-round');
  if (refRoundSelect && refRoundSelect.dataset.lastAutoSync !== String(state.currentRound)) {
    refRoundSelect.value = state.currentRound;
    refRoundSelect.dataset.lastAutoSync = state.currentRound;
    updateFacilitatorManualRef();
  }
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
  2: { title: "Round 2: Maintenance Backlog & Campaigns" },
  3: { title: "Round 3: PM Compliance & Execution" },
  4: { title: "Round 4: Planning Quality Index (PQI)" },
  5: { title: "Round 5: Subsea Well Decommissioning" },
  6: { title: "Round 6: Turbine Bearing Spares (MMS)" },
  7: { title: "Round 7: Piping Corrosion Inspection" },
  8: { title: "Round 8: ESD Valve Testing Intervals" },
  9: { title: "Round 9: Operator Competency & Flaring" },
  10: { title: "Tie-Breaker: SCL Maintenance Execution Cycle" }
};

function generateObjectiveFormHtml(roundNum) {
  const data = roundsData[roundNum];
  if (!data || !data.objectiveQuestions) return '<p>No questions configured for this round.</p>';
  
  const q1 = data.objectiveQuestions.q1;
  const q2 = data.objectiveQuestions.q2;
  
  let html = `
    <div class="objective-form-wrap" style="display: flex; flex-direction: column; gap: 20px; text-align: left;">
      <div class="input-group">
        <label style="font-weight: 600; display: block; margin-bottom: 10px; font-size: 0.95rem; color: var(--text-strong);">
          Question 1: ${q1.text}
        </label>
        <div class="objective-options" style="display: flex; flex-direction: column; gap: 10px;">
  `;
  
  q1.options.forEach((opt, idx) => {
    html += `
      <label class="radio-option-lbl">
        <input type="radio" name="ans-q1" id="ans-q1-${idx}" value="${idx}" class="draft-sync" onchange="syncDraftAnswers()" style="margin-top: 3px; cursor: pointer;">
        <span>${opt}</span>
      </label>
    `;
  });
  
  html += `
        </div>
      </div>
      <div class="input-group">
        <label style="font-weight: 600; display: block; margin-bottom: 10px; font-size: 0.95rem; color: var(--text-strong);">
          Question 2: ${q2.text}
        </label>
        <div class="objective-options" style="display: flex; flex-direction: column; gap: 10px;">
  `;
  
  q2.options.forEach((opt, idx) => {
    html += `
      <label class="radio-option-lbl">
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

// Update the disabled state of the submit button based on current selections and game state
function updateSubmitButtonState() {
  const submitBtn = document.getElementById('btn-submit-answer');
  if (!submitBtn) return;

  const state = updateGlobalState.lastState;
  if (!state) return;

  const team = state.teams[myTeam];
  const roundNum = state.currentRound;
  const status = team ? (team.roundStatus[roundNum] || { solved: false }) : { solved: false };

  if (status.solved || !state.timerActive) {
    submitBtn.disabled = true;
    return;
  }

  if (!isLeader) {
    submitBtn.disabled = true;
    return;
  }

  if (state.puzzleMode === 'objective') {
    const q1Checked = document.querySelector('input[name="ans-q1"]:checked');
    const q2Checked = document.querySelector('input[name="ans-q2"]:checked');
    submitBtn.disabled = !(q1Checked && q2Checked);
  } else {
    submitBtn.disabled = false;
  }
}

// Update facilitator manuals reference deck content
function updateFacilitatorManualRef() {
  const roundSelect = document.getElementById('fac-ref-round');
  const roleSelect = document.getElementById('fac-ref-role');
  const contentDiv = document.getElementById('fac-ref-manual-content');
  if (!roundSelect || !roleSelect || !contentDiv) return;

  const round = parseInt(roundSelect.value, 10);
  const role = roleSelect.value;
  if (roundsData[round] && roundsData[round].roles) {
    contentDiv.innerHTML = roundsData[round].roles[role] || '<p>No specific manual for this role.</p>';
  }
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



