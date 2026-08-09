/**
 * Polyhouse Growing Yield & Efficiency ERP - Core Application Engine
 */

// Application State
let appState = {
  settings: {
    rows: 19,
    linesPerRow: 2,
    towersPerLine: 63,
    rows1to7Holders: 10,
    rows1to7PlantsPerHolder: 4,
    rows8to19Holders: 15,
    rows8to19PlantsPerHolder: 4,
    trayCapacity: 40,
    seedGerminationDays: 25,
    saplingGerminationDays: 9,
    transplantToShendaDays: 15,
    harvestIntervalDays: 25,
    totalHarvests: 3,
    defaultExpectedYieldPerPlant: 0.15, // kg
    cropCatalog: ["Basil", "Mint", "Oregano", "Coriander", "Centella"],
    supabaseUrl: "",
    supabaseKey: "",
    whatsappPhone: "",
    publicUrl: "",
    employeeCatalog: ["Divyesh", "Satyam", "Anuj"]
  },
  sowingLogs: [],
  transplantLogs: [],
  harvestLogs: [],
  clearLogs: []
};

// Charts Instantiation
let yieldChart = null;
let efficiencyChart = null;

// Temporary holder for parsed WhatsApp logs
let tempParsedLogs = [];

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  setupNavigation();
  setupFormHandlers();
  setupSettingsHandlers();
  setupCloudSettings();
  renderDashboard();
  renderLogs();
  renderAnalytics();
  renderSettings();
  startLiveClock();
  syncWithCloud(); // Initial sync fetch
  setInterval(syncWithCloud, 20000); // Auto-sync every 20 seconds in background
});

// 1. STATE & STORAGE MANAGEMENT
function initStorage() {
  const stored = localStorage.getItem("polyhouse_erp_state");
  if (stored) {
    try {
      appState = JSON.parse(stored);
      // Ensure cloud settings structure exists
      let needsSave = false;
      if (!appState.settings.supabaseUrl) { appState.settings.supabaseUrl = ""; needsSave = true; }
      if (!appState.settings.supabaseKey) { appState.settings.supabaseKey = ""; needsSave = true; }
      if (!appState.settings.whatsappPhone) { appState.settings.whatsappPhone = ""; needsSave = true; }
      if (!appState.settings.publicUrl) { appState.settings.publicUrl = ""; needsSave = true; }
      if (!appState.settings.employeeCatalog) { 
        appState.settings.employeeCatalog = ["Divyesh", "Satyam", "Anuj"]; 
        needsSave = true; 
      }
      
      // Auto-migrate old default catalogs if they are still matching placeholders
      if (appState.settings.cropCatalog && appState.settings.cropCatalog.includes("Romaine Lettuce")) {
        appState.settings.cropCatalog = ["Basil", "Mint", "Oregano", "Coriander", "Centella"];
        needsSave = true;
      }
      if (appState.settings.employeeCatalog && appState.settings.employeeCatalog.includes("John")) {
        appState.settings.employeeCatalog = ["Divyesh", "Satyam", "Anuj"];
        needsSave = true;
      }
      
      if (needsSave) {
        localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
      }
      showToast("Data loaded and migrated from browser memory.", "success");
    } catch (e) {
      console.error("Error reading localStorage, resetting to default config", e);
      saveState();
    }
  } else {
    // Generate default empty but configured state
    saveState();
  }
}

function saveState() {
  localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
  // Background cloud synchronization
  if (appState.settings.supabaseUrl && appState.settings.supabaseKey) {
    syncWithCloud();
  }
}

function loadDemoData() {
  if (confirm("Are you sure you want to load mock data? This will overwrite your current logs.")) {
    const currentSettings = JSON.parse(JSON.stringify(appState.settings)); // Deep copy settings
    appState = DemoDataGenerator.generate();
    appState.settings = currentSettings; // Restore settings
    saveState();
    refreshAll();
    showToast("Realistic historical demo data loaded successfully!", "success");
  }
}

function clearAllData() {
  if (confirm("WARNING: This will permanently delete all logs and resets the layout parameters. Proceed?")) {
    localStorage.removeItem("polyhouse_erp_state");
    location.reload();
  }
}

function refreshAll() {
  renderDashboard();
  renderLogs();
  renderAnalytics();
  renderSettings();
}

// 2. LIVE METRICS & DATE CALCULATION ENGINE
function getLineCapacity(row) {
  const rowNum = parseInt(row);
  const towers = appState.settings.towersPerLine;
  const holders = rowNum <= 7 ? appState.settings.rows1to7Holders : appState.settings.rows8to19Holders;
  const pph = rowNum <= 7 ? appState.settings.rows1to7PlantsPerHolder : appState.settings.rows8to19PlantsPerHolder;
  return towers * holders * pph;
}

function getGerminationPeriod(type) {
  return type === "seed" 
    ? parseInt(appState.settings.seedGerminationDays) 
    : parseInt(appState.settings.saplingGerminationDays);
}

// Compute dynamic line state
function getLineState(row, line) {
  // Check if there is an active transplant log for this row/line
  const activeTx = appState.transplantLogs.find(tx => tx.row === row && tx.line === line && tx.status === "active");
  if (!activeTx) {
    return { status: "empty", label: "Empty", colorClass: "state-empty", data: null };
  }

  // Find all harvest operations for this specific transplant log
  const harvests = appState.harvestLogs.filter(h => h.transplantLogId === activeTx.id);
  const shendaCut = harvests.find(h => h.stage === "Shenda");
  
  // Count commercial harvests
  const commHarvestsCount = harvests.filter(h => h.stage.startsWith("Harvest")).length;
  
  const today = new Date();
  const txDate = new Date(activeTx.date);
  
  // 1. Shenda phase
  if (!shendaCut) {
    const shendaDueDate = new Date(txDate);
    shendaDueDate.setDate(shendaDueDate.getDate() + parseInt(appState.settings.transplantToShendaDays));
    
    if (today >= shendaDueDate) {
      return { 
        status: "ready-shenda", 
        label: "Ready for Shenda", 
        colorClass: "state-ready", 
        data: activeTx, 
        dueDate: shendaDueDate,
        nextStage: "Shenda"
      };
    } else {
      const daysLeft = Math.ceil((shendaDueDate - today) / (1000 * 60 * 60 * 24));
      return { 
        status: "transplanted", 
        label: `Transplanted (${daysLeft}d to Shenda)`, 
        colorClass: "state-transplanted", 
        data: activeTx 
      };
    }
  }
  
  // 2. Commercial harvest phases
  let lastEventDate = new Date(shendaCut.date);
  let currentStageNumber = commHarvestsCount + 1; // Stage we are heading towards (1, 2, or 3)
  
  // If some harvests were already logged, baseline off the last harvest date
  if (commHarvestsCount > 0) {
    const loggedHarvests = harvests.filter(h => h.stage.startsWith("Harvest")).sort((a,b) => new Date(a.date) - new Date(b.date));
    lastEventDate = new Date(loggedHarvests[loggedHarvests.length - 1].date);
  }
  
  if (currentStageNumber <= parseInt(appState.settings.totalHarvests)) {
    const harvestDueDate = new Date(lastEventDate);
    harvestDueDate.setDate(harvestDueDate.getDate() + parseInt(appState.settings.harvestIntervalDays));
    
    const stageLabel = `Harvest ${currentStageNumber}`;
    
    if (today >= harvestDueDate) {
      return { 
        status: `ready-harvest-${currentStageNumber}`, 
        label: `Ready for ${stageLabel}`, 
        colorClass: "state-ready", 
        data: activeTx, 
        dueDate: harvestDueDate,
        nextStage: stageLabel
      };
    } else {
      const daysLeft = Math.ceil((harvestDueDate - today) / (1000 * 60 * 60 * 24));
      const prevStageLabel = commHarvestsCount === 0 ? "Shenda Done" : `Harvest ${commHarvestsCount} Done`;
      
      // Select appropriate color representation
      let cClass = "state-shenda";
      if (commHarvestsCount === 1) cClass = "state-harvest1";
      if (commHarvestsCount === 2) cClass = "state-harvest2";
      
      return { 
        status: `growing-h${currentStageNumber}`, 
        label: `${prevStageLabel} (${daysLeft}d to H${currentStageNumber})`, 
        colorClass: cClass, 
        data: activeTx 
      };
    }
  }
  
  // 3. Fully harvested - awaiting clearance
  return { 
    status: "harvest-completed", 
    label: "3 Harvests Completed (Ready to Clear)", 
    colorClass: "state-harvest3", 
    data: activeTx 
  };
}

