import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// ===== Firebase config =====
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

// ===== Admin login state =====
let isAdmin = false;
if (localStorage.getItem("isAdmin") === "true") {
  isAdmin = true;
  document.getElementById("authBtn").textContent = "Logout";
  document.getElementById("adminPostBox").style.display = "block";
}

// ===== Login toggle =====
document.getElementById("authBtn").addEventListener("click", () => {
  if (isAdmin) {
    isAdmin = false;
    localStorage.removeItem("isAdmin");
    document.getElementById("authBtn").textContent = "Login";
    document.getElementById("adminPostBox").style.display = "none";
    loadNews();
  } else {
    const password = prompt("Enter admin password:");
    if (password === "Milk67") {
      isAdmin = true;
      localStorage.setItem("isAdmin", "true");
      document.getElementById("authBtn").textContent = "Logout";
      document.getElementById("adminPostBox").style.display = "block";
      loadNews();
    } else {
      alert("Incorrect password.");
    }
  }
});

// ===== Post news =====
document.getElementById("submitPost").addEventListener("click", async () => {
  const title = document.getElementById("newTitle").value.trim();
  const body = document.getElementById("newBody").value.trim();
  if (!title || !body) return;

  const now = new Date();
  const timestamp = now.toLocaleDateString("en-US") + " " + now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });

  await addDoc(collection(db, "league_news"), {
    title,
    body,
    date: timestamp,
    comments: []
  });

  document.getElementById("newTitle").value = "";
  document.getElementById("newBody").value = "";
  loadNews();
});

// ===== Load all posts =====
async function loadNews() {
  const container = document.getElementById("newsList");
  container.innerHTML = "";

  const querySnapshot = await getDocs(collection(db, "league_news"));
  const posts = [];
  querySnapshot.forEach(docSnap => {
    const data = docSnap.data();
    data.id = docSnap.id;
    posts.push(data);
  });

  posts.reverse().forEach(post => {
    const article = document.createElement("article");
    article.innerHTML = `
      <h4>${post.title}</h4>
      <p>${post.body}</p>
      <div class="comment-section" id="comments-${post.id}">
        <strong>Comments:</strong>
        ${(post.comments || []).map((c, idx) => {
          const del = isAdmin
            ? `<button class="delete-comment" data-post="${post.id}" data-idx="${idx}">❌</button>`
            : "";
          return `<p><em>${c.name}:</em> ${c.text}${del}</p>`;
        }).join("")}
        <button class="toggle-comment" data-id="${post.id}">Comment</button>
        <form class="comment-form" style="display:none" onsubmit="return saveComment('${post.id}', this)">
          <input type="text" name="name" placeholder="Your name" required />
          <textarea name="text" placeholder="Write a comment..." required></textarea>
          <button type="submit">Reply</button>
        </form>
      </div>
      <div class="post-date" style="margin-top: 10px;">${post.date}</div>
    `;

    if (isAdmin) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑 Delete Post";
      delBtn.onclick = async () => {
        if (confirm("Delete this post?")) {
          await deleteDoc(doc(db, "league_news", post.id));
          loadNews();
        }
      };
      article.appendChild(delBtn);
    }

    container.appendChild(article);
  });

  // Show/hide comment form
  document.querySelectorAll(".toggle-comment").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = btn.nextElementSibling;
      form.style.display = form.style.display === "none" ? "flex" : "none";
    });
  });
}

// ===== Save comment =====
window.saveComment = async (postId, form) => {
  const name = form.name.value.trim();
  const text = form.text.value.trim();
  if (!name || !text) return false;

  const comment = { name, text };
  const postRef = doc(db, "league_news", postId);
  await updateDoc(postRef, {
    comments: arrayUnion(comment)
  });

  form.reset();
  loadNews();
  return false;
};

// ===== Delete comment =====
document.addEventListener("click", async e => {
  if (e.target.classList.contains("delete-comment")) {
    const postId = e.target.getAttribute("data-post");
    const index = parseInt(e.target.getAttribute("data-idx"));
    if (!confirm("Delete this comment?")) return;

    const postRef = doc(db, "league_news", postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;

    const data = postSnap.data();
    const updated = [...(data.comments || [])];
    updated.splice(index, 1);

    await updateDoc(postRef, { comments: updated });
    loadNews();
  }
});

// ===== League Chat =====
document.getElementById("chatFormFixed").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("chatNameFixed").value.trim();
  const text = document.getElementById("chatInputFixed").value.trim();
  if (!name || !text) return;

  await addDoc(collection(db, "league_chat"), {
    name,
    text,
    timestamp: Date.now()
  });

  document.getElementById("chatInputFixed").value = "";
});

// ===== Live chat feed =====
onSnapshot(collection(db, "league_chat"), snapshot => {
  const messages = [];
  snapshot.forEach(doc => messages.push(doc.data()));
  messages.sort((a, b) => a.timestamp - b.timestamp);

  const box = document.getElementById("chatMessagesFixed");
  box.innerHTML = messages.map(m => `<p><strong>${m.name}:</strong> ${m.text}</p>`).join('');
  box.scrollTop = box.scrollHeight;
});

// ===== Init =====
loadNews();
