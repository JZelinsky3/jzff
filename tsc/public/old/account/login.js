const userRef = doc(db, "users", user.uid);
const docSnap = await getDoc(userRef);
const role = docSnap.exists() ? docSnap.data().role : "guest";

// Redirect based on role
if (role === "guest") {
  window.location.href = "/index.html";
} else {
  window.location.href = "/home.html";
}
