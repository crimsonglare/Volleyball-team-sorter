import {
  auth, db, ref, set, get, remove, onValue,
  push, // Ensure push is imported
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase.js";

import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/modular/sortable.core.esm.js";

// --- DOM elements ---
const loginForm = document.getElementById("login-form");
const adminDashboard = document.getElementById("admin-dashboard");
const adminLoginBtn = document.getElementById("admin-login-btn");
const adminLogoutBtn = document.getElementById("admin-logout-btn");
const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");
const loginError = document.getElementById("login-error");

const adminNameInput = document.getElementById("admin-name-input");
const adminSkill = document.getElementById("admin-skill");
const saveAdminBtn = document.getElementById("save-admin-btn");
const playingToggle = document.getElementById("playing-toggle");
const toggleLabel = document.getElementById("toggle-label");

const waitingListElement = document.getElementById("waiting-list");
const waitingCountElement = document.getElementById("waiting-count");

const sortTeamsBtn = document.getElementById("sort-teams-btn");
const resortTeamsBtn = document.getElementById("resort-teams-btn");
const resetBtn = document.getElementById("reset-btn");

const teamsContainer = document.getElementById("teams-container");
const initialTeamsMsg = teamsContainer.querySelector("p");

const manualName = document.getElementById("manual-name");
const manualSkill = document.getElementById("manual-skill");
const addPlayerBtn = document.getElementById("add-player-btn");

const toastConfirm = document.getElementById("toast-confirm");
const confirmResetBtn = document.getElementById("confirm-reset-btn");
const cancelResetBtn = document.getElementById("cancel-reset-btn");

const editModeToggle = document.getElementById("edit-mode-toggle");
const editModeLabel = document.getElementById("edit-mode-label");
const undoBtn = document.getElementById("undo-btn");
const trashBin = document.getElementById("trash-bin"); // The trash bin element itself

const rulesAnnouncementsInput = document.getElementById("rules-announcements-input");
const saveRulesAnnouncementsBtn = document.getElementById("save-rules-announcements-btn");
const rulesAnnouncementsDisplay = document.getElementById("rules-announcements-display");

// --- State and Config ---
const adminEmails = ["admin@gmail.com", "owner@volleyball.com"];
const MIN_PLAYERS_TO_SORT = 12;
const TEAM_SIZE_LIMIT = 6;
let currentAdminUID = null;
const weightMap = { beginner: 5, intermediate: 10, competitive: 15 };
let editMode = false;
let lastMove = null; // Stores { previousTeamsState: Array }
let trashSortable = null; // Instance for the trash bin
let sortableInstances = []; // Instances for the team lists
let currentDisplayedTeams = []; // Track the array used for display/sortable

// --- Helper Functions ---

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "custom-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
      }, 500);
    }, 3000);
  }, 100);
}

