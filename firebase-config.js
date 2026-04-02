// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAxtEkrEgl0C9djPkxKKX-sENtOzPEbHB8",
    authDomain: "tope-e5350.firebaseapp.com",
    databaseURL: "https://tope-e5350-default-rtdb.firebaseio.com",
    projectId: "tope-e5350",
    storageBucket: "tope-e5350.firebasestorage.app",
    messagingSenderId: "187788115549",
    appId: "1:187788115549:web:0f3c00ff62c1ebc5ed97b4",
    measurementId: "G-YERBCEZEW9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// Cloudinary Configuration
const CLOUD_NAME = 'daemk3hut';
const UPLOAD_PRESET = 'fok2_k';

// Agora Configuration
const AGORA_APP_ID_CALL = '929646610d814d529a06c4081c81325f';
const AGORA_APP_ID_LIVE = '75d6c13a4f494ea8ad181eb55b641b79';

// Admin Configuration
const ADMIN_EMAIL = 'jasim28v@gmail.com';
const ADMIN_PASSWORD = 'vv2314vv';

console.log('✅ GLOW - Firebase, Cloudinary & Agora Ready');
