 Fantasy Football Stats Viewer – Project Summary
🎯 Purpose
This web app displays and interacts with fantasy football player data, focusing on a sortable, searchable, and visually organized table. It allows users to:
Search for players by name
Highlight selected players
Easily identify positions with color-coded rows
⚙️ Technologies Used
HTML: Structures the page and content semantically.
CSS: Implements custom styling, including:
Fixed and sticky headers
Color-coded player positions
Responsive and accessible layout
JavaScript (optional/assumed): Adds interactivity such as:
Search filtering
Dynamic row highlighting
Excel (Data Source): Player stats are pulled from Excel sheets and imported into the site via HTML or JavaScript.
🧱 Site Structure
1. Fixed Header Elements
These remain visible as the user scrolls:
.header-bg: Full-width dark background bar (80px tall)
.home-button: Fixed-position "Home" link (top-left)
.title-container: Fixed center title – “Player Averages”
.search-box: Search input field (top-right)
2. Scrollable Content Area
.scroll-container: Contains the player stats table
Includes padding-top: 80px to ensure content begins below the fixed header
3. Player Stats Table
<table id="averages-table">: Main table displaying player stats
<thead>: Sticky headers (using top: 80px)
<tbody>: Player data rows with the following features:
Row Types:
Position classes: .WR, .RB, .QB, .TE, .K, .DST
.highlighted-row: Used for search results
.active-player-row: Visually distinct for selected players
.collapsible-panel: Expandable sections for more data (optional)
🎨 CSS Features
Fixed Headers: Persistent top elements for better navigation
Sticky Table Headers: Keep column names visible while scrolling
Color Coding: Visual separation of positions
Responsive Layout: Adapts using flex and relative positioning
Accessibility: High contrast, readable fonts, and visual emphasis
Transitions: Smooth animations for row highlighting and expansion
🔍 Search & Interaction
Search Box: Real-time filtering of player rows
Row Highlighting: Enlarges and colors matching rows with a bold red left border
Expandable Panels: (Optional) Reveals nested tables or extended stats when clicked
🔧 Future Improvements (Planned/Optional)
- Full mobile and tablet responsiveness
- Click-to-sort columns by stat values
- Import/export support for JSON or CSV data
- Player avatar images next to names
- Accordion-style UI for collapsible sections