// Renders teams and updates the currentDisplayedTeams variable
function displayTeams(teamsArray) {
    // Update the reference to the currently displayed teams
    currentDisplayedTeams = teamsArray ? JSON.parse(JSON.stringify(teamsArray)) : []; // Store a clone

    teamsContainer.innerHTML = "";
    if (!teamsArray || teamsArray.length === 0) {
        teamsContainer.innerHTML = "<p>No teams to display.</p>";
        destroySortable(); // Ensure sortable is off if no teams
        return;
    }

    teamsArray.forEach((teamObj, index) => {
        const team = teamObj.players || [];
        const teamDiv = document.createElement("div");
        teamDiv.className = "team-card";
        teamDiv.dataset.teamIndex = index;
        const displayWeight = teamObj.totalWeight ?? team.reduce((sum, p) => sum + (weightMap[p.skillLevel] || 0), 0);

        // Ensure team count in H3 is updated correctly based on current team length
        teamDiv.innerHTML = `
          <h3>Team ${index + 1} (${team.length}) <span class="team-weight">(Weight: ${displayWeight})</span></h3>
          <ul class="team-list" id="team-${index}"></ul>
        `;
        teamsContainer.appendChild(teamDiv);
        const ul = teamDiv.querySelector("ul");

        if (team.length > 0) {
             // Optional: sort for display consistency
             team.sort((a,b) => (weightMap[b.skillLevel] || 0) - (weightMap[a.skillLevel] || 0));

            team.forEach((player, playerIndex) => {
                const li = document.createElement("li");
                li.className = "player-item";
                li.id = `player-${player.name.replace(/[^a-zA-Z0-9-_]/g, "")}-${index}-${playerIndex}`;
                li.dataset.name = player.name;
                li.dataset.skillLevel = player.skillLevel;
                li.dataset.isSubstitute = player.isSubstitute || false;
                // Store index relative to this *rendered* list
                li.dataset.index = playerIndex;
                li.draggable = editMode;

                li.innerHTML = `
                  <span class="player-name">${player.name}</span>
                  <span class="player-details">(${player.skillLevel}${player.isSubstitute ? " - Sub 🟡" : ""})</span>
                `;
                ul.appendChild(li);
            });
        } else {
            ul.innerHTML = '<li class="no-players">No players</li>';
        }
    });

    // Handle sortable initialization/destruction based on editMode AFTER rendering
    if (editMode) {
        destroySortable();
        // Pass the *same array* that was just rendered (via the clone)
        initializeSortable(currentDisplayedTeams);
    } else {
         destroySortable();
    }
}

