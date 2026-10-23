// WhereAbouts - Know where everything is.
// Standard Vanilla PWA Engine (Zero-Build & Stable Render Engine)

const ITEMS_KEY = 'spatialcache_items_v1';
const ROOMS_KEY = 'spatialcache_rooms_v1';
const ENGAGEMENT_KEY = 'findit_engagement_v2';

// -------------------------------------------------------------------------
// FIREBASE CONFIGURATION & STABLE CLOUD SYNC
// -------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyBBlE03MOMORuw3MaTsVLE5N3qZrMkMOLw",
  authDomain: "whereabouts53.firebaseapp.com",
  projectId: "whereabouts53",
  storageBucket: "whereabouts53.firebasestorage.app",
  messagingSenderId: "877953208687",
  appId: "1:877953208687:web:ad90c8e8c7125c258ed89a"
};

if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    console.warn('Firebase init notice:', e);
  }
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

let currentUser = null;
let isGuestSession = false;
let firestoreUnsubscribe = null;
let suppressAuthGatewayTransition = false;
let isSyncingFromCloud = false; // Prevents recursive loop
let activeSpeechRecognizer = null;

// Auth State Watcher
if (auth) {
  auth.onAuthStateChanged((user) => {
    if (suppressAuthGatewayTransition) return;

    currentUser = user;
    isGuestSession = false;

    if (user) {
      hideAuthGateway();
      attachRealtimeSync(user.uid);
      updateAuthUI();
      switchPage('home');
    } else {
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
      }

      const savedGuest = localStorage.getItem('whereabouts_guest_session');
      if (savedGuest === 'true') {
        isGuestSession = true;
        hideAuthGateway();
        updateAuthUI();
      } else {
        showAuthGateway();
      }
    }
  });
}

function showAuthGateway() {
  const authGateway = document.getElementById('view-auth');
  const bottomBar = document.getElementById('bottom-bar');
  const header = document.querySelector('header');
  const pages = document.querySelectorAll('.page-view');

  pages.forEach((p) => p.classList.add('hidden'));
  if (authGateway) authGateway.classList.remove('hidden');
  if (bottomBar) bottomBar.style.display = 'none';
  if (header) header.style.display = 'none';

  document.body.style.overflow = 'hidden';
}

function hideAuthGateway() {
  const authGateway = document.getElementById('view-auth');
  const bottomBar = document.getElementById('bottom-bar');
  const header = document.querySelector('header');

  if (authGateway) authGateway.classList.add('hidden');
  if (bottomBar) bottomBar.style.display = '';
  if (header) header.style.display = '';

  document.body.style.overflow = '';
}

window.continueAsGuest = function () {
  isGuestSession = true;
  localStorage.setItem('whereabouts_guest_session', 'true');
  hideAuthGateway();
  updateAuthUI();
  switchPage('home');
  showToast('Continuing in offline local mode.');
};

window.togglePasswordVisibility = function () {
  const pwdInput = document.getElementById('auth-password');
  const icon = document.getElementById('icon-pwd-toggle');
  if (!pwdInput) return;

  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    pwdInput.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  safeCreateIcons();
};

window.handleAuthAction = async function (actionType) {
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value : '';

  const successBanner = document.getElementById('gateway-signup-success');
  const errorBanner = document.getElementById('gateway-auth-error');
  const errorMsg = document.getElementById('gateway-error-msg');

  if (successBanner) successBanner.classList.add('hidden');
  if (errorBanner) errorBanner.classList.add('hidden');

  if (!auth) {
    showToast('Firebase not initialized. Check internet connection.');
    return;
  }

  if (!email || !email.includes('@')) {
    if (errorBanner && errorMsg) {
      errorMsg.textContent = 'Please enter a valid email address.';
      errorBanner.classList.remove('hidden');
      safeCreateIcons();
    }
    if (emailInput) emailInput.focus();
    return;
  }

  if (!password || password.length < 6) {
    if (errorBanner && errorMsg) {
      errorMsg.textContent = 'Password must be at least 6 characters.';
      errorBanner.classList.remove('hidden');
      safeCreateIcons();
    }
    if (passInput) passInput.focus();
    return;
  }

  const btnSignIn = document.getElementById('btn-action-signin');
  const btnSignUp = document.getElementById('btn-action-signup');
  if (btnSignIn) btnSignIn.disabled = true;
  if (btnSignUp) btnSignUp.disabled = true;

  if (actionType === 'signup') {
    try {
      suppressAuthGatewayTransition = true;
      await auth.createUserWithEmailAndPassword(email, password);
      await auth.signOut();

      if (successBanner) {
        successBanner.classList.remove('hidden');
        safeCreateIcons();
      }

      showToast('Done · Successfully Signed Up!', 'success');
      if (passInput) passInput.value = '';

      setTimeout(() => {
        suppressAuthGatewayTransition = false;
      }, 3000);
    } catch (err) {
      suppressAuthGatewayTransition = false;
      if (errorBanner && errorMsg) {
        errorMsg.textContent = err.code === 'auth/email-already-in-use'
          ? 'This email is already registered. Please tap Sign In.'
          : (err.message || 'Registration failed.');
        errorBanner.classList.remove('hidden');
        safeCreateIcons();
      }
      showToast(err.code === 'auth/email-already-in-use' ? 'This email is already registered. Please Sign In.' : (err.message || 'Error'));
    } finally {
      if (btnSignIn) btnSignIn.disabled = false;
      if (btnSignUp) btnSignUp.disabled = false;
    }
  }

  if (actionType === 'signin') {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      localStorage.removeItem('whereabouts_guest_session');
      showToast('Done · Welcome back!', 'success');
    } catch (err) {
      if (errorBanner && errorMsg) {
        errorMsg.textContent = err.code === 'auth/wrong-password'
          ? 'Incorrect password. Tap Forgot Password to reset.'
          : 'Account not found or incorrect credentials.';
        errorBanner.classList.remove('hidden');
        safeCreateIcons();
      }
      showToast(err.message || 'Sign in error');
    } finally {
      if (btnSignIn) btnSignIn.disabled = false;
      if (btnSignUp) btnSignUp.disabled = false;
    }
  }
};

window.handleForgotPassword = async function () {
  if (!auth) return;
  const emailInput = document.getElementById('auth-email');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    showToast('Please type your email address above first.');
    if (emailInput) emailInput.focus();
    return;
  }

  showConfirmDialog({
    title: 'Reset Password',
    message: `Send password reset email to ${email}?`,
    confirmText: 'Send Reset Link',
    confirmClass: 'bg-stone-900 hover:bg-stone-800 text-white',
    onConfirm: async () => {
      try {
        await auth.sendPasswordResetEmail(email);
        showToast('Password reset email sent! Check your inbox.');
      } catch (err) {
        showToast(err.message || 'Could not send reset email.');
      }
    },
  });
};

function attachRealtimeSync(uid) {
  if (!db) return;
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  firestoreUnsubscribe = db.collection('users').doc(uid).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      const cloudItems = data.items;
      const cloudRooms = data.rooms;

      // Deep compare stringified data to avoid re-rendering identical states
      const localItemsStr = JSON.stringify(state.items);
      const incomingItemsStr = JSON.stringify(cloudItems || []);

      if (cloudItems && Array.isArray(cloudItems) && localItemsStr !== incomingItemsStr) {
        isSyncingFromCloud = true;
        state.items = cloudItems;
        saveItems(false);
        isSyncingFromCloud = false;
        renderApp();
      }

      if (cloudRooms && Array.isArray(cloudRooms)) {
        state.rooms = cloudRooms;
        saveRooms(false);
      }
    } else {
      pushToCloud();
    }
  }, (err) => console.warn('Sync notice:', err));
}

async function pushToCloud() {
  if (!currentUser || !db || isSyncingFromCloud) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      items: state.items,
      rooms: state.rooms,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Cloud sync error:', err);
  }
}

