// /account/role-router.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { firebaseConfig } from "/tiers/firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Track user's role
let userRole = "guest";

// Check auth state and set role
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    localStorage.setItem("userRole", "guest");
    return; // Stay on page, but no user-specific access
  }

  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);
  userRole = docSnap.exists() ? docSnap.data().role : "guest";
  localStorage.setItem("userRole", userRole);

  // Show/hide elements based on role
  if (userRole === "master") {
    document.querySelectorAll(".role-master").forEach(el => el.style.display = "block");
  }
  if (userRole === "admin" || userRole === "master") {
    document.querySelectorAll(".role-admin").forEach(el => el.style.display = "block");
  }
  if (["member", "editor", "admin", "master"].includes(userRole)) {
    document.querySelectorAll(".role-member").forEach(el => el.style.display = "block");
  }
});