// Takes the *currently displayed* teams array to initialize SortableJS instances
function initializeSortable(displayedTeamsArray) {
    // console.log("Initializing Sortable with teams array:", displayedTeamsArray);
    destroySortable(); // Ensure clean slate

    sortableInstances = [];

    // Use the passed displayedTeamsArray length to iterate
    displayedTeamsArray.forEach((teamObj, index) => {
        const ul = document.getElementById(`team-${index}`);
        if (ul && !ul.dataset.sortableInitialized) {
            const sortableInstance = Sortable.create(ul, {
                group: "teams",
                animation: 150,
                draggable: ".player-item",
                filter: ".no-players",
                preventOnFilter: true,
                ghostClass: "sortable-ghost",
                chosenClass: "sortable-chosen",
                // --- onEnd: Handle drop within/between lists ---
                onEnd: async function (evt) {
                    const itemEl = evt.item;
                    const fromList = evt.from;
                    const toList = evt.to;
                    const oldIndex = evt.oldDraggableIndex; // Index in the FROM list (DOM)
                    const newIndex = evt.newDraggableIndex; // Index in the TO list (DOM)

                    // Ignore if no actual move happened within the same list
                    if (fromList === toList && oldIndex === newIndex) return;

                    const fromTeamCard = fromList.closest(".team-card");
                    const toTeamCard = toList.closest(".team-card");
                     // Check if the target list *element* IS the trash bin
                    const isToTrash = toList.id === 'trash-bin';

                    // --- CASE 1: Dropping into the trash bin ---
                    if (isToTrash) {
                        console.log(`onEnd (Team List): Detected drop into trash bin. Allowing trash 'onAdd' to handle.`);
                        // The trash bin's onAdd handler will remove the item from the data and save.
                        // SortableJS might visually remove the item from the source list; if not, the next displayTeams call will correct it.
                        return;
                    }

                    // --- CASE 2: Dropping into another team list (or reordering) ---
                    // If NOT going to trash, both from and to cards must be valid team cards.
                    if (!fromTeamCard || !toTeamCard) {
                        console.error(`Sortable onEnd Error: Could not find valid team cards (From: ${!!fromTeamCard}, To: ${!!toTeamCard}). Might be invalid drop area.`);
                        showToast("Drag error: Invalid drop location.");
                        displayTeams(currentDisplayedTeams); // Re-render based on current local state
                        return;
                    }

                    // --- Proceed with regular move logic ---
                    const fromTeamIndex = parseInt(fromTeamCard.dataset.teamIndex, 10);
                    const toTeamIndex = parseInt(toTeamCard.dataset.teamIndex, 10);

                    // --- Crucial: Use the tracked `currentDisplayedTeams` array ---
                    const localTeams = currentDisplayedTeams; // Use the array SortableJS is based on

                    // Verify the player exists at the oldIndex in the local array
                    const player = localTeams[fromTeamIndex]?.players?.[oldIndex];

                    if (!player) {
                        console.error(`Sortable onEnd Error: Player data not found at index ${oldIndex} in local team ${fromTeamIndex}. UI/Data mismatch?`);
                        showToast("Drag Error: Data mismatch. Refreshing.");
                        const snap = await get(ref(db, "teams"));
                        displayTeams(snap.exists() ? snap.val().teams : []); // Force render from DB
                        return;
                    }

                     console.log(`Local Move: '${player.name}' from Team ${fromTeamIndex + 1} [${oldIndex}] to Team ${toTeamIndex + 1} [${newIndex}]`);

                    // --- Store Previous State for Undo (Fetch from DB *before* local change) ---
                    let teamsBeforeMove = [];
                    try {
                        const snapshot = await get(ref(db, "teams"));
                        if (snapshot.exists() && snapshot.val().teams) {
                            teamsBeforeMove = JSON.parse(JSON.stringify(snapshot.val().teams));
                        }
                    } catch (fetchError) { console.error("Undo Fetch Error:", fetchError); }


                    // --- Modify the 'localTeams' (currentDisplayedTeams) array ---
                    // 1. Remove player from the 'from' team array
                    localTeams[fromTeamIndex].players.splice(oldIndex, 1);

                    // 2. Add player to the 'to' team array at the correct new index
                    if (!localTeams[toTeamIndex].players) localTeams[toTeamIndex].players = [];
                    localTeams[toTeamIndex].players.splice(newIndex, 0, player);

                    // 3. Recalculate properties for affected teams in the local array
                    recalculateTeamProperties(localTeams[fromTeamIndex]);
                    if (fromTeamIndex !== toTeamIndex) {
                        recalculateTeamProperties(localTeams[toTeamIndex]);
                    }

                    // --- Prepare Undo ---
                    if (teamsBeforeMove.length > 0) {
                        lastMove = { previousTeamsState: teamsBeforeMove };
                        undoBtn.disabled = false;
                    } else {
                        lastMove = null; undoBtn.disabled = true;
                    }

                    // --- Update the global tracker AND Save to Firebase ---
                    currentDisplayedTeams = localTeams; // Update the global tracker
                    await saveUpdatedTeams(currentDisplayedTeams); // Save the locally modified array

                }, // End of onEnd
            });
            sortableInstances.push(sortableInstance);
            ul.dataset.sortableInitialized = "true";
        }
    });

    // --- Initialize Trash Bin Sortable ---
    const trashBinElement = document.getElementById("trash-bin");
     if (trashBinElement && !trashSortable) {
        trashSortable = Sortable.create(trashBinElement, {
            group: "teams",
            animation: 150,
            ghostClass: "sortable-ghost-trash",
            // --- onAdd: Handle drop into trash ---
            onAdd: async function (evt) {
                const itemEl = evt.item;
                const fromList = evt.from;
                const fromTeamCard = fromList.closest(".team-card");
                const oldIndex = evt.oldDraggableIndex;

                // IMPORTANT: Remove visual item from trash immediately
                itemEl.parentNode.removeChild(itemEl);

                if (!fromTeamCard) { console.error("Trash Error: card not found."); return; }

                const fromTeamIndex = parseInt(fromTeamCard.dataset.teamIndex, 10);

                // --- Use the tracked `currentDisplayedTeams` array ---
                const localTeams = currentDisplayedTeams;
                const player = localTeams[fromTeamIndex]?.players?.[oldIndex];

                if (!player) {
                    console.error(`Trash Error: Player data not found at index ${oldIndex} in local team ${fromTeamIndex}.`);
                    showToast("Trash Error: Data mismatch. Refreshing.");
                    const snap = await get(ref(db, "teams"));
                    displayTeams(snap.exists() ? snap.val().teams : []);
                    return;
                }

                console.log(`Local Trash: '${player.name}' from Team ${fromTeamIndex + 1} [${oldIndex}]`);

                // --- Store Previous State for Undo ---
                let teamsBeforeMove = [];
                 try {
                    const snapshot = await get(ref(db, "teams"));
                    if (snapshot.exists() && snapshot.val().teams) {
                        teamsBeforeMove = JSON.parse(JSON.stringify(snapshot.val().teams));
                    }
                 } catch (fetchError) { console.error("Trash Undo Fetch Error:", fetchError); }

                // --- Modify the 'localTeams' array ---
                localTeams[fromTeamIndex].players.splice(oldIndex, 1); // Remove player

                // --- Recalculate properties ---
                recalculateTeamProperties(localTeams[fromTeamIndex]);

                // --- Prepare Undo ---
                if (teamsBeforeMove.length > 0) {
                    lastMove = { previousTeamsState: teamsBeforeMove };
                    undoBtn.disabled = false;
                } else {
                    lastMove = null; undoBtn.disabled = true;
                }

                // --- Update global tracker AND Save to Firebase ---
                currentDisplayedTeams = localTeams;
                await saveUpdatedTeams(currentDisplayedTeams);

            } // End of onAdd
        });
    }
} // End of initializeSortable