function updateAuthUI() {
  const headerLabel = document.getElementById('header-auth-label');
  const profileEmail = document.getElementById('profile-user-email');
  const profileStatus = document.getElementById('profile-user-status');
  const profileUid = document.getElementById('profile-user-uid');
  const profileCount = document.getElementById('profile-item-count');

  if (profileCount) profileCount.textContent = `${state.items.length} Items`;

  if (currentUser) {
    if (headerLabel) headerLabel.textContent = 'Account';
    if (profileEmail) profileEmail.textContent = currentUser.email || 'Connected';
    if (profileStatus) {
      profileStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> <span>Active Cloud Sync</span>`;
      profileStatus.className = 'text-xs font-bold text-emerald-700 flex items-center gap-1.5';
    }
    if (profileUid) profileUid.textContent = currentUser.uid;
  } else if (isGuestSession) {
    if (headerLabel) headerLabel.textContent = 'Guest';
    if (profileEmail) profileEmail.textContent = 'Guest User (Offline Mode)';
    if (profileStatus) {
      profileStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> <span>Local Storage Only</span>`;
      profileStatus.className = 'text-xs font-bold text-amber-700 flex items-center gap-1.5';
    }
    if (profileUid) profileUid.textContent = 'Sign in to enable cloud sync';
  }
}

window.handleSignOut = async function () {
  if (!auth) return;
  localStorage.removeItem('whereabouts_guest_session');
  await auth.signOut();
  showAuthGateway();
  showToast('Signed out.');
};

window.handleDeleteAccount = function () {
  showConfirmDialog({
    title: 'Delete Account Permanently',
    message: 'Permanently erase your account and all cloud inventory? This cannot be undone.',
    confirmText: 'Delete Everything',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    onConfirm: async () => {
      try {
        if (currentUser && db) {
          await db.collection('users').doc(currentUser.uid).delete();
          await currentUser.delete();
          showToast('Account and data deleted.');
          showAuthGateway();
        }
      } catch (err) {
        showToast(err.message || 'Error deleting account');
      }
    },
  });
};

// -------------------------------------------------------------------------
// INITIAL DATA & CATEGORIES
// -------------------------------------------------------------------------

const INITIAL_ROOMS = [
  { id: 'kitchen-pantry', name: 'Kitchen & Pantry', icon: 'utensils', description: 'Appliances and pantry items' },
  { id: 'hallway-closet', name: 'Hallway Closet', icon: 'archive', description: 'Utility and household supplies' },
  { id: 'garage-workshop', name: 'Garage & Workshop', icon: 'wrench', description: 'Tools and hardware' },
  { id: 'living-room', name: 'Living Room', icon: 'tv', description: 'Entertainment and electronics' },
  { id: 'home-office', name: 'Home Office', icon: 'briefcase', description: 'Work desk, tech cables, files' },
  { id: 'master-bedroom', name: 'Master Bedroom', icon: 'bed', description: 'Personal storage and documents' },
];

