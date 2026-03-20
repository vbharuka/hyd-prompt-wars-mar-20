import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Replace these with your project's Firebase configuration from the Firebase console
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAeW68CmETCcHBI4PAcFThX2_xPxEE7SQA",
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "prompt-war-hyderabad"}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "prompt-war-hyderabad",
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "prompt-war-hyderabad"}.firebasestorage.app`,
  messagingSenderId: "545506175753",
  appId: "1:545506175753:web:5eaa740e446306a3e541d8",
  measurementId: "G-J65NWPNK41"
};

// Initialize Firebase once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize services
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