function destroySortable() {
  // console.log("Destroying Sortable instances...");
  sortableInstances.forEach(instance => {
    if (instance?.destroy) { try { instance.destroy(); } catch (e) { /* Ignore */ } }
  });
  sortableInstances = [];

  if (trashSortable?.destroy) { try { trashSortable.destroy(); } catch (e) { /* Ignore */ } }
  trashSortable = null;

  teamsContainer.querySelectorAll(".team-list[data-sortable-initialized='true']")
                .forEach(ul => delete ul.dataset.sortableInitialized);
  // console.log("Sortable instances destroyed.");
}

// --- Recalculate Team Properties Helper ---
function recalculateTeamProperties(teamData) {
    if (!teamData || !teamData.players) return;
    let totalWeight = 0;
    teamData.players.sort((a, b) => (weightMap[b.skillLevel] || 0) - (weightMap[a.skillLevel] || 0));
    teamData.players.forEach((p, index) => {
        p.isSubstitute = index >= TEAM_SIZE_LIMIT;
        totalWeight += weightMap[p.skillLevel] || 0;
    });
    teamData.totalWeight = totalWeight;
}


function loadRulesAndAnnouncements() {
  const rulesRef = ref(db, "rulesAndAnnouncements");
  onValue(rulesRef, (snapshot) => {
    const text = snapshot.val()?.text || "";
    rulesAnnouncementsDisplay.textContent = text || "No rules or announcements set.";
    rulesAnnouncementsInput.value = text;
  }, (error) => {
    console.error("Error loading rules:", error); showToast("Failed to load rules.");
    rulesAnnouncementsDisplay.textContent = "Error loading rules.";
  });
}