const INITIAL_ITEMS = [
  {
    id: 'item-1',
    name: 'Passport & Travel Documents',
    category: 'Documents & Valuables',
    location: { room: 'Master Bedroom', spot: 'Closet top shelf in gray fireproof box' },
    description: 'Family blue passports, visas, birth certificates.',
    tags: ['passport', 'travel', 'id', 'documents', 'kagaz'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-22T10:15:00.000Z',
    createdAt: '2026-05-10T08:00:00.000Z',
  },
  {
    id: 'item-2',
    name: 'Rechargeable AA & AAA Batteries',
    category: 'Electronics & Cables',
    location: { room: 'Hallway Closet', spot: 'Middle wire rack in clear divided bin #3' },
    description: 'Pre-charged batteries plus 4-slot smart wall charger.',
    tags: ['batteries', 'aa', 'aaa', 'power', 'charger'],
    lent: { isLent: false },
    consumable: { isConsumable: true, quantity: 4, unit: 'batteries', minThreshold: 4 },
    lastVerifiedAt: '2026-10-22T07:22:00.000Z',
    createdAt: '2026-08-12T09:30:00.000Z',
  },
  {
    id: 'item-3',
    name: 'DeWalt 20V Cordless Drill & Bit Kit',
    category: 'Tools & Hardware',
    location: { room: 'Garage & Workshop', spot: 'Middle shelf under main pegboard workbench' },
    description: 'Brushless hammer drill with two batteries and charger.',
    tags: ['drill', 'dewalt', 'tools', 'screws', 'hardware'],
    lent: { isLent: true, lentTo: 'Dave Miller (Next Door)', lentDate: '2026-09-28' },
    lastVerifiedAt: '2026-10-21T16:00:00.000Z',
    createdAt: '2026-07-01T11:00:00.000Z',
  },
  {
    id: 'item-4',
    name: 'Emergency First Aid Kit & Antihistamines',
    category: 'Health & Medication',
    location: { room: 'Kitchen & Pantry', spot: 'Pantry top shelf on right wall at eye level' },
    description: 'Sterile bandages, antiseptic spray, burn gel, allergy tablets.',
    tags: ['first aid', 'bandages', 'medicine', 'emergency', 'dawai'],
    lent: { isLent: false },
    consumable: { isConsumable: true, quantity: 1, unit: 'kit', minThreshold: 1 },
    lastVerifiedAt: '2026-10-22T08:30:00.000Z',
    createdAt: '2026-06-15T12:00:00.000Z',
  },
  {
    id: 'item-5',
    name: 'Digital Tire Pressure Gauge & Inflator',
    category: 'Tools & Hardware',
    location: { room: 'Garage & Workshop', spot: 'Third drawer down of red Craftsman chest' },
    description: 'Backlit tire gauge reading up to 150 PSI.',
    tags: ['car', 'tires', 'gauge', 'pressure', 'inflator'],
    lent: { isLent: false },
    isMissing: false,
    lastVerifiedAt: '2026-10-22T09:00:00.000Z',
    createdAt: '2026-06-01T15:20:00.000Z',
  },
  {
    id: 'item-6',
    name: 'USB-C to HDMI 4K Display Adapter',
    category: 'Electronics & Cables',
    location: { room: 'Home Office', spot: 'Desk right drawer top organizer tray' },
    description: 'Multiport hub with 4K HDMI and charging for monitor.',
    tags: ['usb-c', 'hdmi', 'adapter', 'dongle', 'cable'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-22T09:10:00.000Z',
    createdAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'item-7',
    name: 'Spare Car Key Fob & Garden Shed Key',
    category: 'Documents & Valuables',
    location: { room: 'Living Room', spot: 'Entryway catchall ceramic bowl next to mirror' },
    description: 'Includes spare fob and brass shed padlock key.',
    tags: ['keys', 'car', 'fob', 'shed', 'chabi'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-22T06:00:00.000Z',
    createdAt: '2026-05-10T14:00:00.000Z',
  },
  {
    id: 'item-8',
    name: 'Dyson Cordless Vacuum Attachments & Filter',
    category: 'Household & Cleaning',
    location: { room: 'Hallway Closet', spot: 'Floor storage underneath hanging coats' },
    description: 'Crevice tool, dusting brush, and clean spare HEPA filter.',
    tags: ['vacuum', 'dyson', 'cleaning', 'filter'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-21T11:00:00.000Z',
    createdAt: '2026-07-20T16:00:00.000Z',
  },
  {
    id: 'item-9',
    name: 'Camping LED Headlamp & Extra Strap',
    category: 'Seasonal & Apparel',
    location: { room: 'Garage & Workshop', spot: 'Overhead rack front left corner in 30L tub' },
    description: '350 lumen USB-rechargeable headlamp with red night light mode.',
    tags: ['headlamp', 'camping', 'flashlight', 'light'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-20T18:00:00.000Z',
    createdAt: '2026-04-01T12:00:00.000Z',
  },
  {
    id: 'item-10',
    name: 'Thermal Winter Gloves & Wool Beanies',
    category: 'Seasonal & Apparel',
    location: { room: 'Hallway Closet', spot: 'Top shelf far left fabric storage cube #1' },
    description: 'Ski mittens, 2 merino wool beanies, and neck gaiter.',
    tags: ['gloves', 'winter', 'beanie', 'cold'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-20T13:00:00.000Z',
    createdAt: '2026-03-15T10:00:00.000Z',
  },
  {
    id: 'item-11',
    name: 'Wi-Fi Network Backup Password Card',
    category: 'Office & Tech',
    location: { room: 'Living Room', spot: 'TV console cable tray taped to underside of router shelf' },
    description: 'Home Wi-Fi backup credentials and recovery keys.',
    tags: ['wifi', 'internet', 'router', 'password'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-22T12:00:00.000Z',
    createdAt: '2026-08-05T09:00:00.000Z',
  },
  {
    id: 'item-12',
    name: 'Compact Telescopic Aluminum Ladder (12 ft)',
    category: 'Tools & Hardware',
    location: { room: 'Garage & Workshop', spot: 'Metal rack shelf 2 upright against wall' },
    description: 'Compact collapsible ladder for painting and ceiling fixtures.',
    tags: ['ladder', 'tools', 'climbing', 'garage', 'sidhi'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-22T10:00:00.000Z',
    createdAt: '2026-06-15T14:00:00.000Z',
  },
];

const CATEGORIES = [
  'All',
  'Tools & Hardware',
  'Electronics & Cables',
  'Documents & Valuables',
  'Health & Medication',
  'Household & Cleaning',
  'Seasonal & Apparel',
  'Office & Tech',
  'Other',
];

const CATEGORY_THEMES = {
  'Tools & Hardware': { themeClass: 'cat-theme-tools', bg: 'bg-amber-100', border: 'border-amber-300', badge: 'bg-amber-200 text-amber-950 border-amber-400', innerBox: 'bg-white/85 border-amber-200', icon: 'wrench' },
  'Electronics & Cables': { themeClass: 'cat-theme-electronics', bg: 'bg-indigo-100', border: 'border-indigo-300', badge: 'bg-indigo-200 text-indigo-950 border-indigo-400', innerBox: 'bg-white/85 border-indigo-200', icon: 'cpu' },
  'Documents & Valuables': { themeClass: 'cat-theme-documents', bg: 'bg-yellow-100', border: 'border-yellow-300', badge: 'bg-yellow-200 text-yellow-950 border-yellow-400', innerBox: 'bg-white/85 border-yellow-200', icon: 'file-text' },
  'Health & Medication': { themeClass: 'cat-theme-health', bg: 'bg-rose-100', border: 'border-rose-300', badge: 'bg-rose-200 text-rose-950 border-rose-400', innerBox: 'bg-white/85 border-rose-200', icon: 'shield-plus' },
  'Household & Cleaning': { themeClass: 'cat-theme-household', bg: 'bg-emerald-100', border: 'border-emerald-300', badge: 'bg-emerald-200 text-emerald-950 border-emerald-400', innerBox: 'bg-white/85 border-emerald-200', icon: 'sparkles' },
  'Seasonal & Apparel': { themeClass: 'cat-theme-seasonal', bg: 'bg-purple-100', border: 'border-purple-300', badge: 'bg-purple-200 text-purple-950 border-purple-400', innerBox: 'bg-white/85 border-purple-200', icon: 'sun' },
  'Office & Tech': { themeClass: 'cat-theme-office', bg: 'bg-sky-100', border: 'border-sky-300', badge: 'bg-sky-200 text-sky-950 border-sky-400', innerBox: 'bg-white/85 border-sky-200', icon: 'briefcase' },
  'Other': { themeClass: 'cat-theme-other', bg: 'bg-stone-100', border: 'border-stone-300', badge: 'bg-stone-200 text-stone-900 border-stone-400', innerBox: 'bg-white/85 border-stone-200', icon: 'package' },
};

const state = {
  items: [],
  rooms: [],
  engagement: {
    streak: 3,
    lastCheckInDate: '',
    totalCheckIns: 5,
    notificationsEnabled: false,
    lastNotificationTimestamp: 0,
  },
  searchQuery: '',
  selectedCategory: 'All',
  selectedRoom: 'All',
  sortBy: 'recent',
  filterLentOnly: false,
  filterLowStockOnly: false,
  filterMissingOnly: false,
  viewMode: 'grid',
  activePage: 'home',
  editingItemId: null,
  isSpotCheckEditing: false,
  spotCheckItems: [],
  spotCheckCurrentIndex: 0,
  deferredInstallPrompt: null,
};

// -------------------------------------------------------------------------
// STORAGE & UTILITY
// -------------------------------------------------------------------------

function loadData() {
  try {
    const rawItems = localStorage.getItem(ITEMS_KEY);
    const rawRooms = localStorage.getItem(ROOMS_KEY);
    const rawEng = localStorage.getItem(ENGAGEMENT_KEY);

    if (!rawItems) {
      state.items = INITIAL_ITEMS;
      localStorage.setItem(ITEMS_KEY, JSON.stringify(INITIAL_ITEMS));
    } else {
      state.items = JSON.parse(rawItems);
    }

    state.rooms = rawRooms ? JSON.parse(rawRooms) : INITIAL_ROOMS;
    if (rawEng) {
      state.engagement = { ...state.engagement, ...JSON.parse(rawEng) };
    }
  } catch (e) {
    state.items = INITIAL_ITEMS;
    state.rooms = INITIAL_ROOMS;
  }
}

function saveItems(shouldSync = true) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(state.items));
    if (shouldSync && !isSyncingFromCloud) {
      pushToCloud();
    }
  } catch (e) {
    console.error('Error saving items:', e);
  }
}

function saveRooms(shouldSync = true) {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(state.rooms));
    if (shouldSync && !isSyncingFromCloud) {
      pushToCloud();
    }
  } catch (e) {
    console.error('Error saving rooms:', e);
  }
}

function saveEngagement() {
  try {
    localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(state.engagement));
  } catch (e) {
    console.error('Error saving engagement:', e);
  }
}

function safeCreateIcons() {
  if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
    try {
      lucide.createIcons();
    } catch (e) {}
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStandardDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
}

function getItemLocationText(item) {
  if (!item || !item.location) return 'Location not specified';
  return item.location.spot || item.location.zone || 'General room area';
}

function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isSuccess = type === 'success' || message.toLowerCase().includes('done') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('found') || message.toLowerCase().includes('updated');

  if (isSuccess) {
    toast.className =
      'bg-emerald-600 text-white text-sm font-extrabold px-6 py-3.5 rounded-2xl shadow-elevated flex items-center justify-center gap-2.5 pointer-events-auto transform transition-all duration-200 -translate-y-3 opacity-0 text-center border-2 border-emerald-400/80';
    toast.innerHTML = `
      <span class="w-6 h-6 rounded-full bg-white text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
        <i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>
      </span>
      <span>${escapeHtml(message.startsWith('Done') ? message : `Done · ${message}`)}</span>
    `;
  } else {
    toast.className =
      'bg-stone-900 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-elevated flex items-center justify-center gap-2 pointer-events-auto transform transition-all duration-200 -translate-y-3 opacity-0 text-center';
    toast.innerHTML = `
      <i data-lucide="sparkles" class="w-4 h-4 text-amber-400 shrink-0"></i>
      <span>${escapeHtml(message)}</span>
    `;
  }

  container.appendChild(toast);
  safeCreateIcons();

  requestAnimationFrame(() => toast.classList.remove('-translate-y-3', 'opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-3');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

function getDynamicTypes() {
  const counts = {};
  state.items.forEach((item) => {
    const cat = item.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.keys(counts).map((cat) => ({ name: cat, count: counts[cat] })).sort((a, b) => a.name.localeCompare(b.name));
}

function getDynamicLocations() {
  const counts = {};
  state.items.forEach((item) => {
    const rm = item.location?.room || 'Unassigned';
    counts[rm] = (counts[rm] || 0) + 1;
  });
  state.rooms.forEach((r) => {
    if (!counts[r.name]) counts[r.name] = 0;
  });
  return Object.keys(counts).map((rm) => ({ name: rm, count: counts[rm] })).sort((a, b) => a.name.localeCompare(b.name));
}

function getVerificationConfidence(item) {
  if (item.isMissing) {
    return { status: 'missing', badgeClass: 'bg-red-600 text-white border-red-700 font-extrabold shadow-xs', icon: 'alert-triangle', shortLabel: 'Missing' };
  }

  if (!item.lastVerifiedAt) {
    return { status: 'unverified', badgeClass: 'bg-stone-100 text-stone-700 border-stone-300', icon: 'clock', shortLabel: 'Not verified' };
  }

  const verifiedDate = new Date(item.lastVerifiedAt);
  const diffDays = Math.max(0, Math.floor((Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24)));
  const dateFormatted = formatStandardDate(verifiedDate);

  if (diffDays >= 90) {
    return { status: 'stale', badgeClass: 'bg-amber-100 text-amber-950 border-amber-300 ring-1 ring-amber-400/40', icon: 'alert-triangle', shortLabel: `Confirmed ${dateFormatted}` };
  } else if (diffDays <= 7) {
    return { status: 'fresh', badgeClass: 'bg-emerald-100 text-emerald-950 border-emerald-300', icon: 'check-circle', shortLabel: `Verified ${dateFormatted}` };
  } else {
    return { status: 'normal', badgeClass: 'bg-stone-100 text-stone-800 border-stone-200', icon: 'calendar', shortLabel: `Confirmed ${dateFormatted}` };
  }
}

// -------------------------------------------------------------------------
// ROCK-SOLID SEARCH & STABLE SORTING (NO JUMPING OR FLICKERING)
// -------------------------------------------------------------------------

function getFilteredItems() {
  const query = state.searchQuery.trim().toLowerCase();

  const candidateItems = state.items.filter((item) => {
    if (state.selectedCategory !== 'All' && item.category !== state.selectedCategory) return false;
    if (state.selectedRoom !== 'All' && item.location.room !== state.selectedRoom) return false;
    if (state.filterLentOnly && (!item.lent || !item.lent.isLent)) return false;
    if (state.filterLowStockOnly) {
      const isLow = item.consumable?.isConsumable && (item.consumable.quantity ?? 0) <= (item.consumable.minThreshold ?? 0);
      if (!isLow) return false;
    }
    if (state.filterMissingOnly && !item.isMissing) return false;
    return true;
  });

  if (query) {
    return candidateItems.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const room = (item.location?.room || '').toLowerCase();
      const spot = getItemLocationText(item).toLowerCase();
      const tags = (item.tags || []).join(' ').toLowerCase();
      return name.includes(query) || desc.includes(query) || room.includes(query) || spot.includes(query) || tags.includes(query);
    });
  }

  // Stable timestamp parser helper that guarantees no NaN comparisons
  const safeTime = (item) => {
    const raw = item.createdAt || item.lastVerifiedAt;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return isNaN(t) ? 0 : t;
  };

  const results = [...candidateItems];
  switch (state.sortBy) {
    case 'name-asc':
      results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'name-desc':
      results.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      break;
    case 'room-asc':
      results.sort((a, b) => (a.location?.room || '').localeCompare(b.location?.room || ''));
      break;
    case 'verified':
      results.sort((a, b) => safeTime(a) - safeTime(b));
      break;
    case 'recent':
    default:
      // Guaranteed deterministic reverse-chronological order (newest first)
      results.sort((a, b) => {
        const diff = safeTime(b) - safeTime(a);
        if (diff !== 0) return diff;
        return (b.id || '').localeCompare(a.id || ''); // Secondary tie-breaker prevents jitter
      });
      break;
  }

  return results;
}

// -------------------------------------------------------------------------
// APP RENDERING
// -------------------------------------------------------------------------

function renderApp() {
  renderSortFilterCard();
  renderEngagementStatus();
  renderMainView();
  safeCreateIcons();
}

window.toggleFilterDropdowns = function () {
  const panel = document.getElementById('filter-dropdowns-panel');
  if (panel) panel.classList.toggle('hidden');
};

function renderSortFilterCard() {
  const dynamicTypes = getDynamicTypes();
  const dynamicLocations = getDynamicLocations();

  const typeSelect = document.getElementById('filter-type-select');
  if (typeSelect) {
    let typeOptions = `<option value="All">All Types (${state.items.length})</option>`;
    dynamicTypes.forEach((t) => {
      const isSel = state.selectedCategory === t.name ? 'selected' : '';
      typeOptions += `<option value="${escapeHtml(t.name)}" ${isSel}>${escapeHtml(t.name)} (${t.count})</option>`;
    });
    typeSelect.innerHTML = typeOptions;
    typeSelect.value = state.selectedCategory;
  }

  const locSelect = document.getElementById('filter-location-select');
  if (locSelect) {
    let locOptions = `<option value="All">All Rooms (${dynamicLocations.length})</option>`;
    dynamicLocations.forEach((l) => {
      const isSel = state.selectedRoom === l.name ? 'selected' : '';
      locOptions += `<option value="${escapeHtml(l.name)}" ${isSel}>${escapeHtml(l.name)} (${l.count})</option>`;
    });
    locSelect.innerHTML = locOptions;
    locSelect.value = state.selectedRoom;
  }

  const sortSelect = document.getElementById('sort-order-select');
  if (sortSelect) sortSelect.value = state.sortBy || 'recent';

  const totalItemsEl = document.getElementById('stat-total-items');
  if (totalItemsEl) totalItemsEl.textContent = state.items.length;

  const headerStreak = document.getElementById('header-streak-badge');
  if (headerStreak) headerStreak.textContent = `${state.engagement.streak || 1} Days`;

  const filterAllBtn = document.getElementById('filter-btn-all');
  const filterLentBtn = document.getElementById('filter-btn-lent');
  const filterLowBtn = document.getElementById('filter-btn-low');
  const filterMissingBtn = document.getElementById('filter-btn-missing');
  const btnActiveReset = document.getElementById('btn-active-reset');

  const hasActiveFilters =
    state.selectedCategory !== 'All' ||
    state.selectedRoom !== 'All' ||
    state.filterLentOnly ||
    state.filterLowStockOnly ||
    state.filterMissingOnly ||
    Boolean(state.searchQuery.trim());

  if (filterAllBtn) {
    filterAllBtn.className = !hasActiveFilters
      ? 'px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer bg-stone-900 text-white shadow-xs shrink-0'
      : 'px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-stone-50 shrink-0';
  }

  if (filterLentBtn) {
    const lentCount = state.items.filter((i) => i.lent && i.lent.isLent).length;
    const lentBadge = document.getElementById('badge-lent-count');
    if (lentBadge) {
      lentBadge.textContent = lentCount;
      lentBadge.style.display = lentCount > 0 ? 'inline-block' : 'none';
    }
    filterLentBtn.className = state.filterLentOnly
      ? 'px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer bg-rose-500 text-white border border-rose-600 shadow-xs flex items-center gap-1 shrink-0'
      : 'px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-rose-50 flex items-center gap-1 shrink-0';
  }

  if (filterLowBtn) {
    const lowCount = state.items.filter(
      (i) => i.consumable?.isConsumable && (i.consumable.quantity ?? 0) <= (i.consumable.minThreshold ?? 0)
    ).length;
    const lowBadge = document.getElementById('badge-low-count');
    if (lowBadge) {
      lowBadge.textContent = lowCount;
      lowBadge.style.display = lowCount > 0 ? 'inline-block' : 'none';
    }
    filterLowBtn.className = state.filterLowStockOnly
      ? 'px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer bg-amber-500 text-stone-950 border border-amber-600 shadow-xs flex items-center gap-1 shrink-0'
      : 'px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-amber-50 flex items-center gap-1 shrink-0';
  }

  if (filterMissingBtn) {
    const missingCount = state.items.filter((i) => i.isMissing).length;
    const missingBadge = document.getElementById('badge-missing-count');
    if (missingBadge) {
      missingBadge.textContent = missingCount;
      missingBadge.style.display = missingCount > 0 ? 'inline-flex' : 'none';
    }
    filterMissingBtn.className = state.filterMissingOnly
      ? 'px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer bg-red-600 text-white border border-red-700 shadow-xs flex items-center gap-1 shrink-0'
      : 'px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-red-50 flex items-center gap-1 shrink-0';
  }

  if (btnActiveReset) {
    btnActiveReset.style.display = hasActiveFilters ? 'inline-block' : 'none';
  }

  const clearSearchBtn = document.getElementById('btn-clear-search');
  if (clearSearchBtn) {
    clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
  }
}

// -------------------------------------------------------------------------
// STABLE VERIFIED CLARITY METRIC (DOES NOT FLUCTUATE)
// -------------------------------------------------------------------------

function renderEngagementStatus() {
  const streakBadge = document.getElementById('streak-counter-badge');
  const healthBadge = document.getElementById('health-score-badge');
  const notifBtnLabel = document.getElementById('notif-button-label');
  const testNotifBtn = document.getElementById('btn-test-notification');
  const notifNote = document.getElementById('notif-status-note');
  const checkinBtn = document.getElementById('btn-daily-checkin');

  const streak = state.engagement.streak || 1;
  if (streakBadge) streakBadge.textContent = `${streak}-Day Organizing Streak`;

  // Absolute clarity calculation based purely on live data
  const total = state.items.length;
  const verified = state.items.filter((item) => !item.isMissing && Boolean(item.lastVerifiedAt)).length;
  const clarity = total > 0 ? Math.round((verified / total) * 100) : 100;

  if (healthBadge) healthBadge.textContent = `Home Clarity: ${clarity}%`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isCheckedInToday = state.engagement.lastCheckInDate === todayStr;
  if (checkinBtn) {
    if (isCheckedInToday) {
      checkinBtn.innerHTML = `<span>✅</span><span>Checked In Today (${streak}🔥)</span>`;
      checkinBtn.className = 'px-4 py-2.5 bg-emerald-100 text-emerald-950 font-extrabold text-sm rounded-xl cursor-default text-center flex items-center justify-center gap-2 shadow-xs border border-emerald-300';
    } else {
      checkinBtn.innerHTML = `<span>🔥</span><span>Daily Check-In (+1 Streak)</span>`;
      checkinBtn.className = 'px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-stone-950 font-black text-sm rounded-xl transition-all shadow-soft flex items-center justify-center gap-2 cursor-pointer text-center pulse-subtle';
    }
  }

  const notifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (notifBtnLabel) notifBtnLabel.textContent = notifGranted ? 'Reminders Active' : 'Enable Daily Reminders';
  if (testNotifBtn) testNotifBtn.style.display = notifGranted ? 'inline-block' : 'none';

  if (notifNote) {
    notifNote.textContent = notifGranted
      ? '🔔 Daily Reminders are active! You will receive gentle reminders so items stay in memory.'
      : '🔔 Turn on notifications to receive friendly nudges when lent items are due or for a quick spot check.';
  }
}

window.handleDailyCheckIn = function () {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (state.engagement.lastCheckInDate === todayStr) {
    showToast(`You already checked in today! Streak: ${state.engagement.streak} 🔥`);
    return;
  }

  state.engagement.streak = (state.engagement.streak || 0) + 1;
  state.engagement.lastCheckInDate = todayStr;
  state.engagement.totalCheckIns = (state.engagement.totalCheckIns || 0) + 1;
  saveEngagement();
  renderEngagementStatus();
  showToast(`🎉 Streak increased to ${state.engagement.streak} days!`);
};

// -------------------------------------------------------------------------
// NOTIFICATIONS
// -------------------------------------------------------------------------

async function dispatchAppNotification(title, options = {}) {
  const defaultOptions = {
    icon: './icon-192.png',
    badge: './favicon-32.png',
    vibrate: [100, 50, 100],
    ...options
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) return await reg.showNotification(title, defaultOptions);
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, defaultOptions);
    }
  } catch (err) {}
}

