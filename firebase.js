import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue , remove ,get} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDB8E1LowIQ_CEYRl9UsepcdGZKAkhpTEg",
    authDomain: "vball-1310a.firebaseapp.com",
    databaseURL: "https://vball-1310a-default-rtdb.firebaseio.com/",
    projectId: "vball-1310a",
    storageBucket: "vball-1310a.appspot.com",
    messagingSenderId: "108994186564",
    appId: "1:108994186564:web:30761a37c2c839a017db11",
    measurementId: "G-ML9FF222NJ"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

export { db, auth, ref, set, push, onValue, remove,get,signInWithEmailAndPassword, signOut, onAuthStateChanged };
