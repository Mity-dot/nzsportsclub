import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyB77lAHEx-XN7ZPYjwRmikCTYi_BEzS9dk",
  authDomain: "pushnotsnz.firebaseapp.com",
  projectId: "pushnotsnz",
  storageBucket: "pushnotsnz.firebasestorage.app",
  messagingSenderId: "370180691160",
  appId: "1:370180691160:web:3297f6c807f7427c0d73ad",
  measurementId: "G-09XBG6201R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get messaging instance (only in browser)
let messaging: Messaging | null = null;

export const getFirebaseMessaging = (): Messaging | null => {
  if (typeof window === 'undefined') return null;
  
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.error('Failed to initialize Firebase messaging:', error);
      return null;
    }
  }
  return messaging;
};

export const VAPID_KEY = "BMJQA2-8kT2nxdBXZ_jCVDv4khg0yKJ0KWv9MFyZLZ8jD7S5zB_qEt6qxxALhQ6VgWY0sRaF8OhQJWiCZf7e5pU";

export { getToken, onMessage };
