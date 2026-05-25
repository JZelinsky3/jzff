const movedUp = [
  "Emeka Egbuka","Chase Brown","Jacory Croskey-Merrit","Matthew Golden",
  "Austin Ekeler","Jonathan Taylor","Michael Pittman Jr","Keon Coleman",
  "TreVeyon Henderson","JK Dobbins","D'Andre Swift","Christian McCaffrey",
  "Omarion Hampton","Keenan Allen","Jordan Mason","Cooper Kupp",
  "Stefon Diggs","Jayden Higgins"
];

const movedDown = [
  "Brian Robinson Jr","Joe Mixon","Quinshon Judkins","Marvin Mims Jr",
  "Breece Hall","Bo Nix","Justin Herbert","Caleb WIlliams",
  "Marvin Harrison Jr","Jordan Addison","Khalil Shakir"
];

const visibleColumns = [
  "PRank Avg",
  "Avg Rank",
  "Name",
  "Min Rank",
  "Max Rank",
  "Avg Min/Max",
  "Rank 1 (ESPN)",
  "PRank 1 (ESPN)",
  "Rank 2 (FPros)",
  "PRank 2 (FPros)",
  "Rank 3 (CBS)",
  "PRank 3 (CBS)",
  "Rank 4 (Ringer)",
  "PRank (Ringer)",
  "Rank 5 (NFL)",
  "PRank 5 (NFL)",
  "Rank 6 (Roto)",
  "PRank 6 (Roto)"
];

let playerData = {}; // stores merged WR/TE + RB data

// Utility: Strip team abbreviation and normalize
function stripTeam(name) {
  return name.replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
}

// Highlight movers
function highlightMovers() {
  const rows = document.querySelectorAll('#averages-table tbody tr');
  rows.forEach(row => {
    const nameCell = row.cells[2]; // Name column
    if (!nameCell) return;

    const playerName = stripTeam(nameCell.textContent);

    // Remove previous classes first
    row.classList.remove('moved-up', 'moved-down');

    if (movedUp.some(name => stripTeam(name) === playerName)) {
      row.classList.add("moved-up");
    } else if (movedDown.some(name => stripTeam(name) === playerName)) {
      row.classList.add("moved-down");
    }
  });
}

// Load WR/TE and RB CSVs
Promise.all([
  fetch('./data/wrs_tes.csv').then(r => r.ok ? r.text() : Promise.reject('wrs_tes.csv failed')),
  fetch('./data/rbs.csv').then(r => r.ok ? r.text() : Promise.reject('rbs.csv failed'))
])
.then(([wrsText, rbsText]) => {
  [wrsText, rbsText].forEach(csvText => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(c => c.trim());
      const playerName = row[headers.indexOf("Names")];
      playerData[playerName] = {};
      headers.forEach((header, idx) => {
        playerData[playerName][header] = row[idx];
      });
    }
  });

  loadAveragesTable();
})
.catch(err => console.error('Error loading WR/RB CSVs:', err));