window.toggleDailyNotifications = async function () {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported on this browser.');
    return;
  }

  if (Notification.permission === 'granted') {
    state.engagement.notificationsEnabled = !state.engagement.notificationsEnabled;
    saveEngagement();
    renderEngagementStatus();
    showToast(state.engagement.notificationsEnabled ? 'Daily reminders active!' : 'Daily reminders paused.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      state.engagement.notificationsEnabled = true;
      saveEngagement();
      renderEngagementStatus();
      await dispatchAppNotification('WhereAbouts Reminders Active 🌟', {
        body: 'You will receive gentle reminders so you always know where your belongings are.',
      });
      showToast('Done · Daily reminders enabled!', 'success');
    }
  } catch (err) {
    showToast('Could not enable notifications.');
  }
};

window.sendTestNotification = async function () {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    showToast('Please enable notifications first.');
    return;
  }
  const randomItem = state.items[Math.floor(Math.random() * state.items.length)] || INITIAL_ITEMS[0];
  await dispatchAppNotification('WhereAbouts: Spot Check 📍', {
    body: `Do you know where your "${randomItem.name}" is stored?`,
  });
  showToast('Done · Test notification sent!', 'success');
};

function runPeriodicNotificationCheck() {
  if (!state.engagement.notificationsEnabled || Notification.permission !== 'granted') return;
  const now = Date.now();
  if (now - (state.engagement.lastNotificationTimestamp || 0) < 24 * 60 * 60 * 1000) return;

  const randomItem = state.items.find(i => !i.lastVerifiedAt || i.isMissing) || state.items[0];
  if (randomItem) {
    dispatchAppNotification('WhereAbouts: Quick Spot Check 📍', {
      body: `Keep your memory fresh! Do you know where your ${randomItem.name} is right now?`,
    });
    state.engagement.lastNotificationTimestamp = now;
    saveEngagement();
  }
}

