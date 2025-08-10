// Import Firestore functions and your Firebase DB instance
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-config.js';

const playersList = document.getElementById("players");
const tierContainer = document.getElementById("tier-container");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn"); // Clear button element

const NUM_TIERS = 10;

// Dynamically create tier columns with dropzones
for (let i = 1; i <= NUM_TIERS; i++) {
  const tierDiv = document.createElement("div");
  tierDiv.className = "tier-column";
  tierDiv.dataset.tier = i;
  tierDiv.innerHTML = `
    <h3>Tier ${i}</h3>
    <div class="dropzone" data-tier="${i}"></div>
  `;

  const dropzone = tierDiv.querySelector(".dropzone");

  // Enable dragover and drop events for drag-and-drop functionality
  dropzone.addEventListener("dragover", e => e.preventDefault());
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const draggedEl = document.getElementById(draggedId);
    if (draggedEl) {
      dropzone.appendChild(draggedEl);
    }
  });

  tierContainer.appendChild(tierDiv);
}

// Load player data from tiers.json and create draggable list items
async function loadPlayers() {
  try {
    const res = await fetch("tiers.json");
    const data = await res.json();

    data.forEach(player => {
      const li = document.createElement("li");
      li.textContent = `${player.name} (${player.position}, ADP: ${player.adp})`;
      li.id = `player-${player.id || player.name.replace(/\s+/g, "-").toLowerCase()}`;
      li.className = "player-item";
      li.draggable = true;

      li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", li.id);
      });

      playersList.appendChild(li);
    });
  } catch (error) {
    console.error("Error loading players:", error);
  }
}

// Save tiers to Firestore
async function saveTiers() {
  const tiersData = {};

  document.querySelectorAll(".tier-column").forEach(tier => {
    const tierNum = tier.dataset.tier;
    const playersInTier = Array.from(tier.querySelectorAll(".dropzone > li"))
      .map(li => li.textContent);
    tiersData[`Tier_${tierNum}`] = playersInTier;
  });

  try {
    await setDoc(doc(db, "tiers", "user1"), tiersData);
    showToast("Saved!");
  } catch (error) {
    showToast("Error saving tiers: " + error.message);
  }
}

// Load saved tiers from Firestore and append players to their saved tiers
async function loadSavedTiers() {
  try {
    const docSnap = await getDoc(doc(db, "tiers", "user1"));
    if (docSnap.exists()) {
      const savedData = docSnap.data();
      for (const [tierKey, playerList] of Object.entries(savedData)) {
        const tierNum = tierKey.split("_")[1];
        const dropzone = document.querySelector(`.tier-column[data-tier='${tierNum}'] .dropzone`);

        playerList.forEach(playerText => {
          // Find the matching player element by text content
          const playerElement = Array.from(document.querySelectorAll(".player-item"))
            .find(li => li.textContent === playerText);
          if (playerElement) {
            dropzone.appendChild(playerElement);
          }
        });
      }
    }
  } catch (error) {
    console.error("Error loading saved tiers:", error);
  }
}

// Clear all tiers and move players back to left list
function clearTiers() {
  const tierPlayers = document.querySelectorAll(".tier-column .dropzone > li");
  tierPlayers.forEach(player => {
    playersList.appendChild(player);
  });
  showToast("Tiers cleared!");
}

// Toast notification helper
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.visibility = "visible";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => (toast.style.visibility = "hidden"), 500);
  }, 2500);
}

// Initialize
(async () => {
  await loadPlayers();
  await loadSavedTiers();
  saveBtn.addEventListener("click", saveTiers);
  clearBtn.addEventListener("click", clearTiers);
})();