// Load averages.csv and build main table
function loadAveragesTable() {
  fetch('./data/averages.csv')
    .then(res => res.ok ? res.text() : Promise.reject('averages.csv failed'))
    .then(csvText => {
      const lines = csvText.trim().split('\n');
      const allHeaders = lines[0].split(',').map(h => h.trim());

      const visibleIndexes = allHeaders
        .map((h, i) => visibleColumns.includes(h) ? i : -1)
        .filter(i => i !== -1);

      const tbody = document.querySelector('#averages-table tbody');
      const thead = document.querySelector('#averages-table thead');

      // Build header row
      const headerRow = document.createElement('tr');
      visibleIndexes.forEach(i => {
        const th = document.createElement('th');
        const headerText = allHeaders[i];
        if (headerText.includes('(')) {
          const parts = headerText.split('(');
          th.innerHTML = parts[0].trim() + '<br>(' + parts[1];
        } else {
          th.textContent = headerText;
        }
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      // Build rows
      for (let i = 1; i < lines.length; i++) {
        const rowData = lines[i].split(',').map(c => c.trim());
        const tr = document.createElement('tr');

        const prank = rowData[allHeaders.indexOf("PRank Avg")];
        const posMatch = prank.match(/^[A-Z]+/);
        const pos = posMatch ? posMatch[0] : '';
        tr.classList.add(pos);

        visibleIndexes.forEach(idx => {
          const cell = rowData[idx] || '';
          const td = document.createElement('td');

          if (allHeaders[idx] === "Name") {
            const span = document.createElement('span');
            span.textContent = cell;
            span.style.cursor = 'pointer';
            span.style.textDecoration = 'none';
            span.style.color = 'black';

            // Skip togglePanel for K, QB, DST
            span.addEventListener('click', () => {
              if (tr.classList.contains('K') || tr.classList.contains('QB') || tr.classList.contains('DST')) {
                return;
              }
              togglePanel(cell, tr);
            });

            td.appendChild(span);
          } else {
            td.textContent = cell;
          }

          if (allHeaders[idx] === "Avg Rank") {
            td.style.backgroundColor = 'transparent';
          } else if (cell === '') {
            td.classList.add('empty-cell');
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      }

      // Highlight movers **after all rows are added**
      highlightMovers();
    })
    .catch(err => console.error('Error loading averages.csv:', err));
}

// Toggle collapsible panel for player
function togglePanel(playerNameWithTeam, tableRow) {
  const tbody = document.querySelector('#averages-table tbody');
  const nextRow = tableRow.nextElementSibling;
  if (nextRow && nextRow.classList.contains('collapsible-panel')) {
    tbody.removeChild(nextRow);
    tableRow.classList.remove('active-player-row');
    return;
  }

  document.querySelectorAll('.collapsible-panel').forEach(p => p.remove());
  document.querySelectorAll('.active-player-row').forEach(r => r.classList.remove('active-player-row'));

  tableRow.classList.add('active-player-row');

  const panelRow = document.createElement('tr');
  panelRow.classList.add('collapsible-panel');

  const td = document.createElement('td');
  td.colSpan = visibleColumns.length;

  const strippedName = stripTeam(playerNameWithTeam);
  const matchedKey = Object.keys(playerData).find(key => stripTeam(key) === strippedName);
  const extraData = matchedKey ? playerData[matchedKey] : null;

  if (!extraData) {
    td.textContent = `No additional data found for ${playerNameWithTeam}`;
  } else {
    const infoTable = document.createElement('table');
    infoTable.style.width = '100%';
    infoTable.style.borderCollapse = 'collapse';

    const headerRow = document.createElement('tr');
    const dataRow = document.createElement('tr');

    for (const key in extraData) {
      if (key === "Names") continue;

      const th = document.createElement('th');
      th.textContent = key;
      th.style.border = '1px solid #ccc';
      th.style.padding = '6px 10px';
      th.style.backgroundColor = '#eee';
      th.style.fontWeight = 'bold';
      th.style.textAlign = 'center';

      const tdStat = document.createElement('td');
      tdStat.textContent = extraData[key];
      tdStat.style.border = '1px solid #ccc';
      tdStat.style.padding = '6px 10px';
      tdStat.style.textAlign = 'center';

      headerRow.appendChild(th);
      dataRow.appendChild(tdStat);
    }

    infoTable.appendChild(headerRow);
    infoTable.appendChild(dataRow);
    td.appendChild(infoTable);
  }

  panelRow.appendChild(td);
  tbody.insertBefore(panelRow, tableRow.nextSibling);
}

// Search & highlight functions (unchanged)
function clearHighlights() {
  const highlightedRows = document.querySelectorAll('.highlighted-row');
  highlightedRows.forEach(row => {
    row.classList.remove('highlighted-row');
    row.style.backgroundColor = '';
    const nameSpan = row.querySelector('td:nth-child(3) span');
    if (nameSpan) nameSpan.style.color = '';
  });
}

function searchPlayer() {
  const input = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!input) return;

  clearHighlights();

  const rows = Array.from(document.querySelectorAll('#averages-table tbody tr'))
    .filter(row => !row.classList.contains('collapsible-panel'));

  let foundAny = false;

  for (const row of rows) {
    if (row.classList.contains('active-player-row')) continue;
    const nameSpan = row.querySelector('td:nth-child(3) span');
    if (!nameSpan) continue;

    const playerName = stripTeam(nameSpan.textContent);

    if (playerName.includes(input)) {
      row.classList.add('highlighted-row');
      if (!foundAny) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        foundAny = true;
      }
    }
  }

  if (!foundAny) alert(`No player found matching: "${input}"`);
}

document.getElementById('searchInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchPlayer();
  }
});

const searchBox = document.querySelector('.search-box');
document.addEventListener('click', (event) => {
  if (!searchBox.contains(event.target)) clearHighlights();
});

// Horizontal scroll title fix
window.addEventListener('scroll', () => {
  const scrollX = window.scrollX;
  const titleContainer = document.querySelector('.title-container');
  if (titleContainer) titleContainer.style.setProperty('--scroll-x', `${scrollX}px`);
});
