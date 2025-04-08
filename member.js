import { db, ref, push, set, onValue, remove, get } from "./firebase.js";

// --- Get elements ---
const joinSection = document.getElementById("join-section");
const nameInput = document.getElementById("name");
const skillSelect = document.getElementById("skill");
const joinButton = document.getElementById("join-btn");

const userInfoDiv = document.getElementById("user-info");
const displayName = document.getElementById("display-name");
const displaySkill = document.getElementById("display-skill");

const leaveButton = document.getElementById("leave-btn");

const statusMsg = document.getElementById("status-msg");

const teamInfoDiv = document.getElementById("team-info");
const teamNameEl = document.getElementById("team-name");
const teamMatesEl = document.getElementById("team-mates");

const rulesAnnouncementsDisplay = document.getElementById("rules-announcements-display");

const toast = document.getElementById("toast"); // For regular notifications

// --- Confirmation Toast Elements --- Get references
const confirmToast = document.getElementById("confirm-toast");
const confirmMsg = document.getElementById("confirm-msg");
const confirmYesBtn = document.getElementById("confirm-yes-btn");
const confirmNoBtn = document.getElementById("confirm-no-btn");


// --- Firebase Refs ---
const waitingListRef = ref(db, "waitingList");
const teamsRef = ref(db, "teams"); // Parent node { teams: [...] }
const rulesRef = ref(db, "rulesAndAnnouncements");

// --- State ---
let currentUserName = localStorage.getItem("volleyballUserName");
const weightMap = { beginner: 5, intermediate: 10, competitive: 15 };

// --- Helper Functions ---

