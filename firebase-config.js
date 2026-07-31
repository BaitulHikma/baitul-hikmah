// ============================================================================
// PASTE YOUR FIREBASE PROJECT CONFIG BELOW (see README.md — "Notifications
// Setup" section for exactly where to get each value; it's free).
// This one file is shared by both app.js (main app) and sw.js (background
// notifications) so you only have to fill it in once.
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBDUoi7Z9sJriapb7pAH4AEykVFq9-5kJQ",
  authDomain: "baitulhikmah-d7d0a.firebaseapp.com",
  projectId: "baitulhikmah-d7d0a",
  messagingSenderId: "1043386927102",
  appId: "1:1043386927102:web:133f6e852738f316b9e2af"
};

// The "Web Push certificate" key from Firebase Console → Project Settings →
// Cloud Messaging → Web configuration. Needed to request a notification token.
const FIREBASE_VAPID_KEY = "BAPPnGk7LK955UdizgD8rBs_ZjNr0Gf4q0D0du5L3gaQQ7qk8Sz44RqbotThdC6efvQz6ZZdrp_0wGsttkv6s3Y";
