// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- IMPORTANT: Firebase Configuration for GitHub Pages ---
// These variables (like __app_id) are automatically provided by the Canvas environment.
// For deployment on GitHub Pages, you MUST replace the `firebaseConfig` object
// below with your OWN Firebase project's configuration details.
//
// HOW TO GET YOUR FIREBASE CONFIG:
// 1. Go to your Firebase project in the Firebase Console: https://console.firebase.google.com
// 2. Select your project.
// 3. Click on the "Project settings" gear icon (near "Project overview").
// 4. Scroll down to "Your apps" section.
// 5. If you haven't added a web app, click the "</>" (web) icon to register one.
//    (Make sure to UNCHECK "Also set up Firebase Hosting" if you're using GitHub Pages)
// 6. After registering, Firebase will present you with the `firebaseConfig` object.
//    Copy the ENTIRE object (including all key-value pairs) and paste it below.
//
// CRITICAL CHECKS FOR "auth/configuration-not-found" ERROR:
// - Ensure `firebaseConfig` contains all fields: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
// - In your Firebase Console, navigate to "Build" > "Authentication" > "Sign-in method".
//   - Make sure "Anonymous" is **Enabled**. This app uses anonymous authentication by default.
//
// If `firebaseConfig` is empty or incorrect, data will NOT persist and authentication will fail.

const appId = 'github-item-locator'; // You can choose an app ID for your Firebase rules.
                                     // This is used to define your data path in Firestore rules.

const firebaseConfig = {
  apiKey: "AIzaSyCAPXanGCwurgavxmg5C2osabockqQ9zBs",
  authDomain: "estoperas-app.firebaseapp.com",
  projectId: "estoperas-app",
  storageBucket: "estoperas-app.firebasestorage.app",
  messagingSenderId: "624470424480",
  appId: "1:624470424480:web:ca13781a3726c0afe7c2c5",
  measurementId: "G-JD58W55L3T"
};

// On GitHub Pages, there's no '__initial_auth_token' unless you manually provide it.
// We'll default to anonymous sign-in if no custom token is available.
const initialAuthToken = null; // No initial token for GitHub Pages by default.

// --- END IMPORTANT ---


// Global variables for Firebase instances
let db;
let auth;
let currentUserId = null; // Still used for authentication, but not for data path
let allItems = []; // Local cache for all registered items

// DOM elements
const loadingSpinner = document.getElementById('loading-spinner');
const appContainer = document.getElementById('app-container');
const userIdDisplay = document.getElementById('user-id-display');
const userIdValue = document.getElementById('user-id-value');
const messageDisplay = document.getElementById('message-display');
const itemCodeInput = document.getElementById('itemCodeInput');
const locationInput = document.getElementById('locationInput');
const registerButton = document.getElementById('registerButton');
const searchCodeInput = document.getElementById('searchCodeInput');
const searchButton = document.getElementById('searchButton');
const foundLocationDisplay = document.getElementById('foundLocationDisplay');
const foundLocationValue = document.getElementById('foundLocationValue');

/**
 * Displays a message to the user.
 * @param {string} msg The message content.
 * @param {string} type The type of message ('success', 'error', 'info').
 */
function showMessage(msg, type = 'info') {
    messageDisplay.textContent = msg;
    messageDisplay.classList.remove('hidden', 'bg-red-100', 'text-red-800', 'border-red-200', 'bg-green-100', 'text-green-800', 'border-green-200', 'bg-blue-100', 'text-blue-800', 'border-blue-200');
    if (type === 'error') {
        messageDisplay.classList.add('bg-red-100', 'text-red-800', 'border-red-200');
    } else if (type === 'success') {
        messageDisplay.classList.add('bg-green-100', 'text-green-800', 'border-green-200');
    } else { // info
        messageDisplay.classList.add('bg-blue-100', 'text-blue-800', 'border-blue-200');
    }
    messageDisplay.classList.remove('hidden');
}

/**
 * Hides the message display.
 */
function hideMessage() {
    messageDisplay.classList.add('hidden');
}

/**
 * Initializes Firebase and sets up authentication.
 */