// Dynamic Trend Engine
function getAvgHistoricalYieldPerPlant(crop, stage) {
  // Find completed/logged harvests for this crop and stage
  const matchingHarvests = appState.harvestLogs.filter(h => h.crop === crop && h.stage === stage);
  if (matchingHarvests.length === 0) {
    return parseFloat(appState.settings.defaultExpectedYieldPerPlant);
  }
  
  let totalYield = 0;
  let totalPlants = 0;
  
  matchingHarvests.forEach(h => {
    // Find the corresponding transplant log
    const tx = appState.transplantLogs.find(t => t.id === h.transplantLogId);
    if (tx) {
      totalYield += h.yieldKg;
      totalPlants += tx.plantsPlanted;
    }
  });
  
  return totalPlants > 0 ? (totalYield / totalPlants) : parseFloat(appState.settings.defaultExpectedYieldPerPlant);
}

function getExpectedYieldForActiveLine(activeTx) {
  // Find which stage is next
  const harvests = appState.harvestLogs.filter(h => h.transplantLogId === activeTx.id);
  const commHarvestsCount = harvests.filter(h => h.stage.startsWith("Harvest")).length;
  const nextStageNum = commHarvestsCount + 1;
  
  if (nextStageNum > parseInt(appState.settings.totalHarvests)) {
    return 0; // Completed
  }
  
  const nextStageLabel = `Harvest ${nextStageNum}`;
  const avgYieldPerPlant = getAvgHistoricalYieldPerPlant(activeTx.crop, nextStageLabel);
  return Math.round(activeTx.plantsPlanted * avgYieldPerPlant);
}

// 3. NAVIGATION CONTROLLER
function setupNavigation() {
  const menuItems = document.querySelectorAll(".menu-item");
  const tabContents = document.querySelectorAll(".tab-content");
  
  menuItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute("data-tab");
      
      menuItems.forEach(i => i.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      
      item.classList.add("active");
      document.getElementById(targetTab).classList.add("active");
      
      // Re-trigger layout sizes on active charts
      if (targetTab === "tab-analytics") {
        setTimeout(renderAnalytics, 100);
      }
    });
  });
}

