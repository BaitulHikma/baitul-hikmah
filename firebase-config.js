// ============================================================================
// PASTE YOUR FIREBASE PROJECT CONFIG BELOW (see README.md — "Notifications
// Setup" section for exactly where to get each value; it's free).
// This one file is shared by both app.js (main app) and sw.js (background
// notifications) so you only have to fill it in once.
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_FIREBASE_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

// The "Web Push certificate" key from Firebase Console → Project Settings →
// Cloud Messaging → Web configuration. Needed to request a notification token.
const FIREBASE_VAPID_KEY = "PASTE_YOUR_VAPID_KEY";