// Listener calls displayTeams with the canonical Firebase data
function listenForTeamUpdates() {
    const teamsDataRef = ref(db, "teams");
    onValue(teamsDataRef, (snapshot) => {
        const teamsArray = snapshot.val()?.teams; // Extract the array safely

        if (teamsArray && Array.isArray(teamsArray)) {
            // console.log("onValue received teams:", JSON.stringify(teamsArray));
            displayTeams(teamsArray); // Render based on Firebase truth
            checkAdminTeamStatus();

             if (!editMode) { // Clear undo if not actively editing
                lastMove = null; undoBtn.disabled = true;
            } else { // Keep undo state if editing
                 undoBtn.disabled = !lastMove;
            }

        } else { // Teams node deleted or invalid
            // console.warn("onValue: No valid 'teams' array found.");
            displayTeams([]); // Render empty state
            lastMove = null; undoBtn.disabled = true;
            undoBtn.classList.toggle('hidden', !editMode);
        }
    }, (error) => {
        console.error("Team listener error:", error); showToast("Error loading teams.");
        displayTeams([]); // Render empty on error
        lastMove = null; undoBtn.disabled = true; undoBtn.classList.toggle('hidden', !editMode);
    });
}


// --- Authentication and Admin Setup --- (Minimal changes needed below this line) ---

onAuthStateChanged(auth, async (user) => {
  if (user && adminEmails.includes(user.email)) {
    currentAdminUID = user.uid; showAdminDashboard();
  } else {
    if (auth.currentUser && user?.email && !adminEmails.includes(user.email)) { await signOut(auth); }
    showLoginForm(); currentAdminUID = null;
  }
});

adminLoginBtn.addEventListener("click", async (e) => {
  e.preventDefault(); const email = emailInput.value.trim(); const password = passwordInput.value.trim(); loginError.textContent = "";
  if (!email || !password) { loginError.textContent = "Enter email/password."; return; }
  try { const cred = await signInWithEmailAndPassword(auth, email, password); if (!adminEmails.includes(cred.user.email)) { loginError.textContent = "Access Denied."; await signOut(auth); } }
  catch (error) { console.error("Login Fail:", error); loginError.textContent = "Login Failed: " + (error.code === 'auth/invalid-credential' ? 'Bad email/pass.' : error.message); }
});

adminLogoutBtn.addEventListener("click", async () => { try { await signOut(auth); } catch (e) { console.error("Logout Fail:", e); showToast("Logout Error."); } });

function showLoginForm() {
    loginForm.classList.remove('hidden'); adminDashboard.classList.add('hidden'); emailInput.value = ""; passwordInput.value = ""; loginError.textContent = "";
    destroySortable(); editMode = false; editModeToggle.checked = false; editModeLabel.textContent = "Edit Mode Off";
    trashBin.classList.add('hidden'); trashBin.classList.remove('active'); undoBtn.classList.add('hidden'); lastMove = null; currentDisplayedTeams = [];
}

async function showAdminDashboard() {
  loginForm.classList.add('hidden'); adminDashboard.classList.remove('hidden'); loginError.textContent = "";
  if (!currentAdminUID) return;
  try {
      const snap = await get(ref(db, `users/${currentAdminUID}`));
      if (snap.exists()) { const d=snap.val(); adminNameInput.value=d.name||""; adminSkill.value=d.skillLevel||"intermediate"; playingToggle.checked=d.isPlaying||!1; toggleLabel.textContent=playingToggle.checked?"Playing":"Not Playing"; }
      else { adminNameInput.value=""; adminSkill.value="intermediate"; playingToggle.checked=!1; toggleLabel.textContent="Not Playing"; }
      loadWaitingList(); listenForTeamUpdates(); loadRulesAndAnnouncements(); await checkAdminTeamStatus();
  } catch(e) { console.error("Dash Init Error:", e); showToast("Dashboard load error."); }
}

