// Firebase config (from project)
const firebaseConfig = {
  apiKey: "AIzaSyCEp4u8R_9sJf15BtN35nYJdYUptmr42js",
authDomain: "ai-smart-public-complaint.firebaseapp.com",
projectId: "ai-smart-public-complaint",
storageBucket: "ai-smart-public-complaint.firebasestorage.app",
messagingSenderId: "443095807586",
appId: "1:443095807586:web:8e69f1c1ca682a22ecc33b"
};

// Initialize Firebase (compat SDK expected)
if (typeof firebase !== 'undefined' && typeof firebase.initializeApp === 'function') {
  try {
    // Avoid re-initializing if already initialized
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    // Expose commonly used services
    window.firebaseAuth = firebase.auth();
    window.firebaseDB = firebase.firestore();
    window.firebaseStorage = firebase.storage();
    console.log('Firebase initialized');
  } catch (e) {
    console.warn('Firebase init error:', e);
  }
} else {
  console.warn('Firebase SDK not loaded. Make sure you included Firebase scripts.');
}