async function initializeFirebase() {
    // Ensure the app container is shown and loading spinner is hidden,
    // regardless of Firebase config presence, to allow UI to render.
    loadingSpinner.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // IMPORTANT: Check if firebaseConfig is valid before attempting to initialize
    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
        console.warn("Firebase configuration is empty or incomplete. Data will not persist. Please add your config for full functionality.");
        showMessage("Warning: Firebase config missing or incomplete. Data won't persist.", 'info');
        // Do NOT attempt to initialize Firebase if config is missing
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in
                currentUserId = user.uid; // Store user ID even if data is public, as it's needed for auth status check
                userIdValue.textContent = currentUserId;
                userIdDisplay.classList.remove('hidden');
                console.log("Firebase Auth Ready. User ID:", currentUserId);
                setupFirestoreListener(); // Setup listener once authenticated
            } else {
                // User is signed out or not yet signed in
                console.log("No user signed in. Attempting anonymous sign-in.");
                try {
                    // For GitHub Pages, we'll try anonymous sign-in as there's no __initial_auth_token
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously.");
                } catch (error) {
                    console.error("Firebase authentication error:", error);
                    showMessage(`Authentication failed: ${error.message}. Data will not persist.`, 'error');
                }
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showMessage(`Initialization failed: ${error.message}. Check your Firebase config.`, 'error');
    }
}

/**
 * Sets up the real-time listener for item data from Firestore.
 */
function setupFirestoreListener() {
    if (!db) { // No longer needs currentUserId to fetch public data
        console.warn("Firestore not ready for listener setup. Cannot fetch data.");
        return;
    }

    // --- CHANGE MADE HERE: Collection path changed for valid segment count ---
    // Now uses artifacts/{appId}/sharedItems (3 segments: collection/document/collection)
    const itemsCollectionRef = collection(db, `artifacts/${appId}/sharedItems`);

    onSnapshot(itemsCollectionRef, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });
        allItems = items; // Update local cache
        console.log("Real-time items updated:", allItems);
        // Clear message if it was about loading or errors, now data is here
        if (messageDisplay.textContent.startsWith("Loading") || messageDisplay.textContent.startsWith("Error")) {
            hideMessage();
        }
    }, (error) => {
        console.error("Error fetching items from Firestore:", error);
        showMessage(`Error fetching items: ${error.message}. Check Firebase rules.`, 'error');
    });
}

/**
 * Handles the registration of a new item.
 */
async function handleRegister() {
    const itemCode = itemCodeInput.value.trim();
    const location = locationInput.value.trim();

    if (!itemCode || !location) {
        showMessage('Please enter both Item Code and Location.', 'info');
        return;
    }
    // Writing requires authentication. If currentUserId is null, it means auth failed.
    if (!db || !auth.currentUser) {
        showMessage('Authentication required to register data. Please wait or check Firebase config/rules.', 'error');
        return;
    }

    try {
        // --- CHANGE MADE HERE: Collection path changed for valid segment count ---
        // Now uses artifacts/${appId}/sharedItems (3 segments: collection/document/collection)
        const itemsCollectionRef = collection(db, `artifacts/${appId}/sharedItems`);

        await addDoc(itemsCollectionRef, {
            itemCode: itemCode,
            location: location,
            timestamp: new Date().toISOString(),
            registeredBy: auth.currentUser.uid // Optional: record who registered it
        });

        showMessage(`Item '${itemCode}' registered successfully!`, 'success');
        console.log("Clearing input fields..."); // Added for debugging
        itemCodeInput.value = '';
        locationInput.value = '';
    } catch (error) {
        console.error("Error registering item:", error);
        showMessage(`Failed to register item: ${error.message}`, 'error');
    }
}

/**
 * Handles the search for an item's location.
 */
function handleSearch() {
    const searchCode = searchCodeInput.value.trim();

    if (!searchCode) {
        showMessage('Please enter an Item Code to search.', 'info');
        foundLocationDisplay.classList.add('hidden');
        return;
    }

    // Search in the locally cached allItems array
    const foundItem = allItems.find(item => item.itemCode === searchCode);

    if (foundItem) {
        foundLocationValue.textContent = foundItem.location;
        foundLocationDisplay.classList.remove('hidden');
        showMessage(`Location for '${searchCode}':`, 'success');
    } else {
        foundLocationValue.textContent = '';
        foundLocationDisplay.classList.add('hidden');
        showMessage(`Item code '${searchCode}' not found.`, 'info');
    }
}

// Event Listeners
registerButton.addEventListener('click', handleRegister);
searchButton.addEventListener('click', handleSearch);
searchCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

// Initialize the application on window load
window.onload = initializeFirebase;