// 4. DASHBOARD RENDERER
function renderDashboard() {
  const today = new Date();
  
  // Total capacity metric variables
  let totalTowers = 0;
  let occupiedTowers = 0;
  let totalActivePlants = 0;
  let emptyLinesCount = 0;
  let expectedYieldAccumulator = 0;
  
  const emptyLinesList = [];
  const readyLinesList = [];
  const activePlantVarieties = {};
  
  // Initialize plant variety keys from catalog
  appState.settings.cropCatalog.forEach(c => activePlantVarieties[c] = 0);
  
  // 19 rows * 2 lines map generator
  const mapGridElement = document.getElementById("polyhouse-grid-map");
  mapGridElement.innerHTML = "";
  
  for (let r = 1; r <= parseInt(appState.settings.rows); r++) {
    const rowCap = getLineCapacity(r); // per line capacity
    const towersCount = parseInt(appState.settings.towersPerLine);
    totalTowers += (towersCount * 2);
    
    // UI elements for the row
    const rowDiv = document.createElement("div");
    rowDiv.className = "row-container";
    
    const rowLabel = document.createElement("div");
    rowLabel.className = "row-label";
    rowLabel.innerText = `Row ${r}`;
    rowDiv.appendChild(rowLabel);
    
    const linesWrapper = document.createElement("div");
    linesWrapper.className = "lines-wrapper";
    
    ["A", "B"].forEach(lineId => {
      const lineRow = document.createElement("div");
      lineRow.className = "line-row";
      
      const lineLabel = document.createElement("div");
      lineLabel.className = "line-label";
      lineLabel.innerText = lineId;
      lineRow.appendChild(lineLabel);
      
      const towersGrid = document.createElement("div");
      towersGrid.className = "towers-grid";
      
      const lineDetails = getLineState(r, lineId);
      
      if (lineDetails.status === "empty") {
        emptyLinesCount++;
        emptyLinesList.push(`Row ${r} Line ${lineId}`);
      } else {
        const tx = lineDetails.data;
        occupiedTowers += tx.towersPlanted;
        totalActivePlants += tx.plantsPlanted;
        
        if (!activePlantVarieties[tx.crop]) activePlantVarieties[tx.crop] = 0;
        activePlantVarieties[tx.crop] += tx.plantsPlanted;
        
        // Expected yield computations
        if (lineDetails.status.startsWith("ready-harvest") || lineDetails.status.startsWith("growing")) {
          expectedYieldAccumulator += getExpectedYieldForActiveLine(tx);
        }
        
        // Check if ready for operational actions (Shenda/Harvest)
        if (lineDetails.status.startsWith("ready")) {
          readyLinesList.push({
            row: r,
            line: lineId,
            crop: tx.crop,
            stage: lineDetails.nextStage,
            plants: tx.plantsPlanted,
            txId: tx.id,
            label: lineDetails.label
          });
        }
      }
      
      // Render tower cells
      const capacityPerTower = rowCap / towersCount;
      const towersPlantedInLine = lineDetails.status !== "empty" ? lineDetails.data.towersPlanted : 0;
      
      for (let t = 1; t <= towersCount; t++) {
        const cell = document.createElement("div");
        cell.className = "tower-cell";
        
        // Color distribution depending on towers planted
        if (lineDetails.status !== "empty" && t <= towersPlantedInLine) {
          cell.className += ` ${lineDetails.colorClass}`;
          cell.title = `Tower ${t} (${lineId}): ${lineDetails.data.crop} - ${lineDetails.label}`;
        } else {
          cell.className += ` state-empty`;
          cell.title = `Tower ${t} (${lineId}): Empty`;
        }
        
        // Open line modal when clicking any tower in that line
        cell.addEventListener("click", () => {
          openLineModal(r, lineId, lineDetails);
        });
        
        towersGrid.appendChild(cell);
      }
      
      lineRow.appendChild(towersGrid);
      linesWrapper.appendChild(lineRow);
    });
    
    rowDiv.appendChild(linesWrapper);
    mapGridElement.appendChild(rowDiv);
  }
  
  // Update dashboard metric cards
  const occupancyPercent = totalTowers > 0 ? Math.round((occupiedTowers / totalTowers) * 100) : 0;
  document.getElementById("metric-occupancy").innerText = `${occupancyPercent}%`;
  document.getElementById("sub-occupancy").innerText = `${occupiedTowers} / ${totalTowers} Towers Active`;
  
  document.getElementById("metric-plants").innerText = totalActivePlants.toLocaleString();
  
  // Breakdown subtext for varieties
  const varietyBreakdown = Object.entries(activePlantVarieties)
    .filter(([_, count]) => count > 0)
    .map(([crop, count]) => `${crop}: ${count.toLocaleString()}`)
    .join(" | ");
  document.getElementById("sub-plants").innerText = varietyBreakdown || "No crops sowed";
  
  document.getElementById("metric-empty-lines").innerText = emptyLinesCount;
  const subEmptyLinesEl = document.getElementById("sub-empty-lines");
  if (subEmptyLinesEl) {
    subEmptyLinesEl.innerText = `${emptyLinesCount * 63} Empty Towers available`;
  }
  
  document.getElementById("metric-expected-yield").innerText = `${expectedYieldAccumulator.toLocaleString()} kg`;
  document.getElementById("sub-expected-yield").innerText = `Estimated for active growing lines`;
  
  // Render Alerts Banner
  const alertPanel = document.getElementById("alerts-panel");
  alertPanel.innerHTML = "";
  
  // Ready Lines Alerts
  readyLinesList.forEach(line => {
    const card = document.createElement("div");
    card.className = "alert-card warning";
    
    let actionWord = line.stage === "Shenda" ? "Prune Shenda" : `Harvest ${line.stage.split(' ').pop()}`;
    
    card.innerHTML = `
      <div class="alert-content">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span><strong>Row ${line.row} Line ${line.line}</strong> is ready for <strong>${line.stage}</strong> (${line.crop}, ${line.plants} plants).</span>
      </div>
      <button class="alert-action-btn" onclick="triggerQuickAction(${line.row}, '${line.line}', '${line.stage}')">${actionWord}</button>
    `;
    alertPanel.appendChild(card);
  });
  
  // Ready to Clear Lines Alerts
  for (let r = 1; r <= parseInt(appState.settings.rows); r++) {
    ["A", "B"].forEach(lineId => {
      const stateDetails = getLineState(r, lineId);
      if (stateDetails.status === "harvest-completed") {
        const tx = stateDetails.data;
        const card = document.createElement("div");
        card.className = "alert-card info";
        card.innerHTML = `
          <div class="alert-content">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span><strong>Row ${r} Line ${lineId}</strong>: All 3 harvests completed. Ready to clear line.</span>
          </div>
          <button class="alert-action-btn" onclick="triggerQuickAction(${r}, '${lineId}', 'Clear')">Clear & Empty</button>
        `;
        alertPanel.appendChild(card);
      }
    });
  }
  
  // Render empty lines list
  const emptyLinesListElement = document.getElementById("empty-lines-list");
  emptyLinesListElement.innerHTML = "";
  if (emptyLinesList.length === 0) {
    emptyLinesListElement.innerHTML = `<p class="text-muted" style="font-size: 0.85rem;">Polyhouse is at 100% occupancy!</p>`;
  } else {
    // Show compact chunks
    emptyLinesListElement.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
        ${emptyLinesList.slice(0, 16).join(", ")}${emptyLinesList.length > 16 ? " + " + (emptyLinesList.length - 16) + " more" : ""}
      </div>
    `;
  }
  
  // Render Tray Status in Dashboard Side Panel
  renderTrayDashboardList();
}

function renderTrayDashboardList() {
  const listElement = document.getElementById("tray-status-list");
  listElement.innerHTML = "";
  
  const activeSowings = appState.sowingLogs.filter(s => s.status === "germinating" || s.status === "ready");
  
  if (activeSowings.length === 0) {
    listElement.innerHTML = `
      <div class="text-muted" style="text-align: center; padding: 20px; font-size: 0.85rem;">
        No active sowing trays in germination.
      </div>
    `;
    document.getElementById("metric-ready-trays").innerText = "0";
    document.getElementById("sub-ready-trays").innerText = "0 plants ready";
    return;
  }
  
  let readyTraysSum = 0;
  let readyPlantsSum = 0;
  
  activeSowings.forEach(sow => {
    const today = new Date();
    const readyDate = new Date(sow.readyDate);
    const item = document.createElement("div");
    item.className = "tray-status-item";
    
    let badgeClass = "germinating";
    let statusLabel = "";
    
    if (today >= readyDate) {
      sow.status = "ready"; // auto status adjustment
      badgeClass = "ready";
      statusLabel = "Ready for Transplant";
      readyTraysSum += sow.trayCount;
      readyPlantsSum += (sow.trayCount * parseInt(appState.settings.trayCapacity));
    } else {
      const daysLeft = Math.ceil((readyDate - today) / (1000 * 60 * 60 * 24));
      statusLabel = `${daysLeft} days remaining`;
    }
    
    item.innerHTML = `
      <div class="tray-meta">
        <span class="tray-title">${sow.id}: ${sow.crop}</span>
        <span class="tray-subtitle">${sow.trayCount} Trays (${sow.trayCount * parseInt(appState.settings.trayCapacity)} net cups) | Sowed: ${sow.sowDate}</span>
      </div>
      <span class="tray-badge ${badgeClass}">${statusLabel}</span>
    `;
    listElement.appendChild(item);
  });
  
  document.getElementById("metric-ready-trays").innerText = readyTraysSum;
  document.getElementById("sub-ready-trays").innerText = `${readyPlantsSum.toLocaleString()} plants ready for transplant`;
}

// 5. MODAL INTERACTORS & QUICK ACTIONS
function openLineModal(row, line, details) {
  const overlay = document.getElementById("line-modal-overlay");
  const title = document.getElementById("line-modal-title");
  const info = document.getElementById("line-modal-info");
  const actions = document.getElementById("line-modal-actions");
  
  title.innerText = `Row ${row} Line ${line} Details`;
  overlay.classList.add("active");
  
  const cap = getLineCapacity(row);
  
  if (details.status === "empty") {
    info.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Status:</strong> <span style="color: var(--text-muted);">EMPTY</span></p>
      <p style="margin-bottom: 8px;"><strong>Plant Capacity:</strong> ${cap} plants (${appState.settings.towersPerLine} towers)</p>
      <p>This line is clean and ready for a new transplant.</p>
    `;
    actions.innerHTML = `
      <button class="btn-primary" onclick="closeLineModal(); navigateToTransplantForm(${row}, '${line}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
        Transplant Sowed Saplings
      </button>
    `;
  } else {
    const tx = details.data;
    const harvests = appState.harvestLogs.filter(h => h.transplantLogId === tx.id);
    const shenda = harvests.find(h => h.stage === "Shenda");
    const commHrv = harvests.filter(h => h.stage.startsWith("Harvest"));
    
    let harvestHistoryText = harvests.length === 0 ? "None logged yet" : harvests.map(h => {
      return `${h.stage} (${h.date}): ${h.stage === 'Shenda' ? 'Pruned' : h.yieldKg + ' kg yield'}`;
    }).join("<br>");
    
    info.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Status:</strong> <span style="color: var(--color-${details.colorClass.split('-').pop()}); font-weight:600;">${details.label}</span></p>
      <p style="margin-bottom: 8px;"><strong>Crop Variety:</strong> ${tx.crop}</p>
      <p style="margin-bottom: 8px;"><strong>Transplanted Date:</strong> ${tx.date}</p>
      <p style="margin-bottom: 8px;"><strong>Plants Populated:</strong> ${tx.plantsPlanted} plants (${tx.towersPlanted} towers)</p>
      <p style="margin-bottom: 12px;"><strong>Source Batch:</strong> ${tx.trayBatchId}</p>
      <div style="background: rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:12px; border-radius:10px;">
        <h5 style="margin-bottom:6px; font-weight:600; font-size:0.85rem; color:var(--text-secondary);">Line Operations History</h5>
        <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.4;">${harvestHistoryText}</div>
      </div>
    `;
    
    // Actions based on lifecycle state
    let actionButtons = "";
    if (details.status === "ready-shenda") {
      actionButtons = `
        <button class="btn-primary" onclick="closeLineModal(); triggerQuickAction(${row}, '${line}', 'Shenda')">Log Shenda Cut</button>
      `;
    } else if (details.status.startsWith("ready-harvest-")) {
      const nextStage = details.nextStage;
      actionButtons = `
        <button class="btn-primary" onclick="closeLineModal(); triggerQuickAction(${row}, '${line}', '${nextStage}')">Log ${nextStage}</button>
      `;
    } else if (details.status === "harvest-completed") {
      actionButtons = `
        <button class="btn-primary" onclick="closeLineModal(); triggerQuickAction(${row}, '${line}', 'Clear')">Clear & Reset Line</button>
      `;
    } else {
      // Growing - allow early clearance/reset in case of crop issues
      actionButtons = `
        <button class="btn-danger" style="margin-top:10px;" onclick="closeLineModal(); triggerQuickAction(${row}, '${line}', 'Clear')">Clear Early (Discard Crop)</button>
      `;
    }
    
    actions.innerHTML = actionButtons;
  }
}

function closeLineModal() {
  document.getElementById("line-modal-overlay").classList.remove("active");
}

function navigateToTransplantForm(row, line) {
  // Switch to operations tab
  document.querySelector(".menu-item[data-tab='tab-operations']").click();
  
  // Prefill transplant form values
  document.getElementById("tx-row").value = row;
  document.getElementById("tx-line").value = line;
  document.getElementById("tx-towers").value = appState.settings.towersPerLine;
  document.getElementById("tx-date").value = new Date().toISOString().split('T')[0];
  
  // Render potential source tray options in dropdown
  updateTransplantBatchOptions(row);
}

function triggerQuickAction(row, line, stage) {
  // Find active transplant to prefill
  const activeTx = appState.transplantLogs.find(tx => tx.row === parseInt(row) && tx.line === line && tx.status === "active");
  if (!activeTx && stage !== "Clear") {
    showToast("Error: No active crop found on this line.", "danger");
    return;
  }
  
  if (stage === "Clear") {
    if (confirm(`Empty Row ${row} Line ${line}? This will clear the line for future transplants.`)) {
      const log = {
        id: "CLR-" + (appState.clearLogs.length + 1),
        date: new Date().toISOString().split('T')[0],
        row: parseInt(row),
        line: line,
        transplantLogId: activeTx ? activeTx.id : null,
        reason: "Normal harvest cycle finished",
        loggedBy: "Manager"
      };
      
      appState.clearLogs.push(log);
      const payload = {
        type: "clear",
        logged_by: "Manager",
        date: log.date,
        row: log.row,
        line: log.line,
        reason: log.reason
      };
      postToSupabase(payload).then(dbId => {
        if (dbId) {
          log.supabaseId = dbId;
          saveState();
        }
      });
      
      // Update matching transplant status to completed
      if (activeTx) {
        activeTx.status = "completed";
      }
      
      saveState();
      refreshAll();
      showToast(`Row ${row} Line ${line} cleared successfully.`, "success");
    }
  } else if (stage === "Shenda") {
    // Log Shenda cut
    const log = {
      id: "HRV-" + (appState.harvestLogs.length + 1),
      date: new Date().toISOString().split('T')[0],
      row: parseInt(row),
      line: line,
      transplantLogId: activeTx.id,
      stage: "Shenda",
      yieldKg: 0, // Shenda is a grooming trim event
      wasteKg: 0,
      crop: activeTx.crop,
      loggedBy: "Manager"
    };
    appState.harvestLogs.push(log);
    const payload = {
      type: "harvest",
      logged_by: "Manager",
      date: log.date,
      row: log.row,
      line: log.line,
      stage: log.stage,
      yield_kg: log.yieldKg,
      waste_kg: log.wasteKg
    };
    postToSupabase(payload).then(dbId => {
      if (dbId) {
        log.supabaseId = dbId;
        saveState();
      }
    });
    saveState();
    refreshAll();
    showToast(`Logged Shenda cut for Row ${row} Line ${line}.`, "success");
  } else {
    // Ready for commercial harvest (Harvest 1, 2, or 3)
    // Switch to operations tab and prefill harvest form
    document.querySelector(".menu-item[data-tab='tab-operations']").click();
    document.getElementById("hrv-row").value = row;
    document.getElementById("hrv-line").value = line;
    document.getElementById("hrv-stage").value = stage;
    document.getElementById("hrv-yield").value = getExpectedYieldForActiveLine(activeTx);
    document.getElementById("hrv-date").value = new Date().toISOString().split('T')[0];
    
    showToast(`Prefilled harvest details for Row ${row} Line ${line}.`, "info");
  }
}

// 6. FORM LOGGING ACTIONS
function updateTransplantBatchOptions(row) {
  const select = document.getElementById("tx-batch");
  select.innerHTML = '<option value="">-- Select Tray Batch --</option>';
  
  const readySowings = appState.sowingLogs.filter(s => s.status === "ready" || s.status === "germinating");
  
  readySowings.forEach(s => {
    const isReady = new Date() >= new Date(s.readyDate);
    const label = `${s.id} (${s.crop}) - ${s.trayCount} Trays [Sowed: ${s.sowDate}] ${isReady ? '(READY)' : '(GERMINATING)'}`;
    select.innerHTML += `<option value="${s.id}">${label}</option>`;
  });
}

function setupFormHandlers() {
  // Sowing Input Form
  const sowingForm = document.getElementById("form-sowing");
  sowingForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const crop = document.getElementById("sow-crop").value;
    const type = document.getElementById("sow-type").value;
    const trayCount = parseInt(document.getElementById("sow-trays").value);
    const sowDateStr = document.getElementById("sow-date").value;
    
    if (!crop || isNaN(trayCount) || !sowDateStr) {
      showToast("Please fill all details.", "danger");
      return;
    }
    
    // Compute expected ready date based on seed/sapling settings
    const sowDate = new Date(sowDateStr);
    const germPeriod = getGerminationPeriod(type);
    const readyDate = new Date(sowDate);
    readyDate.setDate(readyDate.getDate() + germPeriod);
    
    const today = new Date();
    let status = "germinating";
    if (today >= readyDate) {
      status = "ready";
    }
    
    const newLog = {
      id: "SOW-" + (appState.sowingLogs.length + 1),
      crop,
      type,
      trayCount,
      sowDate: sowDateStr,
      readyDate: readyDate.toISOString().split('T')[0],
      status,
      loggedBy: "Manager"
    };
    
    appState.sowingLogs.push(newLog);
    saveState();
    
    const payload = {
      type: "sowing",
      logged_by: "Manager",
      date: sowDateStr,
      crop: crop,
      sow_type: type,
      trays: trayCount
    };
    postToSupabase(payload).then(dbId => {
      if (dbId) {
        newLog.supabaseId = dbId;
        saveState();
      }
    });
    sowingForm.reset();
    document.getElementById("sow-date").value = new Date().toISOString().split('T')[0];
    
    refreshAll();
    showToast(`Tray Sowing Batch ${newLog.id} registered!`, "success");
  });
  
  // Transplant Input Form
  const transplantForm = document.getElementById("form-transplant");
  transplantForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const row = parseInt(document.getElementById("tx-row").value);
    const line = document.getElementById("tx-line").value;
    const batchId = document.getElementById("tx-batch").value;
    const towersPlanted = parseInt(document.getElementById("tx-towers").value);
    const txDateStr = document.getElementById("tx-date").value;
    
    if (isNaN(row) || !line || !batchId || isNaN(towersPlanted) || !txDateStr) {
      showToast("Please fill all details.", "danger");
      return;
    }
    
    // Check if destination line is already occupied
    const activeTx = appState.transplantLogs.find(t => t.row === row && t.line === line && t.status === "active");
    if (activeTx) {
      showToast(`Line ${row}${line} is already occupied! Clear it first.`, "danger");
      return;
    }
    
    // Find batch details to identify crop type
    const sourceBatch = appState.sowingLogs.find(s => s.id === batchId);
    if (!sourceBatch) {
      showToast("Selected tray batch does not exist.", "danger");
      return;
    }
    
    // Compute total plants planted
    const cap = getLineCapacity(row);
    const towersCap = parseInt(appState.settings.towersPerLine);
    const plantsPerTower = cap / towersCap;
    const totalPlantsPlanted = towersPlanted * plantsPerTower;
    
    // Register transplant
    const newTx = {
      id: "TX-" + (appState.transplantLogs.length + 1),
      date: txDateStr,
      row,
      line,
      trayBatchId: batchId,
      towersPlanted,
      plantsPlanted: totalPlantsPlanted,
      crop: sourceBatch.crop,
      status: "active",
      loggedBy: "Manager"
    };
    
    // Deduct trays or mark batch transplanted
    sourceBatch.status = "transplanted";
    
    appState.transplantLogs.push(newTx);
    saveState();
    
    const payload = {
      type: "transplant",
      logged_by: "Manager",
      date: txDateStr,
      row,
      line,
      batch: batchId,
      towers: towersPlanted
    };
    postToSupabase(payload).then(dbId => {
      if (dbId) {
        newTx.supabaseId = dbId;
        saveState();
      }
    });
    transplantForm.reset();
    document.getElementById("tx-date").value = new Date().toISOString().split('T')[0];
    
    refreshAll();
    showToast(`Transplant logged to Row ${row} Line ${line}!`, "success");
  });
  
  // Refresh batch choices when transplant row is selected
  document.getElementById("tx-row").addEventListener("change", (e) => {
    updateTransplantBatchOptions(e.target.value);
  });
  
  // Prefill transplant batch details initially
  updateTransplantBatchOptions(1);
  
  // Harvest Input Form
  const harvestForm = document.getElementById("form-harvest");
  harvestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const row = parseInt(document.getElementById("hrv-row").value);
    const line = document.getElementById("hrv-line").value;
    const stage = document.getElementById("hrv-stage").value;
    const yieldKg = parseFloat(document.getElementById("hrv-yield").value);
    const wasteKg = parseFloat(document.getElementById("hrv-waste").value || 0);
    const hrvDateStr = document.getElementById("hrv-date").value;
    
    if (isNaN(row) || !line || !stage || isNaN(yieldKg) || !hrvDateStr) {
      showToast("Please fill all details.", "danger");
      return;
    }
    
    // Find matching active transplant
    const activeTx = appState.transplantLogs.find(t => t.row === row && t.line === line && t.status === "active");
    if (!activeTx) {
      showToast(`No active crops currently on Row ${row} Line ${line} to harvest.`, "danger");
      return;
    }
    
    // Register harvest log
    const newHrv = {
      id: "HRV-" + (appState.harvestLogs.length + 1),
      date: hrvDateStr,
      row,
      line,
      transplantLogId: activeTx.id,
      stage,
      yieldKg,
      wasteKg,
      crop: activeTx.crop,
      loggedBy: "Manager"
    };
    
    appState.harvestLogs.push(newHrv);
    saveState();
    
    const payload = {
      type: "harvest",
      logged_by: "Manager",
      date: hrvDateStr,
      row: row,
      line: line,
      stage: stage,
      yield_kg: yieldKg,
      waste_kg: wasteKg
    };
    postToSupabase(payload).then(dbId => {
      if (dbId) {
        newHrv.supabaseId = dbId;
        saveState();
      }
    });
    harvestForm.reset();
    document.getElementById("hrv-date").value = new Date().toISOString().split('T')[0];
    
    refreshAll();
    showToast(`Logged yield of ${yieldKg} kg for Row ${row} Line ${line}!`, "success");
  });
}

// 7. HISTORICAL LOG RENDERER
function renderLogs() {
  const tableBody = document.getElementById("logs-table-body");
  tableBody.innerHTML = "";
  
  const currentFilter = document.querySelector(".log-filter-btn.active").getAttribute("data-filter");
  
  let mergedLogs = [];
  
  // Map sowing logs
  if (currentFilter === "all" || currentFilter === "sowing") {
    appState.sowingLogs.forEach(s => {
      mergedLogs.push({
        id: s.id,
        date: s.sowDate,
        type: "Sowing",
        crop: s.crop,
        details: `${s.trayCount} Trays (${s.type}) - Status: ${s.status.toUpperCase()} | Employee: ${s.loggedBy || 'Manager'}`,
        raw: s
      });
    });
  }
  
  // Map transplant logs
  if (currentFilter === "all" || currentFilter === "transplant") {
    appState.transplantLogs.forEach(t => {
      mergedLogs.push({
        id: t.id,
        date: t.date,
        type: "Transplant",
        crop: t.crop,
        details: `Row ${t.row} Line ${t.line} | ${t.towersPlanted} Towers (${t.plantsPlanted} plants) | Batch: ${t.trayBatchId} [${t.status}] | Employee: ${t.loggedBy || 'Manager'}`,
        raw: t
      });
    });
  }
  
  // Map harvest logs
  if (currentFilter === "all" || currentFilter === "harvest") {
    appState.harvestLogs.forEach(h => {
      mergedLogs.push({
        id: h.id,
        date: h.date,
        type: "Harvest",
        crop: h.crop,
        details: `Row ${h.row} Line ${h.line} (${h.stage}) | Yield: ${h.yieldKg} kg (Waste: ${h.wasteKg} kg) | Employee: ${h.loggedBy || 'Manager'}`,
        raw: h
      });
    });
  }
  
  // Map clearances
  if (currentFilter === "all" || currentFilter === "clear") {
    appState.clearLogs.forEach(c => {
      mergedLogs.push({
        id: c.id,
        date: c.date,
        type: "Clearance",
        crop: "N/A",
        details: `Row ${c.row} Line ${c.line} cleared. Reason: ${c.reason} | Employee: ${c.loggedBy || 'Manager'}`,
        raw: c
      });
    });
  }
  
  // Sort logs by date descending
  mergedLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (mergedLogs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No log records matching filters.</td></tr>`;
    return;
  }
  
  mergedLogs.forEach(log => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${log.date}</strong></td>
      <td><span class="tray-badge ${log.type.toLowerCase() === 'harvest' ? 'ready' : 'germinating'}">${log.type}</span></td>
      <td><strong>${log.id}</strong></td>
      <td>${log.crop}</td>
      <td>${log.details}</td>
      <td>
        <button class="log-action-btn" onclick="deleteLog('${log.type}', '${log.id}')" title="Delete record">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function filterLogs(filterType, element) {
  document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
  element.classList.add("active");
  renderLogs();
}

function deleteLog(type, id) {
  if (!confirm(`Are you sure you want to delete historical record ${id}?`)) {
    return;
  }
  
  let targetLog = null;
  if (type === "Sowing") {
    targetLog = appState.sowingLogs.find(s => s.id === id);
    appState.sowingLogs = appState.sowingLogs.filter(s => s.id !== id);
  } else if (type === "Transplant") {
    const tx = appState.transplantLogs.find(t => t.id === id);
    if (tx) {
      targetLog = tx;
      const sow = appState.sowingLogs.find(s => s.id === tx.trayBatchId);
      if (sow) sow.status = "ready";
    }
    appState.transplantLogs = appState.transplantLogs.filter(t => t.id !== id);
  } else if (type === "Harvest") {
    targetLog = appState.harvestLogs.find(h => h.id === id);
    appState.harvestLogs = appState.harvestLogs.filter(h => h.id !== id);
  } else if (type === "Clearance") {
    const clr = appState.clearLogs.find(c => c.id === id);
    if (clr) {
      targetLog = clr;
      const tx = appState.transplantLogs.find(t => t.id === clr.transplantLogId);
      if (tx) tx.status = "active";
    }
    appState.clearLogs = appState.clearLogs.filter(c => c.id !== id);
  }
  
  if (targetLog && targetLog.supabaseId) {
    deleteFromSupabase(targetLog.supabaseId);
  }
  
  saveState();
  refreshAll();
  showToast(`Record ${id} deleted successfully.`, "success");
}

// 8. ANALYTICS & CHART MANAGERS
function renderAnalytics() {
  const ctxYield = document.getElementById("yield-trend-chart");
  const ctxEfficiency = document.getElementById("efficiency-chart");
  
  if (!ctxYield || !ctxEfficiency) return;
  
  // Clear charts if existing
  if (yieldChart) yieldChart.destroy();
  if (efficiencyChart) efficiencyChart.destroy();
  
  // Compute analytics numbers
  // 1. Yield Trend by Crop (kg sowed vs harvested)
  const crops = appState.settings.cropCatalog;
  const yieldByCrop = {};
  const wasteByCrop = {};
  
  crops.forEach(c => {
    yieldByCrop[c] = 0;
    wasteByCrop[c] = 0;
  });
  
  appState.harvestLogs.forEach(h => {
    if (h.stage !== "Shenda") { // Skip Shenda cuts since they yield 0
      if (!yieldByCrop[h.crop]) yieldByCrop[h.crop] = 0;
      if (!wasteByCrop[h.crop]) wasteByCrop[h.crop] = 0;
      yieldByCrop[h.crop] += h.yieldKg;
      wasteByCrop[h.crop] += h.wasteKg;
    }
  });
  
  // 2. Efficiency by Row (yield per plant)
  const rowTotalPlants = {};
  const rowTotalYield = {};
  
  // Map yield to transplant instances to discover which row they occurred on
  appState.harvestLogs.forEach(h => {
    if (h.stage !== "Shenda") {
      const tx = appState.transplantLogs.find(t => t.id === h.transplantLogId);
      if (tx) {
        const row = tx.row;
        if (!rowTotalPlants[row]) rowTotalPlants[row] = 0;
        if (!rowTotalYield[row]) rowTotalYield[row] = 0;
        
        // Accumulate yield
        rowTotalYield[row] += h.yieldKg;
        // Map plants only once per transplant (we divide later by stage count if needed, or just yield/plants ratio)
        // A better metric for row efficiency is (Total yield got / Total plants transplanted historically on that row)
      }
    }
  });
  
  appState.transplantLogs.forEach(tx => {
    const row = tx.row;
    if (!rowTotalPlants[row]) rowTotalPlants[row] = 0;
    rowTotalPlants[row] += tx.plantsPlanted;
  });
  
  const rowEfficiencyData = [];
  const rowLabels = [];
  for (let r = 1; r <= parseInt(appState.settings.rows); r++) {
    rowLabels.push(`Row ${r}`);
    const plantsCount = rowTotalPlants[r] || 0;
    const yieldCount = rowTotalYield[r] || 0;
    
    // yield per plant in grams
    const yieldPerPlantG = plantsCount > 0 ? Math.round((yieldCount / plantsCount) * 1000) : 0;
    rowEfficiencyData.push(yieldPerPlantG);
  }
  
  // Create yieldChart
  yieldChart = new Chart(ctxYield, {
    type: 'bar',
    data: {
      labels: Object.keys(yieldByCrop),
      datasets: [
        {
          label: 'Total Commercial Yield (kg)',
          data: Object.values(yieldByCrop),
          backgroundColor: '#10b981',
          borderColor: '#059669',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Waste / Rejection (kg)',
          data: Object.values(wasteByCrop),
          backgroundColor: '#ef4444',
          borderColor: '#dc2626',
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { family: 'Outfit' } } }
      },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9ca3af', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
  
  // Create efficiencyChart
  efficiencyChart = new Chart(ctxEfficiency, {
    type: 'line',
    data: {
      labels: rowLabels,
      datasets: [{
        label: 'Historical Yield Efficiency (Grams/Plant)',
        data: rowEfficiencyData,
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderColor: '#06b6d4',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#06b6d4'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { family: 'Outfit' } } }
      },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9ca3af', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// 9. SETTINGS TAB INTERACTORS
function renderSettings() {
  const config = appState.settings;
  
  // Fill inputs
  document.getElementById("set-rows").value = config.rows;
  document.getElementById("set-towers-line").value = config.towersPerLine;
  document.getElementById("set-r1-holders").value = config.rows1to7Holders;
  document.getElementById("set-r1-plants").value = config.rows1to7PlantsPerHolder;
  document.getElementById("set-r8-holders").value = config.rows8to19Holders;
  document.getElementById("set-r8-plants").value = config.rows8to19PlantsPerHolder;
  document.getElementById("set-germ-seed").value = config.seedGerminationDays;
  document.getElementById("set-germ-sapling").value = config.saplingGerminationDays;
  document.getElementById("set-shenda-days").value = config.transplantToShendaDays;
  document.getElementById("set-harvest-days").value = config.harvestIntervalDays;
  document.getElementById("set-harvest-total").value = config.totalHarvests;
  document.getElementById("set-default-yield").value = config.defaultExpectedYieldPerPlant;
  document.getElementById("set-supabase-url").value = config.supabaseUrl || "";
  document.getElementById("set-supabase-key").value = config.supabaseKey || "";
  document.getElementById("set-whatsapp-phone").value = config.whatsappPhone || "";
  document.getElementById("set-public-url").value = config.publicUrl || "";
  
  // Render tags
  renderCropCatalogTags();
  renderEmployeeCatalogTags();
}

function renderCropCatalogTags() {
  const container = document.getElementById("crop-catalog-tags");
  container.innerHTML = "";
  
  appState.settings.cropCatalog.forEach(crop => {
    container.innerHTML += `
      <span class="crop-tag">
        ${crop}
        <button class="crop-tag-remove" onclick="removeCropFromCatalog('${crop}')">&times;</button>
      </span>
    `;
  });
  
  // Update all options dropdowns in forms
  updateFormCropOptions();
}

function updateFormCropOptions() {
  const sowCropSelect = document.getElementById("sow-crop");
  sowCropSelect.innerHTML = "";
  
  appState.settings.cropCatalog.forEach(crop => {
    sowCropSelect.innerHTML += `<option value="${crop}">${crop}</option>`;
  });
}

function addCropToCatalog() {
  const input = document.getElementById("new-crop-input");
  const cropName = input.value.trim();
  
  if (cropName === "") {
    showToast("Please enter a crop name.", "danger");
    return;
  }
  
  if (appState.settings.cropCatalog.includes(cropName)) {
    showToast("Crop already exists in catalog.", "danger");
    return;
  }
  
  appState.settings.cropCatalog.push(cropName);
  input.value = "";
  saveState();
  renderCropCatalogTags();
  showToast(`Added ${cropName} to crop list.`, "success");
}

function removeCropFromCatalog(crop) {
  if (appState.settings.cropCatalog.length <= 1) {
    showToast("Must have at least one crop variety in the catalog.", "danger");
    return;
  }
  
  appState.settings.cropCatalog = appState.settings.cropCatalog.filter(c => c !== crop);
  saveState();
  renderCropCatalogTags();
  showToast(`Removed ${crop} from crop list.`, "success");
}

function setupSettingsHandlers() {
  const form = document.getElementById("form-settings");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    appState.settings.rows = parseInt(document.getElementById("set-rows").value);
    appState.settings.towersPerLine = parseInt(document.getElementById("set-towers-line").value);
    appState.settings.rows1to7Holders = parseInt(document.getElementById("set-r1-holders").value);
    appState.settings.rows1to7PlantsPerHolder = parseInt(document.getElementById("set-r1-plants").value);
    appState.settings.rows8to19Holders = parseInt(document.getElementById("set-r8-holders").value);
    appState.settings.rows8to19PlantsPerHolder = parseInt(document.getElementById("set-r8-plants").value);
    appState.settings.seedGerminationDays = parseInt(document.getElementById("set-germ-seed").value);
    appState.settings.saplingGerminationDays = parseInt(document.getElementById("set-germ-sapling").value);
    appState.settings.transplantToShendaDays = parseInt(document.getElementById("set-shenda-days").value);
    appState.settings.harvestIntervalDays = parseInt(document.getElementById("set-harvest-days").value);
    appState.settings.totalHarvests = parseInt(document.getElementById("set-harvest-total").value);
    appState.settings.defaultExpectedYieldPerPlant = parseFloat(document.getElementById("set-default-yield").value);
    
    saveState();
    refreshAll();
    showToast("Physical layout and cycle configurations saved successfully!", "success");
  });
}

// 10. BACKUP UTILITIES (EXPORT / IMPORT JSON)
function exportData() {
  const filename = `polyhouse_erp_backup_${new Date().toISOString().split('T')[0]}.json`;
  const jsonStr = JSON.stringify(appState, null, 2);
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(jsonStr));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  showToast("Backup file downloaded.", "success");
}

function importData() {
  const input = document.getElementById("import-file-input");
  if (input.files.length === 0) {
    showToast("Please choose a JSON backup file first.", "danger");
    return;
  }
  
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.settings && parsed.sowingLogs && parsed.transplantLogs && parsed.harvestLogs) {
        appState = parsed;
        saveState();
        refreshAll();
        showToast("Database restored successfully!", "success");
        input.value = ""; // clear file input
      } else {
        showToast("Invalid data structure in backup file.", "danger");
      }
    } catch (err) {
      showToast("Error parsing file. Make sure it is valid JSON.", "danger");
    }
  };
  reader.readAsText(file);
}

// 11. TOAST NOTIFICATIONS
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type === 'danger' ? 'warning' : ''}`;
  toast.style.borderColor = type === 'danger' ? 'var(--color-alert)' : (type === 'info' ? 'var(--color-ready)' : 'var(--accent)');
  
  toast.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 4000);
}

// Helper: Live date-time updates
function startLiveClock() {
  const clockElement = document.getElementById("live-clock");
  const update = () => {
    const d = new Date();
    clockElement.innerText = d.toLocaleString();
  };
  update();
  setInterval(update, 1000);
}

/// 12. CLOUD SYNC & WHATSAPP REPORT PARSING ENGINES
function setupCloudSettings() {
  const cloudForm = document.getElementById("form-cloud-settings");
  if (cloudForm) {
    cloudForm.addEventListener("submit", (e) => {
      e.preventDefault();
      appState.settings.supabaseUrl = document.getElementById("set-supabase-url").value.trim();
      appState.settings.supabaseKey = document.getElementById("set-supabase-key").value.trim();
      appState.settings.whatsappPhone = document.getElementById("set-whatsapp-phone").value.trim();
      appState.settings.publicUrl = document.getElementById("set-public-url").value.trim();
      saveState();
      refreshAll();
      showToast("Supabase cloud sync credentials updated!", "success");
      syncWithCloud();
    });
  }
}

async function syncWithCloud() {
  const url = appState.settings.supabaseUrl;
  const key = appState.settings.supabaseKey;
  if (!url || !key) return;
  
  try {
    const cleanUrl = url.endsWith('/') ? url : url + '/';
    const endpoint = `${cleanUrl}rest/v1/polyhouse_logs?select=*`;
    
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    
    if (!res.ok) throw new Error("Supabase request failed: " + res.statusText);
    const logsQueue = await res.json();
    
    if (logsQueue && logsQueue.length > 0) {
      let mergedCount = 0;
      
      logsQueue.forEach(log => {
        if (log.type === "sowing") {
          // Check duplicate
          const match = appState.sowingLogs.find(s => 
            s.supabaseId === log.id || 
            (!s.supabaseId && s.crop === log.crop && s.sowDate === log.date && s.trayCount === log.trays)
          );
          if (match) {
            if (!match.supabaseId) {
              match.supabaseId = log.id;
              localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
            }
            return;
          }
          
          const sowDateObj = new Date(log.date);
          const germPeriod = getGerminationPeriod(log.sow_type);
          const readyDateObj = new Date(sowDateObj);
          readyDateObj.setDate(readyDateObj.getDate() + germPeriod);
          
          const sowLog = {
            id: "SOW-" + (appState.sowingLogs.length + 1),
            crop: log.crop,
            type: log.sow_type,
            trayCount: log.trays,
            sowDate: log.date,
            readyDate: readyDateObj.toISOString().split('T')[0],
            status: (new Date() >= readyDateObj) ? "ready" : "germinating",
            loggedBy: log.logged_by || "System",
            supabaseId: log.id
          };
          appState.sowingLogs.push(sowLog);
          mergedCount++;
          
        } else if (log.type === "transplant") {
          // Check duplicate
          const match = appState.transplantLogs.find(t => 
            t.supabaseId === log.id ||
            (!t.supabaseId && t.row === log.row && t.line === log.line && t.date === log.date && t.trayBatchId === log.batch)
          );
          if (match) {
            if (!match.supabaseId) {
              match.supabaseId = log.id;
              localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
            }
            return;
          }
          
          const cap = getLineCapacity(log.row);
          const towersCap = parseInt(appState.settings.towersPerLine);
          const plantsPerTower = cap / towersCap;
          
          const activeTx = appState.transplantLogs.find(t => t.row === log.row && t.line === log.line && t.status === "active");
          if (activeTx) {
            console.warn(`Line ${log.row}${log.line} already occupied. Skipping remote transplant.`);
            return;
          }
          
          const sourceBatch = appState.sowingLogs.find(s => s.id === log.batch);
          const cropName = sourceBatch ? sourceBatch.crop : (log.crop || "Unknown Crop");
          
          const txLog = {
            id: "TX-" + (appState.transplantLogs.length + 1),
            date: log.date,
            row: log.row,
            line: log.line,
            trayBatchId: log.batch,
            towersPlanted: log.towers || 63,
            plantsPlanted: (log.towers || 63) * plantsPerTower,
            crop: cropName,
            status: "active",
            loggedBy: log.logged_by || "System",
            supabaseId: log.id
          };
          
          if (sourceBatch) sourceBatch.status = "transplanted";
          appState.transplantLogs.push(txLog);
          mergedCount++;
          
        } else if (log.type === "harvest") {
          // Check duplicate
          const match = appState.harvestLogs.find(h => 
            h.supabaseId === log.id ||
            (!h.supabaseId && h.row === log.row && h.line === log.line && h.date === log.date && h.stage === log.stage)
          );
          if (match) {
            if (!match.supabaseId) {
              match.supabaseId = log.id;
              localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
            }
            return;
          }
          
          const activeTx = appState.transplantLogs.find(t => t.row === log.row && t.line === log.line && t.status === "active");
          const txId = activeTx ? activeTx.id : null;
          const cropName = activeTx ? activeTx.crop : (log.crop || "Unknown Crop");
          
          const hrvLog = {
            id: "HRV-" + (appState.harvestLogs.length + 1),
            date: log.date,
            row: log.row,
            line: log.line,
            transplantLogId: txId,
            stage: log.stage,
            yieldKg: log.yield_kg,
            wasteKg: log.waste_kg || 0,
            crop: cropName,
            loggedBy: log.logged_by || "System",
            supabaseId: log.id
          };
          appState.harvestLogs.push(hrvLog);
          mergedCount++;
          
        } else if (log.type === "clear") {
          // Check duplicate
          const match = appState.clearLogs.find(c => 
            c.supabaseId === log.id ||
            (!c.supabaseId && c.row === log.row && c.line === log.line && c.date === log.date)
          );
          if (match) {
            if (!match.supabaseId) {
              match.supabaseId = log.id;
              localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
            }
            return;
          }
          
          const activeTx = appState.transplantLogs.find(t => t.row === log.row && t.line === log.line && t.status === "active");
          const txId = activeTx ? activeTx.id : null;
          
          const clrLog = {
            id: "CLR-" + (appState.clearLogs.length + 1),
            date: log.date,
            row: log.row,
            line: log.line,
            transplantLogId: txId,
            reason: log.reason,
            loggedBy: log.logged_by || "System",
            supabaseId: log.id
          };
          
          if (activeTx) activeTx.status = "completed";
          appState.clearLogs.push(clrLog);
          mergedCount++;
        }
      });
      
      if (mergedCount > 0) {
        localStorage.setItem("polyhouse_erp_state", JSON.stringify(appState));
        refreshAll();
        showToast(`Cloud Sync: Synced ${mergedCount} operations from Supabase.`, "success");
      }
    }
  } catch (err) {
    console.error("Supabase sync detailed error:", err);
    showToast("Operating locally. Supabase connection error: " + err.message, "info");
  }
}

// 13. EMPLOYEE CATALOG MANAGERS
function renderEmployeeCatalogTags() {
  const container = document.getElementById("employee-catalog-tags");
  if (!container) return;
  container.innerHTML = "";
  
  appState.settings.employeeCatalog.forEach(emp => {
    container.innerHTML += `
      <span class="crop-tag">
        ${emp}
        <button class="crop-tag-remove" onclick="removeEmployeeFromCatalog('${emp}')">&times;</button>
      </span>
    `;
  });
}

function addEmployeeToCatalog() {
  const input = document.getElementById("new-employee-input");
  const empName = input.value.trim();
  
  if (empName === "") {
    showToast("Please enter an employee name.", "danger");
    return;
  }
  
  if (appState.settings.employeeCatalog.includes(empName)) {
    showToast("Employee already exists in directory.", "danger");
    return;
  }
  
  appState.settings.employeeCatalog.push(empName);
  input.value = "";
  saveState();
  renderEmployeeCatalogTags();
  showToast(`Added ${empName} to employee catalog.`, "success");
}

function removeEmployeeFromCatalog(emp) {
  if (appState.settings.employeeCatalog.length <= 1) {
    showToast("Must have at least one employee in the directory.", "danger");
    return;
  }
  
  appState.settings.employeeCatalog = appState.settings.employeeCatalog.filter(e => e !== emp);
  saveState();
  renderEmployeeCatalogTags();
  showToast(`Removed ${emp} from employee catalog.`, "success");
}

function parseWhatsAppText() {
  const pasteArea = document.getElementById("wa-paste-area");
  const rawText = pasteArea.value;
  const statusEl = document.getElementById("wa-parse-status");
  const previewDiv = document.getElementById("wa-parse-preview");
  const listEl = document.getElementById("wa-parse-list");
  
  listEl.innerHTML = "";
  tempParsedLogs = [];
  
  if (!rawText.trim()) {
    statusEl.innerText = "Please paste text first.";
    previewDiv.style.display = "none";
    return;
  }
  
  const lines = rawText.split("\n");
  let detectedCount = 0;
  
  lines.forEach((lineStr, lineIdx) => {
    const logIndex = lineStr.indexOf("[ERP-LOG]");
    if (logIndex === -1) return;
    
    const content = lineStr.substring(logIndex + 9).trim();
    const parts = content.split("|");
    if (parts.length < 2) return;
    
    const action = parts[0].trim().toUpperCase();
    const fields = {};
    
    for (let i = 1; i < parts.length; i++) {
      const kv = parts[i].split(":");
      if (kv.length >= 2) {
        const key = kv[0].trim().toLowerCase();
        const val = kv.slice(1).join(":").trim();
        fields[key] = val;
      }
    }
    
    let item = { action, lineNum: lineIdx + 1, raw: fields };
    
    if (action === "SOWING") {
      item.crop = fields.crop || "";
      item.type = fields.type || "seed";
      item.trays = parseInt(fields.trays) || 0;
      item.date = fields.date || new Date().toISOString().split('T')[0];
      
      if (item.crop && item.trays > 0) {
        tempParsedLogs.push(item);
        detectedCount++;
      }
    } else if (action === "TRANSPLANT") {
      item.row = parseInt(fields.row) || 0;
      item.line = (fields.line || "").toUpperCase();
      item.batch = fields.batch || "";
      item.towers = parseInt(fields.towers) || 63;
      item.date = fields.date || new Date().toISOString().split('T')[0];
      
      if (item.row > 0 && item.line && item.batch) {
        tempParsedLogs.push(item);
        detectedCount++;
      }
    } else if (action === "HARVEST") {
      item.row = parseInt(fields.row) || 0;
      item.line = (fields.line || "").toUpperCase();
      item.stage = fields.stage || "";
      item.yield = parseFloat(fields.yield) || 0;
      item.waste = parseFloat(fields.waste) || 0;
      item.date = fields.date || new Date().toISOString().split('T')[0];
      
      if (item.row > 0 && item.line && item.stage && item.yield >= 0) {
        tempParsedLogs.push(item);
        detectedCount++;
      }
    } else if (action === "CLEAR") {
      item.row = parseInt(fields.row) || 0;
      item.line = (fields.line || "").toUpperCase();
      item.reason = fields.reason || "Normal harvest cycle finished";
      item.date = fields.date || new Date().toISOString().split('T')[0];
      
      if (item.row > 0 && item.line) {
        tempParsedLogs.push(item);
        detectedCount++;
      }
    }
  });
  
  if (detectedCount === 0) {
    statusEl.innerHTML = `<span style="color:var(--color-alert);">No logs matching '[ERP-LOG]' format detected.</span>`;
    previewDiv.style.display = "none";
  } else {
    statusEl.innerHTML = `<span style="color:var(--accent);">Detected ${detectedCount} operational log(s). Check preview.</span>`;
    previewDiv.style.display = "block";
    
    tempParsedLogs.forEach((item, index) => {
      const rowItem = document.createElement("div");
      rowItem.style.marginBottom = "8px";
      rowItem.style.fontSize = "0.85rem";
      rowItem.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
      rowItem.style.paddingBottom = "6px";
      
      let descText = "";
      if (item.action === "SOWING") {
        descText = `<strong>Sowing:</strong> ${item.crop} (${item.type}), ${item.trays} trays. Date: ${item.date}`;
      } else if (item.action === "TRANSPLANT") {
        descText = `<strong>Transplant:</strong> Row ${item.row} Line ${item.line} from Batch ${item.batch} (${item.towers} towers). Date: ${item.date}`;
      } else if (item.action === "HARVEST") {
        descText = `<strong>Harvest:</strong> Row ${item.row} Line ${item.line} - ${item.stage} (${item.yield} kg, Waste: ${item.waste} kg). Date: ${item.date}`;
      } else if (item.action === "CLEAR") {
        descText = `<strong>Clearance:</strong> Row ${item.row} Line ${item.line}. Reason: ${item.reason}. Date: ${item.date}`;
      }
      
      rowItem.innerHTML = `
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="wa-chk-${index}" checked style="width:auto; margin:0;">
          <span>Line ${item.lineNum}: ${descText}</span>
        </label>
      `;
      listEl.appendChild(rowItem);
    });
  }
}

function importParsedLogs() {
  if (tempParsedLogs.length === 0) return;
  
  let importCount = 0;
  
  tempParsedLogs.forEach((item, index) => {
    const chk = document.getElementById(`wa-chk-${index}`);
    if (chk && chk.checked) {
      if (item.action === "SOWING") {
        const sowDateObj = new Date(item.date);
        const germPeriod = getGerminationPeriod(item.type);
        const readyDateObj = new Date(sowDateObj);
        readyDateObj.setDate(readyDateObj.getDate() + germPeriod);
        
        const sowLog = {
          id: "SOW-" + (appState.sowingLogs.length + 1),
          crop: item.crop,
          type: item.type,
          trayCount: item.trays,
          sowDate: item.date,
          readyDate: readyDateObj.toISOString().split('T')[0],
          status: (new Date() >= readyDateObj) ? "ready" : "germinating",
          loggedBy: item.raw.employee || item.raw.worker || "System"
        };
        appState.sowingLogs.push(sowLog);
        importCount++;
        
      } else if (item.action === "TRANSPLANT") {
        const sourceBatch = appState.sowingLogs.find(s => s.id === item.batch);
        const cropName = sourceBatch ? sourceBatch.crop : "Unknown Crop";
        
        const cap = getLineCapacity(item.row);
        const towersCap = parseInt(appState.settings.towersPerLine);
        const plantsPerTower = cap / towersCap;
        
        const activeTx = appState.transplantLogs.find(t => t.row === item.row && t.line === item.line && t.status === "active");
        if (activeTx) {
          console.warn(`Row ${item.row} Line ${item.line} is already occupied. Skipping line ${item.lineNum}`);
          return;
        }
        
        const txLog = {
          id: "TX-" + (appState.transplantLogs.length + 1),
          date: item.date,
          row: item.row,
          line: item.line,
          trayBatchId: item.batch,
          towersPlanted: item.towers,
          plantsPlanted: item.towers * plantsPerTower,
          crop: cropName,
          status: "active",
          loggedBy: item.raw.employee || item.raw.worker || "System"
        };
        
        if (sourceBatch) sourceBatch.status = "transplanted";
        appState.transplantLogs.push(txLog);
        importCount++;
        
      } else if (item.action === "HARVEST") {
        const activeTx = appState.transplantLogs.find(t => t.row === item.row && t.line === item.line && t.status === "active");
        const cropName = activeTx ? activeTx.crop : "Unknown Crop";
        const txId = activeTx ? activeTx.id : null;
        
        const hrvLog = {
          id: "HRV-" + (appState.harvestLogs.length + 1),
          date: item.date,
          row: item.row,
          line: item.line,
          transplantLogId: txId,
          stage: item.stage,
          yieldKg: item.yield,
          wasteKg: item.waste,
          crop: cropName,
          loggedBy: item.raw.employee || item.raw.worker || "System"
        };
        appState.harvestLogs.push(hrvLog);
        importCount++;
        
      } else if (item.action === "CLEAR") {
        const activeTx = appState.transplantLogs.find(t => t.row === item.row && t.line === item.line && t.status === "active");
        const txId = activeTx ? activeTx.id : null;
        
        const clrLog = {
          id: "CLR-" + (appState.clearLogs.length + 1),
          date: item.date,
          row: item.row,
          line: item.line,
          transplantLogId: txId,
          reason: item.reason,
          loggedBy: item.raw.employee || item.raw.worker || "System"
        };
        
        if (activeTx) activeTx.status = "completed";
        appState.clearLogs.push(clrLog);
        importCount++;
      }
    }
  });
  
  if (importCount > 0) {
    saveState();
    refreshAll();
    
    document.getElementById("wa-paste-area").value = "";
    document.getElementById("wa-parse-preview").style.display = "none";
    document.getElementById("wa-parse-status").innerText = "";
    
    showToast(`Successfully imported ${importCount} log record(s).`, "success");
  } else {
    showToast("No records were selected or imported.", "danger");
  }
}

function copyMobileLoggerLink() {
  const url = appState.settings.supabaseUrl;
  const key = appState.settings.supabaseKey;
  const phone = appState.settings.whatsappPhone;
  const crops = appState.settings.cropCatalog.join(",");
  const emps = appState.settings.employeeCatalog.join(",");
  
  let baseUrl = appState.settings.publicUrl;
  if (!baseUrl) {
    baseUrl = window.location.href.split("index.html")[0];
  }
  
  if (!baseUrl.endsWith("/")) {
    baseUrl += "/";
  }
  
  const finalBase = baseUrl + "log.html";
  
  const params = new URLSearchParams();
  if (url) params.set("url", url);
  if (key) params.set("key", key);
  if (phone) params.set("phone", phone);
  params.set("crops", crops);
  params.set("emps", emps);
  
  const finalUrl = `${finalBase}?${params.toString()}`;
  
  navigator.clipboard.writeText(finalUrl)
    .then(() => showToast("Configured Mobile Logger URL copied to clipboard!", "success"))
    .catch(() => alert("Failed to copy automatically. Please copy the URL below:\n\n" + finalUrl));
}

async function postToSupabase(payload) {
  const url = appState.settings.supabaseUrl;
  const key = appState.settings.supabaseKey;
  if (!url || !key) return null;
  
  try {
    const cleanUrl = url.endsWith('/') ? url : url + '/';
    const dbUrl = `${cleanUrl}rest/v1/polyhouse_logs`;
    
    const response = await fetch(dbUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return data[0].id;
      }
    }
  } catch (e) {
    console.error("Failed to post action to Supabase:", e);
  }
  return null;
}

async function deleteFromSupabase(supabaseId) {
  const url = appState.settings.supabaseUrl;
  const key = appState.settings.supabaseKey;
  if (!url || !key || !supabaseId) return;
  
  try {
    const cleanUrl = url.endsWith('/') ? url : url + '/';
    const deleteEndpoint = `${cleanUrl}rest/v1/polyhouse_logs?id=eq.${supabaseId}`;
    
    await fetch(deleteEndpoint, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
  } catch (e) {
    console.error("Failed to delete from Supabase:", e);
  }
}
