document.addEventListener("DOMContentLoaded", () => {

/* ================= SOUND ================= */
const sounds = {
  introSound: new Audio("../assets/sounds/yeatintro.mp3"),
};

sounds.introSound.volume = 0.5;
sounds.introSound.load();

let introSoundPlaying = false;

// toggle music function
function toggleIntroSound() {
  const sound = sounds.introSound;
  if (introSoundPlaying) {
    sound.pause();
    introSoundPlaying = false;
  } else {
    sound.play().catch(() => {});
    introSoundPlaying = true;
  }
}

/* ================= INTRO SCREENS ================= */
let introTimeouts = [];

function runIntroScreens() {
  const intro0 = document.getElementById("intro0");
  const intro1 = document.getElementById("intro1");
  const intro2 = document.getElementById("intro2");
  const intro3 = document.getElementById("intro3");

  // show intro0 (black) instantly
  intro0.classList.remove("hidden");
  intro0.style.opacity = 1;
  intro1.classList.add("show-underline");

  // START MUSIC ONCE
  if (!introSoundPlaying) {
    sounds.introSound.currentTime = 0;
    sounds.introSound.play().catch(() => {});
    introSoundPlaying = true;
  }

  // fade into intro1
  introTimeouts.push(setTimeout(() => {
    intro0.style.opacity = 0;

    setTimeout(() => {
      intro0.classList.add("hidden");

      // show intro1
      intro1.classList.remove("hidden");
      intro1.style.opacity = 1;

      // fade out intro1 after 2.5s
      setTimeout(() => {
        intro1.style.opacity = 0;

        setTimeout(() => {
          intro1.classList.add("hidden");

          // show intro2 (brown)
          intro2.classList.remove("hidden");
          intro2.style.opacity = 1;

          setTimeout(() => {
            intro2.style.opacity = 0;

            setTimeout(() => {
              intro2.classList.add("hidden");

              // show intro3 (gold)
              intro3.classList.remove("hidden");
              intro3.style.opacity = 1;

              setTimeout(() => {
                endIntroScreens();
              }, 4000);

            }, 1000);

          }, 2500);

        }, 1000);

      }, 2500);

    }, 1000);

  }, 1500));
}

function endIntroScreens() {
  document.getElementById("introScreen").style.opacity = 0;

  setTimeout(() => {
    document.getElementById("introScreen").style.display = "none";
    document.getElementById("main").style.opacity = 1;
  }, 1000);
}

/* ================= MUSIC TOGGLE BUTTON ================= */
document.getElementById("musicToggleBtn").addEventListener("click", () => {
  toggleIntroSound();
});

/* ================= START INTRO ================= */
window.addEventListener("DOMContentLoaded", () => {
  runIntroScreens();
});

/* ================= PLAYER DATA ================= */
const players = {
  "Joey 🏆": {logo: "../assets/logos/gooners.png", score: 61.19, win: ".552", record: "53-43", last: "8th", chips: 1, podiums: 4, playoffs: 4, avg_finish: 5.29},
  "Mason 🏆": {logo: "../assets/logos/rizzlers2.png", score: 57.05, win: ".583", record: "56-40", last: "1st", chips: 1, podiums: 2, playoffs: 3, avg_finish: 6.43},
  "Chris 🏆": {logo: "../assets/logos/kylerthecreator.png", score: 51.32, win: ".531", record: "51-45", last: "9th", chips: 1, podiums: 2, playoffs: 4, avg_finish: 5.71},
  "Connie 🏆": {logo: "../assets/logos/tequilasunrise.png", score: 49.89, win: ".479", record: "46-50", last: "2nd", chips: 1, podiums: 3, playoffs: 4, avg_finish: 5.57},
  "Sean": {logo: "../assets/logos/thefamilyguy2.png", score: 47.89, win: ".583", record: "56-40", last: "10", chips: 0, podiums: 2, playoffs: 4, avg_finish: 6.29},
  "Andrew 🏆": {logo: "../assets/logos/bodix2.png", score: 41.24, win: ".479", record: "46-50", last: "3rd", chips: 1, podiums: 3, playoffs: 5, avg_finish: 5.43},
  "Isaac 🏆": {logo: "../assets/logos/childofgod2.png", score: 32.89, win: ".554", record: "46-37", last: "5th", chips: 1, podiums: 2, playoffs: 4, avg_finish: 6},
  "Connor": {logo: "../assets/logos/thepeoplestightend2.png", score: 32.22, win: ".438", record: "42-54", last: "7th", chips: 0, podiums: 1, playoffs: 2, avg_finish: 7.71},
  "Kyle": {logo: "../assets/logos/gingerninger2.png", score: 20.06, win: ".479", record: "46-50", last: "4th", chips: 0, podiums: 0, playoffs: 4, avg_finish: 7.14},
  "Luke 🏆": {logo: "../assets/logos/theglizzys2.png", score: 13.32, win: ".458", record: "38-45", last: "12th", chips: 1, podiums: 1, playoffs: 3, avg_finish: 7.5},
  "Charlie": {logo: "../assets/logos/moneygod2.png", score: 7.27, win: ".479", record: "46-50", last: "6th", chips: 0, podiums: 0, playoffs: 2, avg_finish: 7.86},
  "Evan": {logo: "../assets/logos/whiteboyfootball2.png", score: 5.54, win: ".405", record: "17-25", last: "11th", chips: 0, podiums: 0, playoffs: 1, avg_finish: 8.67}
};

/* ================= CONFERENCES ================= */
const skim = ["Mason 🏆","Luke 🏆","Charlie","Andrew 🏆","Chris 🏆","Isaac 🏆"];
const whole = ["Sean","Evan","Connie 🏆","Joey 🏆","Connor","Kyle"];

/* ================= ORDER ================= */
const order = [];
for (let i = 0; i < whole.length; i++) {
  order.push({ name: skim[i], conf: "skim" });
  order.push({ name: whole[i], conf: "whole" });
}

/* ================= BOARD ================= */
const grid = document.getElementById("boardGrid");
[...skim, ...whole]
  .sort(() => Math.random() - 0.5)
  .forEach(name => {
    const cell = document.createElement("div");
    cell.className = "board-cell";
    cell.innerText = name;
    cell.id = "row-" + name;
    grid.appendChild(cell);
  });

/* ================= STATE ================= */
let index = 0;
let phase = 0;

/* ================= BUTTON ================= */
const btn = document.getElementById("revealBtn");

btn.addEventListener("click", () => {

  if (index >= order.length) {
    revealScores();
    return;
  }

  const pick = order[index];
  highlight(pick.conf);

  if (phase === 0) {
    showBlackCard(pick);
    phase = 1;
  } 
  else if (phase === 1) {
    showStatsOnly(pick);
    phase = 2;
  } 
  else if (phase === 2) {
    revealPlayer(pick);
    phase = 3;
  } 
  else {
    fly(pick);
    phase = 0;
    index++;
  }

});

/* ================= FUNCTIONS ================= */

function showStatsOnly(pick) {
  const card = document.getElementById("global-card");
  const d = players[pick.name];
  const isChamp = pick.name === "Mason 🏆";

  card.style.boxShadow = isChamp
    ? "0 0 60px rgba(255,215,0,0.35)"
    : "0 0 50px rgba(62,207,255,0.25)";

  card.innerHTML = `
    ${isChamp ? '<div class="champ-badge">2025 CHAMP</div>' : ""}
    <img class="card-logo hidden-reveal" src="${d.logo}">
    <div class="card-name name-hidden">${pick.name}</div>

    <div class="card-top">
      <div>${d.record}<br><span>All-Time</span></div>
      <div>${d.last}<br><span>Last Year</span></div>
    </div>

    <div class="card-stats">
      <div class="stat-box">🏆 ${d.chips}<br><span>Champs</span></div>
      <div class="stat-box">🥇 ${d.podiums}<br><span>Podiums</span></div>
      <div class="stat-box">🎯 ${d.playoffs}<br><span>Playoffs</span></div>
      <div class="stat-box">🔥 ${d.avg_finish}<br><span>Avg Finish</span></div>
    </div>
  `;
}

function highlight(conf) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-conf"));
  document.querySelector("." + conf).classList.add("active-conf");
}

function showBlackCard(pick) {
  const card = document.getElementById("global-card");

  const confLogo = pick.conf === "whole"
    ? "../assets/logos/whole.png"
    : "../assets/logos/skim.jpg";

  card.innerHTML = `
    <div class="card-reveal">
      <div class="reveal-text">Next Up:</div>
      <img src="${confLogo}" class="reveal-logo">
    </div>
  `;

  card.classList.add("show");
}

function revealPlayer(pick) {
  const card = document.getElementById("global-card");

  const logo = card.querySelector(".card-logo");
  const name = card.querySelector(".card-name");

  logo.classList.remove("hidden-reveal");
  name.classList.remove("name-hidden");

  logo.classList.add("fade-in");
  name.classList.add("fade-in");
}

function fly(pick) {
  const card = document.getElementById("global-card");
  const target = document.getElementById(pick.conf);
  const d = players[pick.name];

  const div = document.createElement("div");
  div.className = "player";

  const isChamp = pick.name === "Mason 🏆";

  div.innerHTML = `
    <div class="left">
      <img class="logo" src="${d.logo}">
      <span class="name-text">
        ${pick.name}
        ${isChamp ? '<span class="mini-champ-badge">2025 Champ</span>' : ""}
      </span>
    </div>
    <span class="stat">${d.win}</span>
  `;

  target.appendChild(div);

  const c = card.getBoundingClientRect();
  const t = div.getBoundingClientRect();

  const dx = t.left - c.left;
  const dy = t.top - c.top;

  card.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.3)`;
  card.style.opacity = 0;

  setTimeout(() => {
    card.classList.remove("show");
    card.style.transform = "translate(-50%, -50%) scale(0.9)";
    card.style.opacity = "";

    document.querySelectorAll(".player").forEach(p => p.classList.remove("latest"));
    div.classList.add("latest", "show");

    document.getElementById("row-" + pick.name)?.classList.add("taken");
  }, 600);
}

function revealScores() {
  document.querySelectorAll(".player").forEach((p, i) => {
    const name = p.querySelector(".name-text").innerText;
    const stat = p.querySelector(".stat");

    setTimeout(() => {
      stat.innerText = players[name].score;
    }, i * 100);
  });
}

});