window.handleTypeFilterChange = function (val) {
  state.selectedCategory = val;
  renderApp();
};

window.handleLocationFilterChange = function (val) {
  state.selectedRoom = val;
  renderApp();
};

window.handleSortOrderChange = function (val) {
  state.sortBy = val;
  renderApp();
};

window.toggleLentFilter = function () {
  state.filterLentOnly = !state.filterLentOnly;
  renderApp();
};

window.toggleLowStockFilter = function () {
  state.filterLowStockOnly = !state.filterLowStockOnly;
  renderApp();
};

window.toggleMissingFilter = function () {
  state.filterMissingOnly = !state.filterMissingOnly;
  renderApp();
};

window.resetAllFilters = function () {
  state.selectedCategory = 'All';
  state.selectedRoom = 'All';
  state.filterLentOnly = false;
  state.filterLowStockOnly = false;
  state.filterMissingOnly = false;
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  renderApp();
  showToast('Filters reset • Showing all items');
};

window.clearSearchInput = function () {
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  renderApp();
};

// -------------------------------------------------------------------------
// SELF-HEALING ("NOT THERE")
// -------------------------------------------------------------------------

let currentNotThereItemId = null;
let currentRelocateItemId = null;

window.openNotThereModal = function (itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  currentNotThereItemId = itemId;
  const modal = document.getElementById('not-there-modal');
  const title = document.getElementById('not-there-title');
  const subtitle = document.getElementById('not-there-subtitle');

  if (title) title.textContent = `Not where it says?`;
  if (subtitle) {
    subtitle.innerHTML = `Was <strong>${escapeHtml(item.name)}</strong> moved, lent, or used up? Fix WhereAbouts's memory in 1 tap:`;
  }

  if (modal) {
    modal.classList.remove('hidden');
    safeCreateIcons();
  }
};

window.closeNotThereModal = function () {
  const modal = document.getElementById('not-there-modal');
  if (modal) modal.classList.add('hidden');
  currentNotThereItemId = null;
};

window.handleNotThereChoice = function (choice) {
  if (!currentNotThereItemId) return;
  const item = state.items.find((i) => i.id === currentNotThereItemId);
  if (!item) {
    closeNotThereModal();
    return;
  }

  const itemId = currentNotThereItemId;
  closeNotThereModal();

  switch (choice) {
    case 'moved':
      openRelocateModal(itemId);
      break;

    case 'lent':
      showPromptDialog({
        title: `Who borrowed ${item.name}?`,
        message: 'Enter borrower name to update tracking:',
        defaultValue: 'Friend or Neighbor',
        onConfirm: (borrower) => {
          item.lent = {
            isLent: true,
            lentTo: (borrower || 'Someone').trim(),
            lentDate: new Date().toISOString().slice(0, 10),
            notes: 'Reported via Not There self-healing',
          };
          item.lastVerifiedAt = new Date().toISOString();
          saveItems();
          renderApp();
          showToast(`Done · Marked ${item.name} as lent!`, 'success');
        },
      });
      break;

    case 'consumed':
      item.consumable = {
        isConsumable: true,
        quantity: 0,
        unit: item.consumable?.unit || 'items',
        minThreshold: item.consumable?.minThreshold || 1,
      };
      item.lastVerifiedAt = new Date().toISOString();
      saveItems();
      renderApp();
      showToast(`Done · Marked ${item.name} as used up`, 'success');
      break;

    case 'missing':
      item.isMissing = true;
      item.lastVerifiedAt = null;
      saveItems();
      renderApp();
      showToast(`Flagged "${item.name}" as missing`, 'warning');
      break;
  }
};

