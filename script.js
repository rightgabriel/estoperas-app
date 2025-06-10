// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- IMPORTANT: Firebase Configuration for GitHub Pages ---
// These variables (like __app_id) are automatically provided by the Canvas environment.
// For deployment on GitHub Pages, you MUST replace the `firebaseConfig` object
// below with your OWN Firebase project's configuration details.
//
// 1. Go to your Firebase project in the Firebase Console.
// 2. Click on the "Project settings" gear icon.
// 3. Scroll down to "Your apps" section and select "Web app" (if you haven't added one, do so).
// 4. Copy the entire `firebaseConfig` object provided there and paste it below.
//
// If you leave `firebaseConfig` empty or with placeholder values, your data WILL NOT persist
// and authentication might not function correctly on GitHub Pages.

const appId = 'github-item-locator'; // You can choose an app ID for your Firebase rules.
                                     // This is used to define your data path in Firestore rules.

const firebaseConfig = {
    // PASTE YOUR ACTUAL FIREBASE CONFIG OBJECT HERE
    // Example (DO NOT USE THIS DIRECTLY, GET YOUR OWN FROM FIREBASE CONSOLE):
    // apiKey: "AIzaSyC_YOUR_API_KEY",
    // authDomain: "your-project-id.firebaseapp.com",
    // projectId: "your-project-id",
    // storageBucket: "your-project-id.appspot.com",
    // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    // appId: "1:YOUR_APP_ID:web:YOUR_WEB_APP_ID"
};

// On GitHub Pages, there's no '__initial_auth_token' unless you manually provide it.
// We'll default to anonymous sign-in if no custom token is available.
const initialAuthToken = null; // No initial token for GitHub Pages by default.

// --- END IMPORTANT ---


// Global variables for Firebase instances
let db;
let auth;
let currentUserId = null;
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
    try {
        if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId) {
            console.warn("Firebase configuration is empty or incomplete. Data will not persist. Please add your config for full functionality.");
            // For GitHub Pages, if config is missing, still try anonymous sign-in but warn.
            // This allows the UI to load, but data won't save.
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in
                currentUserId = user.uid;
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
            loadingSpinner.classList.add('hidden');
            appContainer.classList.remove('hidden'); // Show app container after auth attempt
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showMessage(`Initialization failed: ${error.message}. Check your Firebase config.`, 'error');
        loadingSpinner.classList.add('hidden');
    }
}

/**
 * Sets up the real-time listener for item data from Firestore.
 */
function setupFirestoreListener() {
    if (!db || !currentUserId) {
        console.warn("Firestore or User ID not ready for listener setup. Cannot fetch data.");
        return;
    }

    // This collection path stores data privately for each user, tied to the 'appId'
    // defined at the top of this script.
    const itemsCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/itemLocations`);

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
    if (!db || !currentUserId) {
        showMessage('Database not ready. Please wait or check Firebase config.', 'error');
        return;
    }

    try {
        const itemsCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/itemLocations`);

        await addDoc(itemsCollectionRef, {
            itemCode: itemCode,
            location: location,
            timestamp: new Date().toISOString()
        });

        showMessage(`Item '${itemCode}' registered successfully!`, 'success');
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