// For regular, short notifications
function showToast(message) {
  toast.innerText = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

// --- Show/Hide Confirmation Toast ---
function showConfirmToast(message, onConfirm) {
    confirmMsg.textContent = message;

    // Define cleanup function
    const cleanup = () => {
        confirmToast.classList.add('hidden');
        // Remove listeners after use to prevent memory leaks
        confirmYesBtn.removeEventListener('click', yesHandler);
        confirmNoBtn.removeEventListener('click', noHandler);
    };

    // Define button handlers
    const yesHandler = () => {
        cleanup();
        onConfirm(); // Execute the action passed to onConfirm
    };
    const noHandler = () => {
        cleanup();
        // No action needed, just close the toast
    };

    // Remove any previous listeners before adding new ones
    confirmYesBtn.removeEventListener('click', yesHandler);
    confirmNoBtn.removeEventListener('click', noHandler);

    // Add the new listeners
    confirmYesBtn.addEventListener('click', yesHandler);
    confirmNoBtn.addEventListener('click', noHandler);

    // Show the toast
    confirmToast.classList.remove('hidden');
}


// Function to update UI based on user state
function updateUserInterface() {
    currentUserName = localStorage.getItem("volleyballUserName");
    const assignedTeamData = localStorage.getItem("assignedTeam");

    if (currentUserName) {
        // --- USER IS JOINED (Waiting or Teamed) ---
        joinSection.classList.add("hidden"); // Hide join form
        leaveButton.classList.remove("hidden"); // *** SHOW LEAVE BUTTON ***

        if (assignedTeamData) {
            try {
                const team = JSON.parse(assignedTeamData);
                displayAssignedTeam(team); // Show team info
                userInfoDiv.classList.add("hidden"); userInfoDiv.classList.remove("visible");
                statusMsg.classList.add("hidden"); statusMsg.classList.remove("visible");
            } catch (e) {
                console.error("Error parsing assigned team data:", e);
                localStorage.removeItem("assignedTeam"); // Clear invalid data
                displayWaitingState(); // Fallback to waiting state
            }
        } else {
            // User is likely in the waiting list
            displayWaitingState();
        }
    } else {
        // --- USER IS NOT JOINED ---
        resetUI(); // Show join form, hide everything else
    }
}

// Helper to display the "waiting" state UI elements
function displayWaitingState() {
     teamInfoDiv.classList.add("hidden"); teamInfoDiv.classList.remove("visible");
     displayName.innerText = currentUserName;
     displaySkill.innerText = 'Loading...'; // Placeholder
     userInfoDiv.classList.remove("hidden"); userInfoDiv.classList.add("visible"); // Show user info
     statusMsg.textContent = "⏳ Waiting for admin to sort teams...";
     statusMsg.classList.remove("hidden"); statusMsg.classList.add("visible"); // Show waiting message
     fetchUserSkillFromWaitingList(currentUserName); // Attempt to show skill
}


// Fetches skill level specifically for the user info display when waiting
async function fetchUserSkillFromWaitingList(userName) {
     try {
         const snapshot = await get(waitingListRef);
         if(snapshot.exists()) {
             let found = false;
             snapshot.forEach(childSnap => {
                 const data = childSnap.val();
                 if(data.name === userName) {
                     displaySkill.innerText = data.skillLevel || 'Unknown';
                     found = true; return; // Exit loop
                 }
             });
             if (!found) displaySkill.innerText = '(Not waiting)';
         } else { displaySkill.innerText = '(Empty list)'; }
     } catch (error) { console.error("Skill fetch error:", error); displaySkill.innerText = '(Error)'; }
}


// Function to display the assigned team details
function displayAssignedTeam(team) {
    if (!team || typeof team !== 'object' || !Array.isArray(team.players)) {
        console.warn("Invalid team data:", team); localStorage.removeItem("assignedTeam"); displayWaitingState(); return;
    }
    teamNameEl.textContent = team.teamName || `Your Team`;
    teamMatesEl.innerHTML = "";
    team.players.sort((a, b) => (weightMap[b.skillLevel] || 0) - (weightMap[a.skillLevel] || 0));
    team.players.forEach(player => {
      const li = document.createElement("li"); const isCurrentUser = player.name === currentUserName;
      li.innerHTML = `${player.name} ${isCurrentUser ? '<strong>(You)</strong>' : ''}<span class="player-details">(${player.skillLevel}${player.isSubstitute ? " - Sub 🟡" : ""})</span>`;
      if (player.isSubstitute) li.classList.add("substitute-player");
      teamMatesEl.appendChild(li);
    });
    teamInfoDiv.classList.remove("hidden"); teamInfoDiv.classList.add("visible");
    statusMsg.classList.add("hidden"); statusMsg.classList.remove("visible");
    userInfoDiv.classList.add("hidden"); userInfoDiv.classList.remove("visible");
    leaveButton.classList.remove("hidden"); // Ensure visible
}


// Function to reset UI to initial state (not joined)
function resetUI() {
  console.log("Resetting UI.");
  joinSection.classList.remove("hidden");
  userInfoDiv.classList.add("hidden"); userInfoDiv.classList.remove("visible");
  statusMsg.classList.add("hidden"); statusMsg.classList.remove("visible");
  teamInfoDiv.classList.add("hidden"); teamInfoDiv.classList.remove("visible");
  leaveButton.classList.add("hidden"); // *** HIDE LEAVE BUTTON ***
  confirmToast.classList.add('hidden'); // Ensure confirm toast is hidden

  nameInput.value = ""; skillSelect.value = "intermediate";
  displayName.innerText = ""; displaySkill.innerText = "";
  teamNameEl.textContent = ""; teamMatesEl.innerHTML = "";

  localStorage.removeItem("volleyballUserName");
  localStorage.removeItem("assignedTeam");
  currentUserName = null;
}


// --- Event Listeners ---

// Join button action
joinButton.addEventListener("click", async () => {
  const name = nameInput.value.trim(); const skill = skillSelect.value;
  if (!name) { showToast("Enter name."); return; }
  if (localStorage.getItem("volleyballUserName")) { showToast("Already joined."); return; }
   try { const snapshot = await get(waitingListRef); let exists = !1; if(snapshot.exists()) snapshot.forEach(c => { if(c.val().name?.toLowerCase() === name.toLowerCase()) exists = !0; }); if (exists) { showToast(`"${name}" already waiting.`); return; } }
   catch (e) { console.error("Name check error:", e); }
  localStorage.setItem("volleyballUserName", name); currentUserName = name;
  const userRef = push(waitingListRef); try { await set(userRef, { name, skillLevel: skill }); showToast("Joined! Waiting..."); updateUserInterface(); }
  catch (e) { console.error("Join error:", e); showToast("Failed to join."); localStorage.removeItem("volleyballUserName"); currentUserName = null; updateUserInterface(); }
});

// --- LEAVE BUTTON --- uses confirmation toast ---
leaveButton.addEventListener("click", () => {
  const userName = localStorage.getItem("volleyballUserName");
  if (!userName) { console.warn("Leave clicked, no user."); resetUI(); return; }

  // Show the confirmation toast instead of confirm()
  showConfirmToast(`Leave the game, ${userName}?`, async () => {
      // This function runs if "Yes" is clicked
      console.log(`Proceeding to leave: ${userName}`);
      showToast("Leaving game..."); // Use regular toast for feedback

      try {
          const removed = await removeMemberFromFirebase(userName);
          if (removed) {
              console.log(`${userName} removed.`); showToast("You have left the game."); resetUI();
          } else {
              console.warn(`${userName} not found for removal.`); showToast("Could not remove (already removed?)."); resetUI();
          }
      } catch (error) {
          console.error("Leave process error:", error); showToast("Error leaving. Please try again.");
          // Don't reset UI on error, allow retry
      }
  });
});


// --- Helper: Remove Member from Firebase --- (Keep this function as is)
async function removeMemberFromFirebase(memberName) {
  let removed = false;
  const teamsDataRef = ref(db, "teams");

  try {
    // 1. Remove from waiting list
    const waitSnap = await get(waitingListRef);
    if (waitSnap.exists()) {
      let userKey = null;
      waitSnap.forEach(s => { if (s.val().name === memberName) userKey = s.key; });
      if (userKey) {
        await remove(ref(db, `waitingList/${userKey}`));
        console.log(`${memberName} removed from waiting list.`);
        removed = true;
      }
    }

    // 2. Remove from teams
    const teamSnap = await get(teamsDataRef);
    if (teamSnap.exists() && teamSnap.val().teams) {
        const currentTeams = teamSnap.val().teams || [];
        let modified = false;
        currentTeams.forEach((team, index) => {
            const initialLength = team.players?.length || 0;
            if (team.players) {
                team.players = team.players.filter(p => p.name !== memberName);
                 if (team.players.length < initialLength) {
                    console.log(`${memberName} removed from Team ${index + 1}`);
                    removed = true; modified = true;
                    recalculateTeamProperties(team); // Recalculate after removal
                 }
            }
        });
        if (modified) {
            await set(teamsDataRef, { teams: currentTeams });
            console.log("Updated teams saved after removal.");
        }
    }
    return removed;
  } catch (error) { console.error(`Error removing ${memberName}:`, error); throw error; }
}

// --- Recalculate Helper --- (Keep this function)
function recalculateTeamProperties(teamData) {
    if (!teamData || !teamData.players) return;
    const TEAM_SIZE_LIMIT = 6;
    let totalWeight = 0;
    teamData.players.sort((a, b) => (weightMap[b.skillLevel] || 0) - (weightMap[a.skillLevel] || 0));
    teamData.players.forEach((p, index) => { p.isSubstitute = index >= TEAM_SIZE_LIMIT; totalWeight += weightMap[p.skillLevel] || 0; });
    teamData.totalWeight = totalWeight;
}


// --- Real-time Listeners --- (Keep these functions as is) ---

function listenForTeamUpdates() {
  onValue(teamsRef, (snapshot) => {
    const currentName = localStorage.getItem("volleyballUserName"); if (!currentName) return;
    const teamsArray = snapshot.val()?.teams;
    if (teamsArray && Array.isArray(teamsArray)) {
      let foundTeamData = null; let teamIndex = -1;
      teamsArray.forEach((team, index) => { if (team.players?.some(p => p.name === currentName)) { foundTeamData = { teamName: `Team ${index + 1}`, ...team }; teamIndex = index; } });
      if (foundTeamData) { localStorage.setItem("assignedTeam", JSON.stringify(foundTeamData)); updateUserInterface(); }
      else { if (localStorage.getItem("assignedTeam")) { showToast("Teams updated, now waiting."); localStorage.removeItem("assignedTeam"); } updateUserInterface(); }
    } else { if (localStorage.getItem("assignedTeam")) { showToast("Teams reset by admin."); localStorage.removeItem("assignedTeam"); } updateUserInterface(); }
  }, (error) => { console.error("Team listener error:", error); showToast("Error receiving team updates."); updateUserInterface(); });
}

function loadRulesAndAnnouncements() {
  onValue(rulesRef, (snapshot) => { const text = snapshot.val()?.text; rulesAnnouncementsDisplay.textContent = text || "No rules set."; },
  (error) => { console.error("Rules load error:", error); showToast("Failed to load rules."); rulesAnnouncementsDisplay.textContent = "Error loading rules."; });
}

function listenForWaitingListChanges() {
    onValue(waitingListRef, (snapshot) => {
        const currentName = localStorage.getItem("volleyballUserName"); if (!currentName || localStorage.getItem("assignedTeam")) return;
        let userWaiting = !1; if (snapshot.exists()) snapshot.forEach(s => { if (s.val().name === currentName) userWaiting = !0; });
        if (!userWaiting) { console.log(`${currentName} not waiting. Resetting.`); showToast("Removed from waiting list."); resetUI(); }
        else { fetchUserSkillFromWaitingList(currentName); }
    }, (error) => { console.error("Waiting list listener error:", error); });
}


// --- Initial Page Load Logic ---

function initializeMemberPage() {
    console.log("Initializing member page...");
    updateUserInterface(); // Set initial UI
    listenForTeamUpdates(); // Start listening
    loadRulesAndAnnouncements();
    listenForWaitingListChanges();
}

// Start the application
initializeMemberPage();