function openRelocateModal(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  currentRelocateItemId = itemId;
  const modal = document.getElementById('relocate-modal');
  const title = document.getElementById('relocate-title');
  const roomSelect = document.getElementById('relocate-room-select');
  const zoneInput = document.getElementById('relocate-zone-input');

  if (title) title.textContent = `Where is "${item.name}" now?`;

  if (roomSelect) {
    roomSelect.innerHTML = state.rooms
      .map((r) => `<option value="${escapeHtml(r.name)}" ${r.name === item.location.room ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
      .join('');
  }

  if (zoneInput) {
    zoneInput.value = '';
    zoneInput.placeholder = `e.g. Nightstand drawer (was: ${getItemLocationText(item)})`;
  }

  if (modal) {
    modal.classList.remove('hidden');
    safeCreateIcons();
    if (zoneInput) zoneInput.focus();
  }
}

window.closeRelocateModal = function () {
  const modal = document.getElementById('relocate-modal');
  if (modal) modal.classList.add('hidden');
  currentRelocateItemId = null;
};

window.confirmRelocateItem = function () {
  if (!currentRelocateItemId) return;
  const item = state.items.find((i) => i.id === currentRelocateItemId);
  if (!item) {
    closeRelocateModal();
    return;
  }

  const roomSelect = document.getElementById('relocate-room-select');
  const zoneInput = document.getElementById('relocate-zone-input');

  const newRoom = roomSelect ? roomSelect.value : item.location.room;
  const newSpot = zoneInput && zoneInput.value.trim() ? zoneInput.value.trim() : (item.location.spot || item.location.zone);

  item.location.room = newRoom;
  item.location.spot = newSpot;
  item.location.zone = newSpot;
  item.isMissing = false;
  item.lastVerifiedAt = new Date().toISOString();

  saveItems();
  closeRelocateModal();
  renderApp();
  showToast(`Done · Moved to ${newRoom} › ${newSpot}`, 'success');
};

// -------------------------------------------------------------------------
// PAGE NAVIGATION
// -------------------------------------------------------------------------

window.switchPage = function (pageId) {
  state.activePage = pageId;
  const pageList = ['home', 'add', 'streak', 'spotcheck', 'about'];

  pageList.forEach((p) => {
    const pageEl = document.getElementById(`view-${p}`);
    if (pageEl) {
      if (p === pageId) pageEl.classList.remove('hidden');
      else pageEl.classList.add('hidden');
    }

    const navBtn = document.getElementById(`nav-btn-${p}`);
    if (navBtn) {
      if (p === 'add') {
        navBtn.className = pageId === 'add'
          ? 'nav-tab-btn active flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 cursor-pointer transform scale-105 transition-all min-h-[48px]'
          : 'nav-tab-btn flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all min-h-[48px]';
      } else {
        navBtn.className = p === pageId
          ? 'nav-tab-btn active flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl transition-all cursor-pointer text-amber-600 font-extrabold bg-amber-50/90 shadow-xs ring-1 ring-amber-300 min-h-[48px]'
          : 'nav-tab-btn flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl transition-all cursor-pointer text-stone-500 hover:text-stone-900 font-semibold min-h-[48px]';
      }
    }
  });

  if (pageId === 'home') renderApp();
  else if (pageId === 'add') initAddView();
  else if (pageId === 'streak') renderEngagementStatus();
  else if (pageId === 'spotcheck') initSpotCheckPage();
  else if (pageId === 'about') updateAuthUI();

  window.scrollTo(0, 0);
  safeCreateIcons();
};

function renderMainView() {
  const container = document.getElementById('main-content-view');
  if (!container) return;

  const btnGrid = document.getElementById('view-tab-grid');
  const btnRooms = document.getElementById('view-tab-rooms');
  const btnLending = document.getElementById('view-tab-lending');

  if (btnGrid) btnGrid.className = `flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${state.viewMode === 'grid' ? 'bg-white text-stone-900 shadow-soft' : 'text-stone-500 hover:text-stone-900'}`;
  if (btnRooms) btnRooms.className = `flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${state.viewMode === 'rooms' ? 'bg-white text-stone-900 shadow-soft' : 'text-stone-500 hover:text-stone-900'}`;
  if (btnLending) btnLending.className = `flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${state.viewMode === 'lending' ? 'bg-white text-stone-900 shadow-soft' : 'text-stone-500 hover:text-stone-900'}`;

  if (state.viewMode === 'grid') renderGridView(container);
  else if (state.viewMode === 'rooms') renderRoomsView(container);
  else if (state.viewMode === 'lending') renderLendingView(container);
}

function renderGridView(container) {
  const filtered = getFilteredItems();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center bg-white/95 rounded-2xl border border-stone-200 space-y-3 shadow-soft w-full max-w-md mx-auto flex flex-col items-center justify-center">
        <div class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
          <i data-lucide="search" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-stone-900">No items found</h3>
        <p class="text-xs text-stone-500 max-w-xs mx-auto text-center">No items match your active search or filters.</p>
        <button onclick="switchPage('add')" class="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-soft">
          Add item now
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="space-y-3.5 w-full flex flex-col items-center">
      <div class="w-full flex items-center justify-between text-xs sm:text-sm text-stone-600 px-1 text-center">
        <span>Showing <strong>${filtered.length}</strong> of <strong>${state.items.length}</strong> items</span>
        <span class="text-amber-800 font-bold">Tap card to verify spot</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
        ${filtered.map((item) => renderItemCardHtml(item)).join('')}
      </div>
    </div>
  `;
}

function renderItemCardHtml(item) {
  const isLent = item.lent && item.lent.isLent;
  const theme = CATEGORY_THEMES[item.category] || CATEGORY_THEMES['Other'];
  const confidence = getVerificationConfidence(item);

  return `
    <div class="${theme.themeClass} ${item.isMissing ? 'bg-red-50/90 border-red-500 ring-2 ring-red-400' : `${theme.bg} ${theme.border}`} rounded-2xl border-2 p-3.5 sm:p-4 flex flex-col justify-between card-hover shadow-soft relative group max-w-full text-center transition-all ${
      isLent ? 'ring-2 ring-rose-400 border-rose-400' : ''
    }">
      <div class="space-y-2.5 w-full flex flex-col items-center text-center">
        <div class="flex flex-wrap items-center justify-center gap-1.5 w-full">
          ${
            item.isMissing
              ? `<span class="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-700 shadow-xs animate-pulse">
                  <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-white shrink-0"></i>
                  <span>Missing</span>
                </span>`
              : ''
          }
          <span class="inline-flex items-center gap-1 text-xs font-extrabold text-stone-800 bg-white/95 border border-stone-300 px-2.5 py-0.5 rounded-full shadow-xs">
            <i data-lucide="map-pin" class="w-3 h-3 text-amber-600 shrink-0"></i>
            <span>${escapeHtml(item.location.room)}</span>
          </span>
          <span class="inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-full border shadow-xs ${theme.badge}">
            <i data-lucide="${theme.icon || 'tag'}" class="w-3 h-3 shrink-0"></i>
            <span>${escapeHtml(item.category)}</span>
          </span>
          ${
            !item.isMissing
              ? `<span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-xs ${confidence.badgeClass}">
                  <i data-lucide="${confidence.icon}" class="w-3 h-3 shrink-0"></i>
                  <span>${confidence.shortLabel}</span>
                </span>`
              : ''
          }
        </div>

        <h4 class="text-lg sm:text-xl font-black text-stone-900 tracking-tight leading-snug break-words">
          ${escapeHtml(item.name)}
        </h4>

        ${
          item.photoUrl
            ? `<div class="w-full max-w-xs mx-auto rounded-xl overflow-hidden border border-white shadow-soft">
                <img src="${item.photoUrl}" alt="Photo Clue" class="w-full h-32 object-cover" />
              </div>`
            : ''
        }

        <div class="w-full ${theme.innerBox || 'bg-white/85 border-amber-200'} rounded-xl px-3.5 py-2 border shadow-xs text-center flex flex-col items-center justify-center gap-1">
          <div class="text-sm font-extrabold text-stone-900 break-words flex items-center justify-center gap-1.5">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-600 shrink-0"></i>
            <span>${escapeHtml(item.location.room)}</span>
            <span class="text-stone-400 font-normal">›</span>
            <span class="text-amber-950 font-black">${escapeHtml(getItemLocationText(item))}</span>
          </div>
        </div>

        ${
          item.description
            ? `<p class="text-xs text-stone-600 text-center max-w-sm mx-auto line-clamp-2 leading-relaxed">${escapeHtml(item.description)}</p>`
            : ''
        }

        ${
          isLent
            ? `<div class="w-full bg-rose-50 border border-rose-300 rounded-xl px-3 py-1.5 text-xs flex items-center justify-between gap-1.5 text-rose-950 font-semibold">
                <span class="truncate">🤝 Lent to <strong>${escapeHtml(item.lent.lentTo || 'Someone')}</strong> (${formatStandardDate(item.lent.lentDate)})</span>
                <button onclick="returnLentItem('${item.id}')" class="text-xs bg-white border border-rose-300 px-2.5 py-0.5 rounded-lg font-bold text-rose-900 hover:bg-rose-100 transition-colors shrink-0">Return</button>
              </div>`
            : ''
        }

        ${
          item.consumable?.isConsumable
            ? `<div class="inline-flex items-center gap-2 bg-white/95 rounded-xl px-3 py-1 border ${theme.border} text-xs shadow-xs">
                <span class="text-stone-500 font-medium">In Stock:</span>
                <strong class="text-stone-900 font-extrabold text-sm">${item.consumable.quantity} ${escapeHtml(item.consumable.unit || 'items')}</strong>
              </div>`
            : ''
        }
      </div>

      <div class="w-full mt-3.5 pt-2.5 border-t ${theme.border} flex items-center justify-between gap-2 text-xs">
        <button
          onclick="verifyLocation('${item.id}')"
          class="flex-1 py-2 px-2.5 font-black text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs text-center"
        >
          <i data-lucide="check" class="w-4 h-4 text-emerald-700 shrink-0"></i>
          <span class="text-xs">Still here</span>
        </button>

        <button
          onclick="openNotThereModal('${item.id}')"
          class="flex-1 py-2 px-2.5 font-black text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs text-center"
        >
          <i data-lucide="help-circle" class="w-4 h-4 text-amber-700 shrink-0"></i>
          <span class="text-xs">Not there!</span>
        </button>

        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="editItem('${item.id}')" class="p-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 transition-colors shadow-xs" title="Edit">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteItem('${item.id}')" class="p-2 rounded-xl border border-stone-300 bg-white hover:bg-red-50 text-stone-400 hover:text-red-700 transition-colors shadow-xs" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderRoomsView(container) {
  const roomsHtml = state.rooms.map((room) => {
    const roomItems = state.items.filter((i) => i.location.room === room.name);
    return `
      <div class="bg-white/95 rounded-2xl border border-stone-200/90 p-4 space-y-3 shadow-soft flex flex-col items-center justify-between text-center">
        <div class="flex flex-col items-center justify-center text-center space-y-1.5">
          <div class="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center text-stone-800 shadow-xs mx-auto">
            <i data-lucide="${escapeHtml(room.icon || 'archive')}" class="w-5 h-5 text-amber-600"></i>
          </div>
          <div>
            <h3 class="text-base font-black text-stone-900">${escapeHtml(room.name)}</h3>
            <p class="text-xs text-stone-500">${escapeHtml(room.description || '')}</p>
          </div>
          <span class="text-xs font-bold px-3 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
            ${roomItems.length} items
          </span>
        </div>

        <button
          onclick="openQuickAddModalWithRoom('${escapeHtml(room.name)}')"
          class="w-full py-2.5 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <i data-lucide="plus" class="w-3.5 h-3.5 text-amber-500"></i>
          <span>Add to ${escapeHtml(room.name)}</span>
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
      ${roomsHtml}
    </div>
  `;
}

function renderLendingView(container) {
  const lentItems = state.items.filter((i) => i.lent && i.lent.isLent);

  container.innerHTML = `
    <div class="space-y-4 w-full flex flex-col items-center">
      <div class="bg-white/95 border border-stone-200 rounded-2xl p-5 space-y-3 shadow-soft w-full flex flex-col items-center justify-center text-center">
        <h3 class="text-lg font-extrabold text-stone-900">Lent Out Belongings</h3>
        ${
          lentItems.length === 0
            ? `<div class="p-6 text-center bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1 w-full max-w-sm mx-auto">
                <i data-lucide="check" class="w-6 h-6 text-emerald-600 mx-auto"></i>
                <h4 class="text-sm font-bold text-stone-800">Everything is at Home</h4>
              </div>`
            : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full pt-1">
                ${lentItems.map((item) => `
                  <div class="bg-rose-100 border-2 border-rose-300 rounded-xl p-4 flex flex-col items-center justify-between space-y-2 text-center shadow-soft">
                    <span class="text-sm font-black text-stone-900">${escapeHtml(item.name)}</span>
                    <div class="text-xs sm:text-sm text-stone-800">Borrower: <strong>${escapeHtml(item.lent.lentTo || 'Someone')}</strong></div>
                    <button onclick="returnLentItem('${item.id}')" class="px-3 py-1 bg-white hover:bg-stone-50 border border-rose-300 rounded-lg font-bold text-rose-900 transition-colors shadow-soft">
                      Mark Returned
                    </button>
                  </div>
                `).join('')}
              </div>`
        }
      </div>
    </div>
  `;
}

window.setViewMode = function (mode) {
  state.viewMode = mode;
  renderApp();
};

window.verifyLocation = function (id) {
  const now = new Date().toISOString();
  state.items = state.items.map((item) =>
    item.id === id ? { ...item, lastVerifiedAt: now, isMissing: false } : item
  );
  saveItems();
  renderApp();
  showToast('Done · Spot confirmed!', 'success');
};

window.returnLentItem = function (id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  state.items = state.items.map((i) =>
    i.id === id ? { ...i, lent: { isLent: false }, lastVerifiedAt: new Date().toISOString() } : i
  );
  saveItems();
  renderApp();
  showToast(`Done · "${item.name}" returned home!`, 'success');
};

// -------------------------------------------------------------------------
// DIALOGS & DELETION
// -------------------------------------------------------------------------

function showConfirmDialog({ title, message, confirmText = 'Confirm', confirmClass = 'bg-rose-600 hover:bg-rose-700 text-white', onConfirm }) {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal) return;
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-message');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (btnConfirm) {
    btnConfirm.textContent = confirmText;
    btnConfirm.className = `py-2.5 px-4 font-bold text-sm rounded-xl shadow-soft transition-colors cursor-pointer ${confirmClass}`;
  }

  modal.classList.remove('hidden');

  btnCancel.onclick = () => modal.classList.add('hidden');
  btnConfirm.onclick = () => {
    modal.classList.add('hidden');
    if (onConfirm) onConfirm();
  };
}

function showPromptDialog({ title, message, defaultValue = '', onConfirm }) {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal) return;
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-message');
  const inputContainer = document.getElementById('dialog-input-container');
  const inputEl = document.getElementById('dialog-input');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (inputContainer) inputContainer.classList.remove('hidden');
  if (inputEl) inputEl.value = defaultValue;

  modal.classList.remove('hidden');
  if (inputEl) inputEl.focus();

  btnCancel.onclick = () => {
    modal.classList.add('hidden');
    inputContainer.classList.add('hidden');
  };
  btnConfirm.onclick = () => {
    const val = inputEl ? inputEl.value.trim() : '';
    modal.classList.add('hidden');
    inputContainer.classList.add('hidden');
    if (onConfirm) onConfirm(val || defaultValue);
  };
}