async function checkAdminTeamStatus() {
  if (!currentAdminUID) return; let adminName = ""; let adminIsPlaying = !1;
  try {
      const adminSnap = await get(ref(db, `users/${currentAdminUID}`)); if (adminSnap.exists()) { adminName=adminSnap.val().name||""; adminIsPlaying=adminSnap.val().isPlaying||!1; }
      if (!adminName) return; const teamsSnap = await get(ref(db, "teams")); let found = !1;
      if (teamsSnap.exists() && teamsSnap.val().teams) teamsSnap.val().teams.forEach(t => { if (t.players?.some(p => p.name === adminName)) found = !0; });
      if (found) { playingToggle.checked = !1; toggleLabel.textContent = "Not Playing"; if (adminIsPlaying) { await set(ref(db, `users/${currentAdminUID}`), { name: adminName, skillLevel: adminSnap.val().skillLevel||"intermediate", isPlaying: !1 }); await remove(ref(db, `waitingList/${currentAdminUID}`)); showToast("Removed from waitlist (in team)."); } }
  } catch (e) { console.error("Admin Status Check Error:", e); showToast("Error checking admin status."); }
}

saveAdminBtn.addEventListener("click", async () => {
    if (!currentAdminUID) return; const name = adminNameInput.value.trim(); const skill = adminSkill.value; if (!name) { showToast("Enter name."); return; }
    try { const snap = await get(ref(db, `users/${currentAdminUID}`)); const isPlaying = snap.exists() ? snap.val().isPlaying : !1; await set(ref(db, `users/${currentAdminUID}`), { name, skillLevel: skill, isPlaying }); showToast("Details saved."); if (isPlaying) await updateWaitingList(name, skill, !0); }
    catch (e) { console.error("Save Details Error:", e); showToast("Save failed."); }
});

playingToggle.addEventListener("change", async () => {
    if (!currentAdminUID) return; const isPlaying = playingToggle.checked; const name = adminNameInput.value.trim(); const skill = adminSkill.value;
    if (isPlaying && !name) { showToast("Save name first."); playingToggle.checked = !1; return; } let inTeam = !1;
    try { const snap = await get(ref(db, "teams")); if (snap.exists() && snap.val().teams) inTeam = snap.val().teams.some(t => t.players?.some(p => p.name === name)); }
    catch (e) { console.error("Team Check Error:", e); showToast("Team check failed."); playingToggle.checked = !isPlaying; return; }
    if (isPlaying && inTeam) { showToast("Already in team."); playingToggle.checked = !1; return; } toggleLabel.textContent = isPlaying ? "Playing" : "Not Playing";
    try { await set(ref(db, `users/${currentAdminUID}`), { name, skillLevel: skill, isPlaying }); await updateWaitingList(name, skill, isPlaying); showToast(isPlaying ? "Joined waitlist." : "Left waitlist."); }
    catch (e) { console.error("Status Update Error:", e); showToast("Status update failed."); playingToggle.checked = !isPlaying; toggleLabel.textContent = playingToggle.checked ? "Playing" : "Not Playing"; }
});

async function updateWaitingList(name, skill, isPlaying) { if (!currentAdminUID) return; const listRef=ref(db, `waitingList/${currentAdminUID}`); try { if (isPlaying) await set(listRef, { name, skillLevel: skill }); else await remove(listRef); } catch (e) { console.error("Waitlist Update Error:", e); } }

function loadWaitingList() {
   const listRef = ref(db, "waitingList");
    onValue(listRef, (snapshot) => {
        waitingListElement.innerHTML = ""; let count = 0; let isAdmin = !1; const players = [];
        if (snapshot.exists()) { snapshot.forEach(s => { const p=s.val(); const k=s.key; if (!p.name||!p.skillLevel) return; if (k===currentAdminUID) isAdmin=!0; players.push({ key: k, ...p }); count++; }); players.sort((a,b)=>a.name.localeCompare(b.name)); players.forEach(p => { const li=document.createElement("li"); li.textContent=`${p.name} (${p.skillLevel})`; if (p.key===currentAdminUID) { li.textContent+=" (You)"; li.style.fontWeight='bold'; } waitingListElement.appendChild(li); }); }
        if (count === 0) waitingListElement.innerHTML = "<li class='no-players'>No players waiting.</li>";
        waitingCountElement.textContent = count; if (currentAdminUID && !isAdmin && playingToggle.checked) { playingToggle.checked = !1; toggleLabel.textContent = "Not Playing"; }
    }, (e) => { console.error("Waitlist Load Error:", e); showToast("Waitlist load failed."); waitingListElement.innerHTML = "<li class='error'>Error loading list.</li>"; });
}

