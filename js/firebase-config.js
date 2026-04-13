import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7X2lFf0_cHgM5n0VwmhbfKZjXYGNDIzk",
  authDomain: "ma-crm-c662d.firebaseapp.com",
  projectId: "ma-crm-c662d",
  storageBucket: "ma-crm-c662d.firebasestorage.app",
  messagingSenderId: "1066017787188",
  appId: "1:1066017787188:web:0183e5158335ff74732961"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