window.deleteItem = function (id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  showConfirmDialog({
    title: 'Delete Item',
    message: `Remove "${item.name}" from WhereAbouts?`,
    confirmText: 'Delete',
    confirmClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    onConfirm: () => {
      state.items = state.items.filter((i) => i.id !== id);
      saveItems();
      renderApp();
      showToast(`Removed "${item.name}"`);
    },
  });
};

// -------------------------------------------------------------------------
// CLEAN SINGLE-INSTANCE VOICE RECOGNITION (NO DOUBLE WORDS)
// -------------------------------------------------------------------------

window.handleSimpleVoiceInput = function (text) {
  const nameInput = document.getElementById('add-item-name');
  if (nameInput) nameInput.value = text;
  const clearBtn = document.getElementById('btn-voice-input-clear');
  if (clearBtn) clearBtn.style.display = text ? 'block' : 'none';
};

window.clearVoiceInputOnly = function () {
  const vInput = document.getElementById('voice-nlp-input');
  if (vInput) vInput.value = '';
  const clearBtn = document.getElementById('btn-voice-input-clear');
  if (clearBtn) clearBtn.style.display = 'none';
};

window.toggleVoiceRecognition = function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice recognition not supported on this browser. Type below!');
    return;
  }

  const btn = document.getElementById('btn-voice-record');
  const label = document.getElementById('voice-record-label');
  const vInput = document.getElementById('voice-nlp-input');
  const nameInput = document.getElementById('add-item-name');

  // Hard cancel previous instance
  if (activeSpeechRecognizer) {
    try {
      activeSpeechRecognizer.abort();
    } catch (e) {}
    activeSpeechRecognizer = null;
  }

  const recognition = new SpeechRecognition();
  activeSpeechRecognizer = recognition;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = function () {
    if (btn) btn.classList.add('recording-pulse');
    if (label) label.textContent = 'Listening... Speak now';
  };

  recognition.onresult = function (event) {
    if (!event.results || !event.results[0] || !event.results[0][0]) return;
    let spokenText = event.results[0][0].transcript.trim();

    // Auto-remove repeated consecutive syllables/words (e.g. "car car car" -> "car")
    spokenText = spokenText.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');

    if (spokenText) {
      if (vInput) vInput.value = spokenText;
      if (nameInput) nameInput.value = spokenText;
      const clearBtn = document.getElementById('btn-voice-input-clear');
      if (clearBtn) clearBtn.style.display = 'block';
      showToast(`Heard: "${spokenText}"`);
    }
  };

  recognition.onerror = function () {
    showToast('Could not hear voice. Please type your item.');
  };

  recognition.onend = function () {
    activeSpeechRecognizer = null;
    if (btn) btn.classList.remove('recording-pulse');
    if (label) label.textContent = 'Tap mic to speak item name';
  };

  try {
    recognition.start();
  } catch (e) {
    showToast('Microphone busy. Please try again.');
  }
};