// --- Team Sorting and Management ---

async function sortTeams() {
  const waitRef = ref(db, "waitingList"); const snapshot = await get(waitRef);
  if (!snapshot.exists() || snapshot.size < MIN_PLAYERS_TO_SORT) { showToast(`Min ${MIN_PLAYERS_TO_SORT} players needed. Have ${snapshot.size || 0}.`); return; }
  let players = []; snapshot.forEach(s => { const p = s.val(); if(p.name && p.skillLevel) players.push({ name: p.name, skillLevel: p.skillLevel, weight: weightMap[p.skillLevel.toLowerCase()] || 5, isSubstitute: !1 }); });
  if (players.length < MIN_PLAYERS_TO_SORT) { showToast(`Min ${MIN_PLAYERS_TO_SORT} valid players needed. Found ${players.length}.`); return; }
  const teams = balanceAndDistribute(players); if (!teams || teams.length === 0) { console.error("Sort Balance Fail"); return; }
  try { await set(ref(db, "teams"), { teams }); await remove(waitRef); console.log("Teams sorted."); showToast("Teams sorted!"); lastMove = null; undoBtn.disabled = !0; }
  catch (e) { console.error("Sort Save Error:", e); showToast("Sort error."); }
}

async function resortTeams() {
    let all = []; const waitRef = ref(db, "waitingList"); const teamsRef = ref(db, "teams");
    try {
        const waitSnap = await get(waitRef); if (waitSnap.exists()) waitSnap.forEach(s => { const p = s.val(); if(p.name && p.skillLevel) all.push({ name: p.name, skillLevel: p.skillLevel, weight: weightMap[p.skillLevel.toLowerCase()] || 5, isSubstitute: !1 }); });
        const teamSnap = await get(teamsRef); if (teamSnap.exists() && teamSnap.val().teams) teamSnap.val().teams.forEach(t => (t.players || []).forEach(p => { if(p.name && p.skillLevel) all.push({ name: p.name, skillLevel: p.skillLevel, weight: weightMap[p.skillLevel.toLowerCase()] || 5, isSubstitute: !1 }); }));
        const map = new Map(); all.forEach(p => map.set(p.name.toLowerCase(), p)); const unique = Array.from(map.values());
        if (unique.length < MIN_PLAYERS_TO_SORT) { showToast(`Min ${MIN_PLAYERS_TO_SORT} needed. Found ${unique.length}.`); return; }
        const newTeams = balanceAndDistribute(unique); if (!newTeams || newTeams.length === 0) { console.error("Resort Balance Fail"); return; }
        await set(teamsRef, { teams: newTeams }); await remove(waitRef); console.log("Teams resorted."); showToast("Teams resorted!"); lastMove = null; undoBtn.disabled = !0;
    } catch (e) { console.error("Resort Error:", e); showToast("Resort error."); }
}

