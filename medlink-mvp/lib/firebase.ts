import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Firebase configuration sourced from environment variables.
// Set NEXT_PUBLIC_FIREBASE_* in your .env.local and as Cloud Run build args.
// IMPORTANT: Add your deployed Cloud Run URL to Firebase Console →
//   Authentication → Settings → Authorized Domains for sign-in to work.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAeW68CmETCcHBI4PAcFThX2_xPxEE7SQA",
  authDomain: `${process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT || "prompt-wars-hyd-mar-20"}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT || "prompt-wars-hyd-mar-20",
  storageBucket: `${process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT || "prompt-wars-hyd-mar-20"}.firebasestorage.app`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "545506175753",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:545506175753:web:5eaa740e446306a3e541d8",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-J65NWPNK41",
};

// Initialize Firebase once (singleton guard for Next.js hot reload)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize services
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // Firebase Storage — for persisting prescription images

// Request profile + email scopes explicitly for a richer user identity token
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");
googleProvider.addScope("email");

export { db, auth, googleProvider, storage };
