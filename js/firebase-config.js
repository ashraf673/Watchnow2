// =====================================================
// Firebase Configuration
// =====================================================

const firebaseConfig = {
  apiKey: "AIzaSyBvvci69O5aGl6G2BKyqi2pMV3YJWxQrYk",
  authDomain: "watchnow-a43d8.firebaseapp.com",
  databaseURL: "https://watchnow-a43d8-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "watchnow-a43d8",
  storageBucket: "watchnow-a43d8.firebasestorage.app",
  messagingSenderId: "698409253921",
  appId: "1:698409253921:web:d6f70270d7977eef3af760"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();