// --- Team Balancing Logic (Using Old Style Separation) ---
function balanceAndDistribute(players) {
    const num = players.length; if (num < MIN_PLAYERS_TO_SORT) { console.error("Balance: Too few players."); showToast(`Min ${MIN_PLAYERS_TO_SORT} required.`); return []; }
    const numTeams = Math.floor(num / TEAM_SIZE_LIMIT); if (numTeams < 2) { console.error(`Balance: Cannot form >= 2 teams.`); showToast(`Cannot form >= 2 teams.`); return []; }
    const numMains = Math.min(numTeams * TEAM_SIZE_LIMIT, num); const numSubs = num - numMains;
    console.log(`Balancing ${num} into ${numTeams} teams. ${numMains} main, ${numSubs} subs.`);
    let teams = Array(numTeams).fill().map(() => ({ players: [], totalWeight: 0 })); players.sort((a,b) => b.weight - a.weight);
    const mainP = players.slice(0, numMains); const subP = players.slice(numMains);
    for (let i = 0; i < mainP.length; i++) { let t = teams.reduce((m, c) => c.totalWeight < m.totalWeight ? c : m, teams[0]); mainP[i].isSubstitute = !1; t.players.push(mainP[i]); t.totalWeight += mainP[i].weight; }
    for (let i = 0; i < subP.length; i++) { let t = teams.reduce((m, c) => c.totalWeight < m.totalWeight ? c : m, teams[0]); subP[i].isSubstitute = !0; t.players.push(subP[i]); t.totalWeight += subP[i].weight; }
    teams.forEach(t => { t.players.sort((a,b) => b.weight - a.weight); t.totalWeight = t.players.reduce((s, p) => s + (weightMap[p.skillLevel] || 0), 0); });
    console.log("Balancing done:", teams); return teams;
}


async function saveUpdatedTeams(teamsArray) { const data = { teams: teamsArray }; try { await set(ref(db, "teams"), data); } catch (e) { console.error("Save Teams Error:", e); showToast("Save failed."); } }

// --- Event Listeners ---
sortTeamsBtn.addEventListener("click", sortTeams);
resortTeamsBtn.addEventListener("click", resortTeams);
resetBtn.addEventListener("click", () => { toastConfirm.classList.remove('hidden'); });
confirmResetBtn.addEventListener("click", async () => { try { await remove(ref(db, "waitingList")); await remove(ref(db, "teams")); toastConfirm.classList.add('hidden'); showToast("Data reset."); lastMove = null; undoBtn.disabled = !0; } catch (e) { console.error("Reset Error:", e); showToast("Reset failed."); toastConfirm.classList.add('hidden'); } });
cancelResetBtn.addEventListener("click", () => { toastConfirm.classList.add('hidden'); });
addPlayerBtn.addEventListener("click", async () => { const n=manualName.value.trim(); const s=manualSkill.value; if(!n){showToast("Enter name.");return;} try {await set(push(ref(db,"waitingList")),{name:n,skillLevel:s});showToast(`${n} added.`);manualName.value="";manualSkill.value="intermediate";} catch(e){console.error("Add Player Error:",e);showToast("Add failed.");} });

// --- Edit Mode ---
editModeToggle.addEventListener("change", async () => {
    editMode = editModeToggle.checked; editModeLabel.textContent = editMode ? "Edit Mode ON" : "Edit Mode Off";
    trashBin.classList.toggle('active', editMode); trashBin.classList.toggle('hidden', !editMode);
    undoBtn.classList.toggle('hidden', !editMode); undoBtn.disabled = !lastMove;
    const snap = await get(ref(db, "teams")); const teams = snap.exists() ? snap.val().teams : [];
    displayTeams(teams); // This now correctly calls initialize/destroy
});

// --- Undo Logic ---
undoBtn.addEventListener("click", async () => {
  if (!lastMove?.previousTeamsState) { showToast("Nothing to undo."); return; }
  console.log("Attempting undo...");
  try { await set(ref(db, "teams"), { teams: lastMove.previousTeamsState }); lastMove = null; undoBtn.disabled = !0; showToast("Undo successful."); }
  catch (e) { console.error("Undo error:", e); showToast("Undo failed."); lastMove = null; undoBtn.disabled = !0; }
});

// --- Rules ---
saveRulesAnnouncementsBtn.addEventListener("click", saveRulesAndAnnouncements);
function saveRulesAndAnnouncements() { const t=rulesAnnouncementsInput.value.trim(); set(ref(db,"rulesAndAnnouncements"),{text:t}).then(()=>showToast("Rules updated!")).catch(e=>{console.error("Rules Save Error:",e);showToast("Rules save failed.");}); }

// --- Initial Load --- handled by onAuthStateChanged