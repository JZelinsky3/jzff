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

// ✅ Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAUk7lfFezJ-pL_-MaDSIoL5RzogPnJw4c",
  authDomain: "ffootball-1ffa4.firebaseapp.com",
  projectId: "ffootball-1ffa4",
  storageBucket: "ffootball-1ffa4.appspot.com",
  messagingSenderId: "214820317243",
  appId: "1:214820317243:web:00907255d3ee230f21541e",
  measurementId: "G-H9LQY4GWSN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🔐 Role-based logic
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("User is not logged in");
    return;
  }

  const docRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(docRef);
  const role = docSnap.exists() ? docSnap.data().role : "guest";

  console.log("User role is:", role);

  if (role === "master") {
    document.querySelectorAll(".role-master").forEach(el => el.style.display = "block");
  }
  if (role === "admin" || role === "master") {
    document.querySelectorAll(".role-admin").forEach(el => el.style.display = "block");
  }
  if (role === "editor" || role === "admin" || role === "master") {
    document.querySelectorAll(".role-editor").forEach(el => el.style.display = "block");
  }
  if (role === "member" || role === "editor" || role === "admin" || role === "master") {
    document.querySelectorAll(".role-member").forEach(el => el.style.display = "block");
  }
});
