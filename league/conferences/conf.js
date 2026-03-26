document.addEventListener("DOMContentLoaded", () => {

/* PLAYER DATA */
const players = {
  "Joey 🏆": {logo: "../assets/logos/gooners.png", score: 61.19, win: ".642", record: "80-50", last: "3rd", chips: 1, podiums: 3, playoffs: 6, streak: 5},
  "Mason 🏆": {logo: "../assets/logos/rizzlers2.png", score: 57.05, win: ".701", record: "89-43", last: "1st", chips: 2, podiums: 5, playoffs: 7, streak: 8},
  "Chris 🏆": {logo: "../assets/logos/kylerthecreator.png", score: 51.32, win: ".655", record: "82-48", last: "2nd", chips: 1, podiums: 4, playoffs: 6, streak: 6},
  "Connie 🏆": {logo: "../assets/logos/tequilasunrise.png", score: 49.89, win: ".612", record: "78-52", last: "4th", chips: 1, podiums: 3, playoffs: 5, streak: 4},
  "Sean": {logo: "../assets/logos/thefamilyguy2.png", score: 47.89, win: ".588", record: "75-55", last: "6th", chips: 0, podiums: 1, playoffs: 4, streak: 3},
  "Andrew 🏆": {logo: "../assets/logos/bodix2.png", score: 41.24, win: ".601", record: "77-53", last: "5th", chips: 1, podiums: 2, playoffs: 5, streak: 5},
  "Isaac 🏆": {logo: "../assets/logos/childofgod2.png", score: 32.89, win: ".677", record: "85-45", last: "2nd", chips: 1, podiums: 4, playoffs: 6, streak: 7},
  "Connor": {logo: "../assets/logos/thepeoplestightend2.png", score: 32.22, win: ".523", record: "68-62", last: "7th", chips: 0, podiums: 1, playoffs: 3, streak: 2},
  "Kyle": {logo: "../assets/logos/gingerninger2.png", score: 20.06, win: ".498", record: "65-65", last: "8th", chips: 0, podiums: 0, playoffs: 2, streak: 2},
  "Luke 🏆": {logo: "../assets/logos/theglizzys2.png", score: 13.32, win: ".455", record: "60-70", last: "12th", chips: 1, podiums: 1, playoffs: 3, streak: 3},
  "Charlie": {logo: "../assets/logos/moneygod2.png", score: 7.27, win: ".472", record: "62-68", last: "9th", chips: 0, podiums: 1, playoffs: 3, streak: 2},
  "Evan": {logo: "../assets/logos/whiteboyfootball2.png", score: 5.54, win: ".430", record: "55-75", last: "10th", chips: 0, podiums: 0, playoffs: 2, streak: 1}
};

/* CONFERENCES */
const whole = ["Joey 🏆","Connie 🏆","Sean","Connor","Kyle","Evan"];
const skim = ["Mason 🏆","Chris 🏆","Andrew 🏆","Isaac 🏆","Luke 🏆","Charlie"];

/* ORDER */
const order = [];
for (let i = 0; i < whole.length; i++) {
  order.push({ name: whole[i], conf: "whole" });
  order.push({ name: skim[i], conf: "skim" });
}

/* RANDOM BOARD */
const grid = document.getElementById("boardGrid");
[...whole, ...skim]
  .sort(() => Math.random() - 0.5)
  .forEach(name => {
    const cell = document.createElement("div");
    cell.className = "board-cell";
    cell.innerText = name;
    cell.id = "row-" + name;
    grid.appendChild(cell);
  });

/* STATE */
let index = 0;
let phase = 0; 
// 0 = black card
// 1 = stats only
// 2 = full reveal
// 3 = fly to conference

/* INTRO */
setTimeout(() => {
  document.getElementById("introScreen").style.opacity = 0;
  setTimeout(() => {
    document.getElementById("introScreen").style.display = "none";
    document.getElementById("main").style.opacity = 1;
  }, 1000);
}, 1500);

/* BUTTON */
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
    showStatsOnly(pick);   // NEW STEP
    phase = 2;
  } 
  else if (phase === 2) {
    revealPlayer(pick);
    phase = 3;
  } 
  else if (phase === 3) {
    fly(pick);
    phase = 0;
    index++;
  }

});

function showStatsOnly(pick) {
  const card = document.getElementById("global-card");
  const d = players[pick.name];

  card.innerHTML = `
    <img class="card-logo hidden-reveal" src="${d.logo}">
    <div class="card-name name-hidden">${pick.name}</div>

    <div class="card-top">
      <div>${d.record}<br><span>All-Time</span></div>
      <div>${d.last}<br><span>2025</span></div>
    </div>

    <div class="card-stats">
      <div class="stat-box">🏆 ${d.chips}<br><span>Champs</span></div>
      <div class="stat-box">🥇 ${d.podiums}<br><span>Podiums</span></div>
      <div class="stat-box">🎯 ${d.playoffs}<br><span>Playoffs</span></div>
      <div class="stat-box">🔥 ${d.streak}<br><span>Streak</span></div>
    </div>
  `;
}

/* HIGHLIGHT ACTIVE CONF */
function highlight(conf) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active-conf"));
  document.querySelector("." + conf).classList.add("active-conf");
}

/* BLACK CARD */
function showBlackCard(pick) {
  const card = document.getElementById("global-card");

  const confName = pick.conf === "whole" ? "Whole" : "Skim";

  card.innerHTML = `
    <div class="card-reveal">
      NEXT UP: <u>${confName.toUpperCase()}</u>
    </div>
  `;

  card.classList.add("show");
}

function revealPlayer(pick) {
  const card = document.getElementById("global-card");

  const logo = card.querySelector(".card-logo");
  const name = card.querySelector(".card-name");

  logo.classList.remove("hidden-reveal");
  logo.classList.add("fade-in");

  name.classList.remove("name-hidden");
  name.classList.add("fade-in");

}

/* FLY TO CONF */
function fly(pick) {
  const card = document.getElementById("global-card");
  const target = document.getElementById(pick.conf);

  const d = players[pick.name];

  const div = document.createElement("div");
  div.className = "player";

  div.innerHTML = `
    <div class="left">
      <img class="logo" src="${d.logo}">
      <span class="name-text">${pick.name}</span>
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
    div.classList.add("latest");

    div.classList.add("show");

    document.getElementById("row-" + pick.name)?.classList.add("taken");
  }, 600);
}

/* FINAL SCORES */
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