// -------------------------------------------------------------------------
// ADD / EDIT FORM
// -------------------------------------------------------------------------

window.openQuickAddModal = function () {
  state.editingItemId = null;
  state.isSpotCheckEditing = false;
  switchPage('add');
};

window.openQuickAddModalWithRoom = function (roomName) {
  state.editingItemId = null;
  state.isSpotCheckEditing = false;
  switchPage('add');
  setTimeout(() => {
    const roomSelect = document.getElementById('add-item-room');
    if (roomSelect) roomSelect.value = roomName;
  }, 100);
};

function initAddView() {
  populateDetailedAddForm(state.editingItemId ? state.items.find((i) => i.id === state.editingItemId) : null);
}

function populateDetailedAddForm(editingItem) {
  const catSelect = document.getElementById('add-item-category');
  const roomSelect = document.getElementById('add-item-room');
  const form = document.getElementById('full-add-form');

  if (catSelect) {
    catSelect.innerHTML = CATEGORIES.filter((c) => c !== 'All')
      .map((cat) => `<option value="${cat}">${cat}</option>`)
      .join('');
  }

  if (roomSelect) {
    roomSelect.innerHTML = state.rooms
      .map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`)
      .join('');
  }

  if (editingItem) {
    document.getElementById('add-item-name').value = editingItem.name;
    document.getElementById('add-item-category').value = editingItem.category;
    document.getElementById('add-item-room').value = editingItem.location.room;
    document.getElementById('add-item-location-desc').value = editingItem.location.spot || editingItem.location.zone;
    document.getElementById('add-item-desc').value = editingItem.description || '';
    document.getElementById('add-item-tags').value = (editingItem.tags || []).join(', ');
  } else {
    if (form) form.reset();
  }
}

window.handleSaveItemSubmit = function (e) {
  e.preventDefault();

  const name = document.getElementById('add-item-name').value.trim();
  const category = document.getElementById('add-item-category').value;
  const room = document.getElementById('add-item-room').value;
  const spot = (document.getElementById('add-item-location-desc')?.value || '').trim();
  const description = document.getElementById('add-item-desc').value.trim();
  const tagsStr = document.getElementById('add-item-tags').value;

  const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
  const now = new Date().toISOString();

  if (state.editingItemId) {
    state.items = state.items.map((item) => {
      if (item.id === state.editingItemId) {
        return {
          ...item,
          name,
          category,
          location: { room, spot, zone: spot },
          description,
          tags,
          lastVerifiedAt: now,
        };
      }
      return item;
    });
    showToast(`Done · Updated "${name}"`, 'success');
    state.editingItemId = null;
  } else {
    const newItem = {
      id: `item-${Date.now()}`,
      name,
      category,
      location: { room, spot, zone: spot },
      description,
      tags,
      lent: { isLent: false },
      lastVerifiedAt: now,
      createdAt: now,
    };
    state.items = [newItem, ...state.items];
    showToast(`Done · Saved "${name}" in ${room}`, 'success');
  }

  saveItems();
  handleDailyCheckIn();

  if (state.isSpotCheckEditing) {
    state.isSpotCheckEditing = false;
    state.spotCheckCurrentIndex++;
    switchPage('spotcheck');
  } else {
    switchPage('home');
  }
};

window.discardDetailedFormEntry = function () {
  if (state.isSpotCheckEditing) {
    state.isSpotCheckEditing = false;
    switchPage('spotcheck');
  } else {
    switchPage('home');
  }
};

window.editItem = function (id) {
  state.editingItemId = id;
  switchPage('add');
  populateDetailedAddForm(state.items.find((i) => i.id === id));
};

// -------------------------------------------------------------------------
// SPOT CHECK
// -------------------------------------------------------------------------

function initSpotCheckPage() {
  state.spotCheckItems = [...state.items].sort((a, b) => new Date(a.lastVerifiedAt || 0).getTime() - new Date(b.lastVerifiedAt || 0).getTime()).slice(0, 3);
  state.spotCheckCurrentIndex = 0;
  renderSpotCheckStep();
}

function renderSpotCheckStep() {
  const container = document.getElementById('spot-check-body');
  if (!container) return;

  if (state.spotCheckItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 space-y-3 flex flex-col items-center justify-center">
        <p class="text-sm text-stone-600">No items available to spot check. Add items first!</p>
        <button onclick="switchPage('add')" class="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold cursor-pointer">Add Item</button>
      </div>
    `;
    return;
  }

  if (state.spotCheckCurrentIndex >= state.spotCheckItems.length) {
    container.innerHTML = `
      <div class="text-center py-6 space-y-3 flex flex-col items-center justify-center">
        <div class="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
          <i data-lucide="check" class="w-7 h-7"></i>
        </div>
        <h3 class="text-lg font-black text-stone-900">All Spot Checks Completed!</h3>
        <p class="text-sm text-stone-600 max-w-xs mx-auto text-center">You confirmed your items are right where they belong.</p>
        <button onclick="switchPage('home')" class="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-soft text-center">
          Back to Home
        </button>
      </div>
    `;
    safeCreateIcons();
    return;
  }

  const item = state.spotCheckItems[state.spotCheckCurrentIndex];

  container.innerHTML = `
    <div class="space-y-3.5 w-full flex flex-col items-center justify-center text-center max-w-sm">
      <div class="text-xs sm:text-sm text-stone-500 font-extrabold">Item ${state.spotCheckCurrentIndex + 1} of ${state.spotCheckItems.length}</div>
      <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2 w-full text-center">
        <h4 class="text-lg font-black text-stone-900">${escapeHtml(item.name)}</h4>
        <div class="text-sm text-stone-900 flex items-center justify-center gap-1.5 font-bold">
          <i data-lucide="map-pin" class="w-4 h-4 text-amber-600"></i>
          <span>${escapeHtml(item.location.room)} › ${escapeHtml(getItemLocationText(item))}</span>
        </div>
      </div>
      <p class="text-sm text-stone-800 font-extrabold text-center">Is this still in this spot?</p>
      <div class="grid grid-cols-2 gap-2.5 pt-1 w-full">
        <button onclick="confirmSpotCheckItem('${item.id}')" class="py-3 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-soft text-center">
          <i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>
          <span>Still there</span>
        </button>
        <button onclick="relocateSpotCheckItem('${item.id}')" class="py-3 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center">
          <i data-lucide="pencil" class="w-4 h-4 text-stone-500"></i>
          <span>Change spot</span>
        </button>
      </div>
    </div>
  `;
  safeCreateIcons();
}

window.confirmSpotCheckItem = function (id) {
  verifyLocation(id);
  state.spotCheckCurrentIndex++;
  renderSpotCheckStep();
};

window.relocateSpotCheckItem = function (id) {
  state.isSpotCheckEditing = true;
  editItem(id);
};

window.startQuickVoiceFromHeader = function () {
  switchPage('add');
  setTimeout(() => toggleVoiceRecognition(), 250);
};

window.resetData = function () {
  showConfirmDialog({
    title: 'Reset Demo Data',
    message: 'Reset all items back to starter demo data?',
    confirmText: 'Reset All',
    confirmClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    onConfirm: () => {
      state.items = INITIAL_ITEMS;
      state.rooms = INITIAL_ROOMS;
      state.engagement.streak = 3;
      saveItems();
      saveRooms();
      saveEngagement();
      renderApp();
      showToast('Reset to starter items');
    },
  });
};

// -------------------------------------------------------------------------
// PWA INSTALLATION & SERVICE WORKER
// -------------------------------------------------------------------------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredInstallPrompt = e;
  const installBtn = document.getElementById('btn-pwa-install');
  if (installBtn) installBtn.classList.remove('hidden');
});

window.installPWA = function () {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  state.deferredInstallPrompt = null;
  const installBtn = document.getElementById('btn-pwa-install');
  if (installBtn) installBtn.classList.add('hidden');
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn(err));
  });
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderApp();
    });
  }

  setTimeout(runPeriodicNotificationCheck, 4000);
  switchPage('home');
});
