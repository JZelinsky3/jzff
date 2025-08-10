# Fantasy Football Tiers

A web application that allows users to organize fantasy football players into customizable tiers via drag-and-drop, with persistent storage using Firebase Firestore.

---

## Features

- Display a scrollable list of fantasy football players.
- Drag and drop players into 10 tier columns.
- Save and load tier assignments from Firebase Firestore.
- Clear tiers and reset all players to the original list.
- Responsive and modern dark-themed user interface.
- Toast notifications for save and clear actions.

---

## Demo

*(Add a link here if you deploy the app online, e.g., GitHub Pages, Vercel, Netlify)*

---

## Technologies Used

- **HTML5** and **CSS3** with Flexbox layout
- **JavaScript (ES6 Modules)** for DOM manipulation and drag-and-drop
- **Firebase Firestore** for backend data persistence
- **Firebase JavaScript SDK v10** for Firestore integration

---

## Getting Started

### Prerequisites

- A Firebase project with Firestore enabled
- Local web server (e.g., VS Code Live Server)

### Installation

1. Clone or download this repository.

2. Replace the Firebase configuration in `index.html` with your own Firebase project's config.

3. Ensure Firestore rules allow read/write access for your testing user or implement authentication.

4. Run a local server and open `index.html` in your browser.

### Usage

- Drag players from the left list into any tier column.
- Click **Save Tiers** to save your current setup.
- Click **Clear Tiers** to reset all players back to the list and clear saved data.
- Notifications will appear in the center bottom of the screen confirming actions.

---

## File Structure

- `index.html` — Main HTML layout and JavaScript module for app logic.
- `tiers.css` — Styling for the app, including layout, colors, and toast notifications.
- `tiers.json` — Sample JSON file containing player data (name, position, ADP, id).
- Firebase project and Firestore handle persistent storage.

---

## Firebase Setup

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).

2. Enable Firestore Database and configure rules to allow your app to read/write:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tiers/{userId} {
      allow read, write: if true;  // For testing only — restrict in production
    }
  }
}