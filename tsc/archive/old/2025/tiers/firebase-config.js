// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

export { db };
