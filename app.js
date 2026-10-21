// WhereAbouts - Know where everything is.
// Standard Vanilla PWA Engine (User-Friendly, Zero-Build & Centered Layout)

const ITEMS_KEY = 'spatialcache_items_v1';
const ROOMS_KEY = 'spatialcache_rooms_v1';
const ENGAGEMENT_KEY = 'findit_engagement_v2';

// -------------------------------------------------------------------------
// FIREBASE CONFIGURATION & AUTOMATIC REAL-TIME SYNC
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

// Realtime Auth State Listener
if (auth) {
  auth.onAuthStateChanged((user) => {
    if (suppressAuthGatewayTransition) {
      return;
    }

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
  if (bottomBar) {
    bottomBar.classList.add('hidden');
    bottomBar.style.display = 'none';
  }
  if (header) {
    header.classList.add('hidden');
    header.style.display = 'none';
  }

  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function hideAuthGateway() {
  const authGateway = document.getElementById('view-auth');
  const bottomBar = document.getElementById('bottom-bar');
  const header = document.querySelector('header');

  if (authGateway) authGateway.classList.add('hidden');
  if (bottomBar) {
    bottomBar.classList.remove('hidden');
    bottomBar.style.display = '';
  }
  if (header) {
    header.classList.remove('hidden');
    header.style.display = '';
  }

  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
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
    if (errorBanner && errorMsg) {
      errorMsg.textContent = 'Firebase is connecting or offline. Check network.';
      errorBanner.classList.remove('hidden');
    }
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

  // SIGN UP ACTION
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
        if (err.code === 'auth/email-already-in-use') {
          errorMsg.textContent = 'This email is already registered. Please tap Sign In.';
        } else {
          errorMsg.textContent = err.message || 'Registration failed.';
        }
        errorBanner.classList.remove('hidden');
        safeCreateIcons();
      }
      showToast(err.code === 'auth/email-already-in-use' ? 'This email is already registered. Please Sign In.' : (err.message || 'Registration error'));
    } finally {
      if (btnSignIn) btnSignIn.disabled = false;
      if (btnSignUp) btnSignUp.disabled = false;
    }
  }

  // SIGN IN ACTION
  if (actionType === 'signin') {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      localStorage.removeItem('whereabouts_guest_session');
      showToast('Done · Welcome back!', 'success');
    } catch (err) {
      if (errorBanner && errorMsg) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          errorMsg.textContent = 'Account not found or wrong password. Need an account? Tap Sign Up.';
        } else if (err.code === 'auth/wrong-password') {
          errorMsg.textContent = 'Incorrect password. Tap Forgot Password to reset.';
        } else {
          errorMsg.textContent = err.message || 'Sign in failed.';
        }
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
  if (!auth) {
    showToast('Authentication service unavailable.');
    return;
  }

  const emailInput = document.getElementById('auth-email');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    showToast('Please type your email address above first.');
    if (emailInput) emailInput.focus();
    return;
  }

  showConfirmDialog({
    title: 'Reset Password',
    message: `Send a secure password reset link to ${email}?`,
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
      if (data.items && Array.isArray(data.items)) {
        state.items = data.items;
        saveItems(false);
      }
      if (data.rooms && Array.isArray(data.rooms)) {
        state.rooms = data.rooms;
        saveRooms();
      }
      renderApp();
    } else {
      pushToCloud();
    }
  }, (err) => {
    console.warn('Realtime sync notice:', err);
  });
}

async function pushToCloud() {
  if (!currentUser || !db) return;
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
  if (headerLabel) {
    headerLabel.textContent = currentUser ? 'Account' : 'Log In';
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
          showToast('Account and cloud inventory deleted.');
          showAuthGateway();
        }
      } catch (err) {
        showToast(err.message || 'Error deleting account');
      }
    },
  });
};

// -------------------------------------------------------------------------
// INITIAL DATA & CATEGORY THEMES
// -------------------------------------------------------------------------

const INITIAL_ROOMS = [
  {
    id: 'kitchen-pantry',
    name: 'Kitchen & Pantry',
    icon: 'utensils',
    description: 'Appliances, emergency consumables, and pantry supplies',
    commonZones: ['Pantry Top Shelf', 'Under-Sink Caddy', 'Island Spice Drawer', 'Appliance Cupboard'],
  },
  {
    id: 'hallway-closet',
    name: 'Hallway Closet',
    icon: 'archive',
    description: 'Utility, linen storage, and household supplies',
    commonZones: ['Top Shelf', 'Middle Wire Rack', 'Floor Storage', 'Coat Rack Hooks'],
  },
  {
    id: 'garage-workshop',
    name: 'Garage & Workshop',
    icon: 'wrench',
    description: 'Tools, hardware, sports gear, and car care',
    commonZones: ['Work Bench Pegboard', 'Metal Rack Shelf 2', 'Tool Chest Drawer 3', 'Overhead Bins'],
  },
  {
    id: 'living-room',
    name: 'Living Room',
    icon: 'tv',
    description: 'Entertainment console, keys catchall, and shelves',
    commonZones: ['TV Media Console', 'Side Table Drawer', 'Entryway Catchall Bowl'],
  },
  {
    id: 'home-office',
    name: 'Home Office',
    icon: 'briefcase',
    description: 'Work station, filing cabinet, and cables',
    commonZones: ['Filing Cabinet Top Drawer', 'Desk Right Drawer', 'Cable Organizer Box', 'Bookshelf'],
  },
  {
    id: 'master-bedroom',
    name: 'Master Bedroom',
    icon: 'bed',
    description: 'Personal storage, nightstands, and walk-in wardrobe',
    commonZones: ['Closet High Shelf', 'Nightstand Drawer', 'Dresser Valet Tray', 'Underbed Box'],
  },
];

const INITIAL_ITEMS = [
  {
    id: 'item-1',
    name: 'Passport & Travel Documents',
    category: 'Documents & Valuables',
    location: {
      room: 'Master Bedroom',
      spot: 'Closet top shelf in gray fireproof box (behind winter coats)',
      zone: 'Closet top shelf in gray fireproof box (behind winter coats)',
    },
    description: 'Family blue passports, visas, birth certificates, and travel files.',
    tags: ['passport', 'travel', 'id', 'documents', 'identification', 'kagaz', 'kagaaz', 'visas', 'passports', 'papers'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-06-12T10:15:00.000Z',
    createdAt: '2026-05-10T08:00:00.000Z',
  },
  {
    id: 'item-2',
    name: 'Rechargeable AA & AAA Batteries',
    category: 'Electronics & Cables',
    location: {
      room: 'Hallway Closet',
      spot: 'Middle wire rack in clear divided bin #3 (labeled batteries)',
      zone: 'Middle wire rack in clear divided bin #3 (labeled batteries)',
    },
    description: 'Pre-charged batteries plus 4-slot smart wall charger.',
    tags: ['batteries', 'aa', 'aaa', 'power', 'remotes', 'toys', 'cell', 'battery', 'charger', 'bettery', 'battry'],
    lent: { isLent: false },
    consumable: {
      isConsumable: true,
      quantity: 4,
      unit: 'batteries',
      minThreshold: 4,
    },
    lastVerifiedAt: '2026-10-15T07:22:00.000Z',
    createdAt: '2026-08-12T09:30:00.000Z',
  },
  {
    id: 'item-3',
    name: 'DeWalt 20V Cordless Drill & Bit Kit',
    category: 'Tools & Hardware',
    location: {
      room: 'Garage & Workshop',
      spot: 'Middle shelf under main pegboard workbench (yellow case)',
      zone: 'Middle shelf under main pegboard workbench (yellow case)',
    },
    description: 'Brushless hammer drill with two batteries and charger.',
    tags: ['drill', 'dewalt', 'tools', 'screws', 'hardware', 'dril', 'auzar', 'bit kit'],
    lent: {
      isLent: true,
      lentTo: 'Dave Miller (Next Door)',
      lentDate: '2026-09-28',
      expectedReturn: '2026-10-18',
      notes: 'Borrowed for fixing rear wooden fence gate.',
    },
    lastVerifiedAt: '2026-09-28T16:00:00.000Z',
    createdAt: '2026-07-01T11:00:00.000Z',
  },
  {
    id: 'item-4',
    name: 'Emergency First Aid Kit & Antihistamines',
    category: 'Health & Medication',
    location: {
      room: 'Kitchen & Pantry',
      spot: 'Pantry top shelf on right wall at eye level (red zippered bag)',
      zone: 'Pantry top shelf on right wall at eye level (red zippered bag)',
    },
    description: 'Sterile bandages, antiseptic spray, burn gel, and allergy medicine.',
    tags: ['first aid', 'bandages', 'medicine', 'emergency', 'allergy', 'dawai', 'davai', 'dawa', 'pills', 'tablets'],
    lent: { isLent: false },
    consumable: {
      isConsumable: true,
      quantity: 1,
      unit: 'kit',
      minThreshold: 1,
    },
    lastVerifiedAt: '2026-10-15T08:30:00.000Z',
    createdAt: '2026-06-15T12:00:00.000Z',
  },
  {
    id: 'item-5',
    name: 'Digital Tire Pressure Gauge & Inflator',
    category: 'Tools & Hardware',
    location: {
      room: 'Garage & Workshop',
      spot: 'Third drawer down of red Craftsman chest (black padded pouch)',
      zone: 'Third drawer down of red Craftsman chest (black padded pouch)',
    },
    description: 'Backlit tire gauge reading up to 150 PSI.',
    tags: ['car', 'tires', 'gauge', 'pressure', 'automotive', 'tyre', 'hawa', 'pump', 'inflator'],
    lent: { isLent: false },
    isMissing: true,
    lastVerifiedAt: '2026-07-10T17:45:00.000Z',
    createdAt: '2026-06-01T15:20:00.000Z',
  },
  {
    id: 'item-6',
    name: 'USB-C to HDMI 4K Display Adapter',
    category: 'Electronics & Cables',
    location: {
      room: 'Home Office',
      spot: 'Desk right drawer top organizer tray (mesh zipper pouch)',
      zone: 'Desk right drawer top organizer tray (mesh zipper pouch)',
    },
    description: 'Multiport hub with 4K HDMI, Gigabit LAN, and charging for TV cable or external monitor.',
    tags: [
      'usb-c',
      'hdmi',
      'adapter',
      'dongle',
      'cable',
      'monitor',
      'tv cable',
      'tv wire',
      'cord',
      'taar',
      'screen connector',
      'that thing for the tv cable',
    ],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-13T09:10:00.000Z',
    createdAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'item-7',
    name: 'Spare Car Key Fob & Garden Shed Key',
    category: 'Documents & Valuables',
    location: {
      room: 'Living Room',
      spot: 'Entryway catchall ceramic bowl next to mirror (leather pouch)',
      zone: 'Entryway catchall ceramic bowl next to mirror (leather pouch)',
    },
    description: 'Includes spare fob and brass shed padlock key.',
    tags: ['keys', 'car', 'fob', 'shed', 'valuable', 'chabi', 'chaabi', 'chabee', 'tala', 'lock'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-15T06:00:00.000Z',
    createdAt: '2026-05-10T14:00:00.000Z',
  },
  {
    id: 'item-8',
    name: 'Dyson Cordless Vacuum Attachments & Filter',
    category: 'Household & Cleaning',
    location: {
      room: 'Hallway Closet',
      spot: 'Floor storage underneath hanging coats (clear plastic tote)',
      zone: 'Floor storage underneath hanging coats (clear plastic tote)',
    },
    description: 'Crevice tool, dusting brush, and clean spare HEPA filter.',
    tags: ['vacuum', 'dyson', 'cleaning', 'filter', 'attachments', 'safai', 'pocha', 'vacum'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-12T11:00:00.000Z',
    createdAt: '2026-07-20T16:00:00.000Z',
  },
  {
    id: 'item-9',
    name: 'Camping LED Headlamp & Extra Strap',
    category: 'Seasonal & Apparel',
    location: {
      room: 'Garage & Workshop',
      spot: 'Overhead rack front left corner (clear 30L camping tub)',
      zone: 'Overhead rack front left corner (clear 30L camping tub)',
    },
    description: '350 lumen USB-rechargeable headlamp with red night light mode.',
    tags: ['headlamp', 'camping', 'flashlight', 'light', 'outdoors', 'torch'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-05-15T18:00:00.000Z',
    createdAt: '2026-04-01T12:00:00.000Z',
  },
  {
    id: 'item-10',
    name: 'Thermal Winter Gloves & Wool Beanies',
    category: 'Seasonal & Apparel',
    location: {
      room: 'Hallway Closet',
      spot: 'Top shelf far left fabric storage cube #1 (labeled winter)',
      zone: 'Top shelf far left fabric storage cube #1 (labeled winter)',
    },
    description: 'Ski mittens, 2 merino wool beanies, and neck gaiter.',
    tags: ['gloves', 'winter', 'beanie', 'cold', 'snow', 'clothes', 'kapde', 'topi', 'bistar', 'mittens'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-04-01T13:00:00.000Z',
    createdAt: '2026-03-15T10:00:00.000Z',
  },
  {
    id: 'item-11',
    name: 'Wi-Fi Network Backup Password Card',
    category: 'Office & Tech',
    location: {
      room: 'Living Room',
      spot: 'TV console cable tray taped to underside of router shelf',
      zone: 'TV console cable tray taped to underside of router shelf',
    },
    description: 'Home Wi-Fi backup credentials and recovery keys.',
    tags: ['wifi', 'internet', 'router', 'password', 'tech', 'network', 'code'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-10-15T12:00:00.000Z',
    createdAt: '2026-08-05T09:00:00.000Z',
  },
  {
    id: 'item-12',
    name: 'Compact Telescopic Aluminum Ladder (12 ft)',
    category: 'Tools & Hardware',
    location: {
      room: 'Garage & Workshop',
      spot: 'Metal rack shelf 2 upright against wall with bungee cord',
      zone: 'Metal rack shelf 2 upright against wall with bungee cord',
    },
    description: 'Compact collapsible ladder for painting and ceiling fixtures.',
    tags: ['ladder', 'tools', 'climbing', 'painting', 'garage', 'sidhi', 'seedhi'],
    lent: { isLent: false },
    lastVerifiedAt: '2026-07-05T10:00:00.000Z',
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
  'Tools & Hardware': {
    themeClass: 'cat-theme-tools',
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    badge: 'bg-amber-200 text-amber-950 border-amber-400',
    innerBox: 'bg-white/85 border-amber-200',
    icon: 'wrench',
  },
  'Electronics & Cables': {
    themeClass: 'cat-theme-electronics',
    bg: 'bg-indigo-100',
    border: 'border-indigo-300',
    badge: 'bg-indigo-200 text-indigo-950 border-indigo-400',
    innerBox: 'bg-white/85 border-indigo-200',
    icon: 'cpu',
  },
  'Documents & Valuables': {
    themeClass: 'cat-theme-documents',
    bg: 'bg-yellow-100',
    border: 'border-yellow-300',
    badge: 'bg-yellow-200 text-yellow-950 border-yellow-400',
    innerBox: 'bg-white/85 border-yellow-200',
    icon: 'file-text',
  },
  'Health & Medication': {
    themeClass: 'cat-theme-health',
    bg: 'bg-rose-100',
    border: 'border-rose-300',
    badge: 'bg-rose-200 text-rose-950 border-rose-400',
    innerBox: 'bg-white/85 border-rose-200',
    icon: 'shield-plus',
  },
  'Household & Cleaning': {
    themeClass: 'cat-theme-household',
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    badge: 'bg-emerald-200 text-emerald-950 border-emerald-400',
    innerBox: 'bg-white/85 border-emerald-200',
    icon: 'sparkles',
  },
  'Seasonal & Apparel': {
    themeClass: 'cat-theme-seasonal',
    bg: 'bg-purple-100',
    border: 'border-purple-300',
    badge: 'bg-purple-200 text-purple-950 border-purple-400',
    innerBox: 'bg-white/85 border-purple-200',
    icon: 'sun',
  },
  'Office & Tech': {
    themeClass: 'cat-theme-office',
    bg: 'bg-sky-100',
    border: 'border-sky-300',
    badge: 'bg-sky-200 text-sky-950 border-sky-400',
    innerBox: 'bg-white/85 border-sky-200',
    icon: 'briefcase',
  },
  'Other': {
    themeClass: 'cat-theme-other',
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    badge: 'bg-stone-200 text-stone-900 border-stone-400',
    innerBox: 'bg-white/85 border-stone-200',
    icon: 'package',
  },
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
  addCaptureMode: 'voice',
  activeTourItems: [],
  isRecordingVoice: false,
  isRecordingTour: false,
  editingItemId: null,
  spotCheckItems: [],
  spotCheckCurrentIndex: 0,
  deferredInstallPrompt: null,
};

// -------------------------------------------------------------------------
// STORAGE & UTILITY HELPERS
// -------------------------------------------------------------------------

function loadData() {
  try {
    const rawItems = localStorage.getItem(ITEMS_KEY);
    const rawRooms = localStorage.getItem(ROOMS_KEY);
    const rawEng = localStorage.getItem(ENGAGEMENT_KEY);
    const v3Migrated = localStorage.getItem('findit_v3_forgiving_search_migrated');

    if (!rawItems || !v3Migrated) {
      state.items = INITIAL_ITEMS;
      localStorage.setItem(ITEMS_KEY, JSON.stringify(INITIAL_ITEMS));
      localStorage.setItem('findit_v3_forgiving_search_migrated', 'true');
    } else {
      state.items = JSON.parse(rawItems);
      state.items.forEach((item) => {
        delete item.isEssentialForGuests;
      });
      if (!state.items.some((i) => i.isMissing)) {
        const item5 = state.items.find((i) => i.id === 'item-5') || state.items[0];
        if (item5) {
          item5.isMissing = true;
          delete item5.lastVerifiedAt;
        }
      }
    }

    state.rooms = rawRooms ? JSON.parse(rawRooms) : INITIAL_ROOMS;
    if (rawEng) {
      state.engagement = { ...state.engagement, ...JSON.parse(rawEng) };
    }
  } catch (e) {
    console.error('Error reading localStorage:', e);
    state.items = INITIAL_ITEMS;
    state.rooms = INITIAL_ROOMS;
  }
}

function saveItems(shouldSync = true) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(state.items));
    if (shouldSync) {
      pushToCloud();
    }
  } catch (e) {
    console.error('Error saving items:', e);
  }
}

function saveRooms() {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(state.rooms));
    pushToCloud();
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
    } catch (e) {
      console.warn('Icon rendering notice:', e);
    }
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
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function getItemLocationText(item) {
  if (!item || !item.location) return 'Location not specified';
  if (item.location.spot) return item.location.spot;
  const parts = [
    item.location.zone,
    item.location.container ? `(${item.location.container})` : '',
    item.location.landmark ? `[${item.location.landmark}]` : '',
  ].filter(Boolean);
  return parts.join(' ') || 'General room area';
}

function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isSuccess = type === 'success' || message.toLowerCase().includes('done') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('found') || message.toLowerCase().includes('updated');

  if (isSuccess) {
    toast.className =
      'bg-emerald-600 text-white text-sm sm:text-base font-extrabold px-6 py-3.5 rounded-2xl shadow-elevated flex items-center justify-center gap-2.5 pointer-events-auto transform transition-all duration-200 -translate-y-3 opacity-0 text-center border-2 border-emerald-400/80';
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

  requestAnimationFrame(() => {
    toast.classList.remove('-translate-y-3', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-3');
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

window.showDoneToast = function(subText = '') {
  showToast(subText ? `Done · ${subText}` : 'Done', 'success');
};

function getDynamicTypes() {
  const counts = {};
  state.items.forEach((item) => {
    const cat = item.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const list = Object.keys(counts).map((cat) => ({
    name: cat,
    count: counts[cat],
  }));

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function getDynamicLocations() {
  const counts = {};
  state.items.forEach((item) => {
    const rm = item.location?.room || 'Unassigned';
    counts[rm] = (counts[rm] || 0) + 1;
  });

  state.rooms.forEach((r) => {
    if (!counts[r.name]) {
      counts[r.name] = 0;
    }
  });

  const list = Object.keys(counts).map((rm) => ({
    name: rm,
    count: counts[rm],
  }));

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function getVerificationConfidence(item) {
  if (item.isMissing) {
    return {
      status: 'missing',
      badgeClass: 'bg-red-600 text-white border-red-700 font-extrabold shadow-xs',
      icon: 'alert-triangle',
      label: 'Flagged missing · Not verified today',
      shortLabel: 'Missing',
      isStale: false,
      daysAgo: null,
    };
  }

  if (!item.lastVerifiedAt) {
    return {
      status: 'unverified',
      badgeClass: 'bg-stone-100 text-stone-700 border-stone-300',
      icon: 'clock',
      label: 'Not yet verified',
      shortLabel: 'Not verified',
      isStale: false,
      daysAgo: null,
    };
  }

  const verifiedDate = new Date(item.lastVerifiedAt);
  const now = new Date();
  const diffMs = now.getTime() - verifiedDate.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const diffMonths = Math.max(1, Math.floor(diffDays / 30));
  const dateFormatted = formatStandardDate(verifiedDate);

  if (diffDays >= 90) {
    return {
      status: 'stale',
      badgeClass: 'bg-amber-100 text-amber-950 border-amber-300 ring-1 ring-amber-400/40',
      icon: 'alert-triangle',
      label: `Last confirmed on ${dateFormatted} (~${diffMonths} mos ago · check spot)`,
      shortLabel: `Confirmed ${dateFormatted}`,
      isStale: true,
      daysAgo: diffDays,
      monthsAgo: diffMonths,
    };
  } else if (diffDays <= 7) {
    const timeText = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;
    return {
      status: 'fresh',
      badgeClass: 'bg-emerald-100 text-emerald-950 border-emerald-300',
      icon: 'check-circle',
      label: `Verified fresh (${dateFormatted} · ${timeText})`,
      shortLabel: `Verified ${dateFormatted}`,
      isStale: false,
      daysAgo: diffDays,
    };
  } else {
    return {
      status: 'normal',
      badgeClass: 'bg-stone-100 text-stone-800 border-stone-200',
      icon: 'calendar',
      label: `Confirmed on ${dateFormatted} (${diffDays} days ago)`,
      shortLabel: `Confirmed ${dateFormatted}`,
      isStale: false,
      daysAgo: diffDays,
    };
  }
}

// -------------------------------------------------------------------------
// FORGIVING SEARCH ENGINE
// -------------------------------------------------------------------------

const INDIAN_SYNONYMS = {
  'chashma': ['glasses', 'spectacles', 'reading glasses', 'eyewear'],
  'chashme': ['glasses', 'spectacles', 'reading glasses'],
  'chasma': ['glasses', 'spectacles', 'reading glasses'],
  'spectacles': ['glasses', 'chashma'],
  'glasses': ['spectacles', 'chashma'],
  'chabi': ['keys', 'key', 'fob', 'car key', 'shed', 'lock'],
  'chaabi': ['keys', 'key', 'fob', 'car key', 'shed', 'lock'],
  'chabee': ['keys', 'key', 'fob'],
  'chabhi': ['keys', 'key'],
  'chabiya': ['keys', 'key'],
  'key': ['chabi', 'fob', 'keys', 'chaabi'],
  'keys': ['chabi', 'fob', 'key', 'chaabi'],
  'tala': ['lock', 'padlock', 'shed', 'keys'],
  'lock': ['padlock', 'tala', 'keys'],
  'dawai': ['medicine', 'first aid', 'antihistamines', 'pills', 'tablets', 'bandages'],
  'davai': ['medicine', 'first aid', 'pills', 'dawai'],
  'dawa': ['medicine', 'first aid', 'dawai'],
  'dawaai': ['medicine', 'first aid', 'dawai'],
  'goli': ['medicine', 'pills', 'tablets'],
  'medicine': ['dawai', 'first aid', 'bandages', 'antihistamines', 'pills'],
  'medicines': ['dawai', 'first aid', 'medicine'],
  'pills': ['medicine', 'dawai', 'tablets'],
  'tablets': ['medicine', 'dawai', 'pills'],
  'bandaid': ['first aid', 'bandages'],
  'bandage': ['first aid', 'bandages'],
  'bandages': ['first aid', 'bandage'],
  'allergy': ['antihistamines', 'first aid', 'medicine'],
  'taar': ['cable', 'wire', 'cord', 'adapter', 'charger', 'usb', 'hdmi'],
  'tar': ['cable', 'wire', 'cord', 'taar'],
  'wire': ['cable', 'cord', 'taar', 'adapter', 'charger', 'hdmi'],
  'cable': ['wire', 'cord', 'taar', 'adapter', 'hdmi', 'usb-c'],
  'cables': ['cable', 'wire', 'cord', 'adapter'],
  'cord': ['wire', 'cable', 'taar', 'adapter'],
  'charger': ['power', 'cable', 'batteries', 'adapter', 'usb-c'],
  'adapter': ['hdmi', 'usb-c', 'display', 'dongle', 'converter', 'cable', 'cord', 'tv'],
  'dongle': ['adapter', 'hdmi', 'usb-c', 'converter'],
  'converter': ['adapter', 'hdmi', 'usb-c', 'cable'],
  'tv': ['television', 'hdmi', 'display', 'media console', 'remote', 'cable', 'screen'],
  'television': ['tv', 'hdmi', 'remote'],
  'remort': ['remote', 'controller', 'tv'],
  'rimot': ['remote', 'controller'],
  'remote': ['controller', 'remort', 'tv'],
  'cell': ['batteries', 'battery', 'aa', 'aaa', 'power'],
  'battery': ['batteries', 'cell', 'aa', 'aaa', 'charger', 'power'],
  'batteries': ['battery', 'cell', 'aa', 'aaa'],
  'bettery': ['battery', 'batteries'],
  'battry': ['battery', 'batteries'],
  'wifi': ['wi-fi', 'internet', 'router', 'password'],
  'wi-fi': ['wifi', 'internet', 'router', 'password'],
  'internet': ['wifi', 'router', 'password'],
  'router': ['wifi', 'internet', 'password'],
  'kagaz': ['documents', 'passport', 'papers', 'records', 'certificates'],
  'kagaaz': ['documents', 'passport', 'papers'],
  'dastavez': ['documents', 'passport', 'papers'],
  'passport': ['passports', 'travel', 'documents', 'id', 'kagaz'],
  'passports': ['passport', 'travel', 'documents', 'kagaz'],
  'pasport': ['passport', 'travel', 'documents'],
  'passprt': ['passport'],
  'certificate': ['documents', 'passport', 'records'],
  'certificates': ['documents', 'records'],
  'visa': ['passport', 'documents', 'travel'],
  'visas': ['passport', 'documents', 'travel'],
  'drill': ['dewalt', 'hammer drill', 'hardware', 'screws', 'tools', 'bit kit'],
  'dril': ['drill', 'tools'],
  'auzar': ['tools', 'hardware', 'wrench', 'drill'],
  'paana': ['wrench', 'tools'],
  'wrench': ['tools', 'hardware'],
  'ladder': ['telescopic', 'climbing', 'steps', 'aluminum', 'sidhi', 'seedhi'],
  'sidhi': ['ladder', 'steps'],
  'seedhi': ['ladder', 'steps'],
  'tire': ['car', 'pressure', 'gauge', 'inflator', 'wheel', 'hawa', 'tyre'],
  'tyre': ['tire', 'pressure', 'gauge', 'inflator', 'car'],
  'hawa': ['tire', 'inflator', 'pressure', 'gauge'],
  'inflator': ['tire', 'gauge', 'pressure', 'pump'],
  'bartan': ['utensils', 'cookware', 'dishes', 'kitchen', 'pantry'],
  'safai': ['cleaning', 'vacuum', 'dyson', 'mop'],
  'pocha': ['mop', 'cleaning'],
  'vacuum': ['dyson', 'cleaning', 'filter', 'attachments', 'vacum'],
  'vacum': ['vacuum', 'cleaning'],
  'dyson': ['vacuum', 'cleaning', 'filter'],
  'kapde': ['clothes', 'apparel', 'winter', 'gloves', 'beanies'],
  'kapda': ['clothes', 'winter', 'apparel'],
  'bistar': ['blankets', 'bed', 'winter', 'blanket'],
  'blanket': ['winter', 'blankets', 'covers', 'coats'],
  'blankets': ['winter', 'blanket', 'coats'],
  'gloves': ['winter', 'mittens', 'apparel', 'cold', 'kapde'],
  'mittens': ['gloves', 'winter'],
  'topi': ['beanie', 'hat', 'winter'],
  'beanie': ['topi', 'winter', 'hat', 'gloves'],
  'beanies': ['beanie', 'gloves', 'winter'],
  'jootey': ['shoes', 'boots', 'footwear'],
  'joota': ['shoes', 'footwear'],
  'shoes': ['jootey', 'footwear'],
  'suie': ['needle', 'thread', 'sewing'],
  'sui': ['needle', 'sewing'],
  'dhaga': ['thread', 'sewing'],
  'needle': ['suie', 'thread', 'sewing'],
};

const SEARCH_STOPWORDS = new Set([
  'that', 'thing', 'things', 'for', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'my', 'our', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'where', 'did', 'i',
  'put', 'find', 'can', 'kaha', 'kahan', 'hai', 'wala', 'wali', 'wale', 'ka',
  'ki', 'ke', 'me', 'mein', 'se', 'it', 'its', 'show', 'get', 'give', 'please'
]);

function levenshteinDist(s1, s2) {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  if (Math.abs(s1.length - s2.length) > 2) return 99;

  const d = [];
  for (let i = 0; i <= s1.length; i++) d[i] = [i];
  for (let j = 0; j <= s2.length; j++) d[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[s1.length][s2.length];
}

function scoreItemForForgivingSearch(item, query) {
  const cleanQ = query.toLowerCase().trim();
  if (!cleanQ) return { score: 1, matchReason: '' };

  const itemName = item.name.toLowerCase();
  const description = (item.description || '').toLowerCase();
  const room = (item.location?.room || '').toLowerCase();
  const locationSpot = getItemLocationText(item).toLowerCase();
  const category = (item.category || '').toLowerCase();
  const tags = (item.tags || []).map((t) => t.toLowerCase());

  let score = 0;
  const reasons = [];

  if (itemName === cleanQ) {
    score += 250;
    reasons.push('exact name match');
  } else if (itemName.includes(cleanQ)) {
    score += 150;
    reasons.push(`name contains "${cleanQ}"`);
  }

  const rawTokens = cleanQ.split(/[\s,._\-+/]+/).filter(Boolean);
  const meaningfulTokens = rawTokens.filter((t) => !SEARCH_STOPWORDS.has(t));
  const activeTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

  if (cleanQ.includes('tv') && (cleanQ.includes('cable') || cleanQ.includes('adapter') || cleanQ.includes('wire') || cleanQ.includes('thing'))) {
    if (itemName.includes('hdmi') || itemName.includes('adapter') || tags.includes('tv cable')) {
      score += 180;
      reasons.push('recognized TV cable display adapter request');
    }
  }

  for (const token of activeTokens) {
    let tokenMatched = false;

    if (itemName.includes(token)) {
      score += 80;
      tokenMatched = true;
      reasons.push(`matched "${token}" in item name`);
    }

    if (tags.some((t) => t === token || t.includes(token))) {
      score += 70;
      tokenMatched = true;
      reasons.push(`matched tag "${token}"`);
    }

    if (room.includes(token) || locationSpot.includes(token)) {
      score += 45;
      tokenMatched = true;
      reasons.push(`location match "${token}"`);
    }

    if (description.includes(token) || category.includes(token)) {
      score += 35;
      tokenMatched = true;
    }

    const synonyms = INDIAN_SYNONYMS[token] || [];
    for (const syn of synonyms) {
      if (itemName.includes(syn) || tags.some((t) => t.includes(syn))) {
        score += 75;
        tokenMatched = true;
        reasons.push(`synonym "${token}" → ${syn}`);
        break;
      } else if (description.includes(syn) || locationSpot.includes(syn)) {
        score += 40;
        tokenMatched = true;
        reasons.push(`synonym "${token}" in description`);
        break;
      }
    }

    if (!tokenMatched && token.length >= 4) {
      const nameWords = itemName.split(/\s+/);
      for (const nw of nameWords) {
        if (nw.length >= 4) {
          const maxDist = token.length >= 7 ? 2 : 1;
          if (levenshteinDist(token, nw) <= maxDist) {
            score += 60;
            tokenMatched = true;
            reasons.push(`typo fix: "${token}" ~ ${nw}`);
            break;
          }
        }
      }

      if (!tokenMatched) {
        for (const tag of tags) {
          if (tag.length >= 4) {
            const maxDist = token.length >= 7 ? 2 : 1;
            if (levenshteinDist(token, tag) <= maxDist) {
              score += 55;
              tokenMatched = true;
              reasons.push(`typo fix: "${token}" ~ ${tag}`);
              break;
            }
          }
        }
      }
    }
  }

  return {
    score,
    matchReason: reasons.slice(0, 2).join(' · '),
  };
}

function getFilteredItems() {
  const query = state.searchQuery.trim();

  const candidateItems = state.items.filter((item) => {
    if (state.selectedCategory !== 'All' && item.category !== state.selectedCategory) {
      return false;
    }
    if (state.selectedRoom !== 'All' && item.location.room !== state.selectedRoom) {
      return false;
    }
    if (state.filterLentOnly && (!item.lent || !item.lent.isLent)) {
      return false;
    }
    if (state.filterLowStockOnly) {
      const isLow =
        item.consumable?.isConsumable &&
        (item.consumable.quantity ?? 0) <= (item.consumable.minThreshold ?? 0);
      if (!isLow) return false;
    }
    if (state.filterMissingOnly && !item.isMissing) {
      return false;
    }
    return true;
  });

  if (query) {
    const scoredList = candidateItems
      .map((item) => {
        const { score, matchReason } = scoreItemForForgivingSearch(item, query);
        return { item, score, matchReason };
      })
      .filter((entry) => entry.score > 0);

    scoredList.sort((a, b) => b.score - a.score);
    return scoredList.map((entry) => entry.item);
  }

  const results = [...candidateItems];
  switch (state.sortBy) {
    case 'name-asc':
      results.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      results.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'room-asc':
      results.sort(
        (a, b) =>
          (a.location.room || '').localeCompare(b.location.room || '') ||
          a.name.localeCompare(b.name)
      );
      break;
    case 'category':
      results.sort(
        (a, b) =>
          (a.category || '').localeCompare(b.category || '') ||
          a.name.localeCompare(b.name)
      );
      break;
    case 'verified':
      results.sort(
        (a, b) =>
          new Date(a.lastVerifiedAt || '1970-01-01').getTime() -
          new Date(b.lastVerifiedAt || '1970-01-01').getTime()
      );
      break;
    case 'recent':
    default:
      results.sort((a, b) => {
        const timeB = new Date(b.createdAt || 0).getTime();
        const timeA = new Date(a.createdAt || 0).getTime();
        return timeB - timeA;
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

function renderSortFilterCard() {
  const dynamicTypes = getDynamicTypes();
  const dynamicLocations = getDynamicLocations();

  const typeSelect = document.getElementById('filter-type-select');
  if (typeSelect) {
    const totalCount = state.items.length;
    let typeOptions = `<option value="All">All Types (${totalCount} items)</option>`;
    dynamicTypes.forEach((t) => {
      const isSel = state.selectedCategory === t.name ? 'selected' : '';
      typeOptions += `<option value="${escapeHtml(t.name)}" ${isSel}>${escapeHtml(t.name)} (${t.count})</option>`;
    });
    typeSelect.innerHTML = typeOptions;
    typeSelect.value = state.selectedCategory;
  }

  const locSelect = document.getElementById('filter-location-select');
  if (locSelect) {
    const uniqueRoomsCount = dynamicLocations.length;
    let locOptions = `<option value="All">All Locations (${uniqueRoomsCount} rooms)</option>`;
    dynamicLocations.forEach((l) => {
      const isSel = state.selectedRoom === l.name ? 'selected' : '';
      locOptions += `<option value="${escapeHtml(l.name)}" ${isSel}>${escapeHtml(l.name)} (${l.count})</option>`;
    });
    locSelect.innerHTML = locOptions;
    locSelect.value = state.selectedRoom;
  }

  const sortSelect = document.getElementById('sort-order-select');
  if (sortSelect) {
    sortSelect.value = state.sortBy || 'recent';
  }

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
    if (!hasActiveFilters) {
      filterAllBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer bg-stone-900 text-white shadow-xs';
    } else {
      filterAllBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-stone-50';
    }
  }

  if (filterLentBtn) {
    const lentCount = state.items.filter((i) => i.lent && i.lent.isLent).length;
    const lentBadge = document.getElementById('badge-lent-count');
    if (lentBadge) {
      lentBadge.textContent = lentCount;
      lentBadge.style.display = lentCount > 0 ? 'inline-block' : 'none';
    }
    if (state.filterLentOnly) {
      filterLentBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer bg-rose-500 text-white border border-rose-600 shadow-xs flex items-center gap-1.5';
    } else {
      filterLentBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-rose-50 flex items-center gap-1.5';
    }
  }

  if (filterLowBtn) {
    const lowCount = state.items.filter(
      (i) =>
        i.consumable?.isConsumable &&
        (i.consumable.quantity ?? 0) <= (i.consumable.minThreshold ?? 0)
    ).length;
    const lowBadge = document.getElementById('badge-low-count');
    if (lowBadge) {
      lowBadge.textContent = lowCount;
      lowBadge.style.display = lowCount > 0 ? 'inline-block' : 'none';
    }
    if (state.filterLowStockOnly) {
      filterLowBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer bg-amber-500 text-stone-950 border border-amber-600 shadow-xs flex items-center gap-1.5';
    } else {
      filterLowBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-amber-50 flex items-center gap-1.5';
    }
  }

  if (filterMissingBtn) {
    const missingCount = state.items.filter((i) => i.isMissing).length;
    const missingBadge = document.getElementById('badge-missing-count');
    if (missingBadge) {
      missingBadge.textContent = missingCount;
      missingBadge.style.display = missingCount > 0 ? 'inline-flex' : 'none';
    }
    const labelSpan = filterMissingBtn.querySelector('.missing-label-text');
    if (labelSpan) {
      labelSpan.textContent = '🚩 Missing';
    }
    if (state.filterMissingOnly) {
      filterMissingBtn.className =
        'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer bg-red-600 text-white border border-red-700 shadow-xs flex items-center gap-1.5';
    } else {
      if (missingCount > 0) {
        filterMissingBtn.className =
          'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all cursor-pointer bg-red-50 border-red-400 text-red-900 hover:bg-red-100 flex items-center gap-1.5';
      } else {
        filterMissingBtn.className =
          'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer bg-white border-stone-300 text-stone-700 hover:bg-red-50 flex items-center gap-1.5';
      }
    }
  }

  if (btnActiveReset) {
    if (hasActiveFilters) {
      btnActiveReset.classList.remove('hidden');
    } else {
      btnActiveReset.classList.add('hidden');
    }
  }

  const clearSearchBtn = document.getElementById('btn-clear-search');
  if (clearSearchBtn) {
    clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
  }
}

function renderEngagementStatus() {
  const streakBadge = document.getElementById('streak-counter-badge');
  const healthBadge = document.getElementById('health-score-badge');
  const notifBtnLabel = document.getElementById('notif-button-label');
  const testNotifBtn = document.getElementById('btn-test-notification');
  const notifNote = document.getElementById('notif-status-note');
  const checkinBtn = document.getElementById('btn-daily-checkin');

  const streak = state.engagement.streak || 1;
  if (streakBadge) {
    streakBadge.textContent = `${streak}-Day Organizing Streak`;
  }

  const nowMs = Date.now();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const verifiedCount = state.items.filter((item) => {
    if (!item.lastVerifiedAt) return false;
    const diff = nowMs - new Date(item.lastVerifiedAt).getTime();
    return diff <= twoWeeksMs;
  }).length;

  const clarityScore = state.items.length > 0 ? Math.round((verifiedCount / state.items.length) * 100) : 100;
  if (healthBadge) {
    healthBadge.textContent = `Home Clarity: ${clarityScore}%`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const isCheckedInToday = state.engagement.lastCheckInDate === todayStr;
  if (checkinBtn) {
    if (isCheckedInToday) {
      checkinBtn.innerHTML = `<span>✅</span><span>Checked In Today (${streak}🔥)</span>`;
      checkinBtn.className =
        'px-4 py-2.5 bg-emerald-100 text-emerald-950 font-extrabold text-sm rounded-xl cursor-default text-center flex items-center justify-center gap-2 shadow-xs border border-emerald-300';
    } else {
      checkinBtn.innerHTML = `<span>🔥</span><span>Daily Check-In (+1 Streak)</span>`;
      checkinBtn.className =
        'px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-stone-950 font-black text-sm rounded-xl transition-all shadow-soft flex items-center justify-center gap-2 cursor-pointer text-center pulse-subtle';
    }
  }

  const notifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (notifBtnLabel) {
    notifBtnLabel.textContent = notifGranted ? 'Reminders Active' : 'Enable Daily Reminders';
  }

  if (testNotifBtn) {
    if (notifGranted) {
      testNotifBtn.classList.remove('hidden');
    } else {
      testNotifBtn.classList.add('hidden');
    }
  }

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

  showToast(`🎉 Streak increased to ${state.engagement.streak} days! Keeping home organized.`);

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('WhereAbouts: Check-In Complete! 🔥', {
        body: `Day ${state.engagement.streak} locked in! Your home items and lent belongings are right in memory.`,
        icon: './icon-192.png',
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }
};

window.toggleDailyNotifications = async function () {
  if (typeof Notification === 'undefined') {
    showToast('Notifications are not supported on this browser.');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('Daily reminders are already active on this device!');
    renderEngagementStatus();
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      state.engagement.notificationsEnabled = true;
      saveEngagement();
      renderEngagementStatus();
      showToast('🔔 Daily reminders enabled!');

      new Notification('WhereAbouts Reminders Active 🌟', {
        body: 'Welcome! You will receive gentle reminders so you never misplace tools or forget lent items.',
        icon: './icon-192.png',
      });
    } else {
      showToast('Notifications were not granted. You can re-enable anytime in browser settings.');
    }
  } catch (err) {
    console.error('Notification permission error:', err);
    showToast('Could not request notification permission.');
  }
};

window.sendTestNotification = function () {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    showToast('Please enable notifications first.');
    return;
  }

  const sampleItems = ['Passports', 'Cordless Drill', 'Extra Car Keys', 'First Aid Kit'];
  const randomItem = sampleItems[Math.floor(Math.random() * sampleItems.length)];

  try {
    new Notification('WhereAbouts: 15s Memory Spot Check 📍', {
      body: `Quick check! Do you know where your ${randomItem} is stored? Tap to check!`,
      icon: './icon-192.png',
      badge: './favicon-32.png',
    });
    showToast('Test notification sent! Check your screen/banner.');
  } catch (err) {
    console.warn('Error creating test notification:', err);
    showToast('Could not deliver notification.');
  }
};

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
  if (state.filterMissingOnly) {
    state.filterLentOnly = false;
    state.filterLowStockOnly = false;
  }
  renderApp();
};

window.setQuickSearchQuery = function (queryText) {
  state.searchQuery = queryText;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = queryText;
  renderApp();
  const card = document.getElementById('main-content-view');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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

window.clearAllFilters = function () {
  resetAllFilters();
};

window.clearSearchInput = function () {
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  renderApp();
};

// -------------------------------------------------------------------------
// SELF-HEALING ("NOT THERE") WORKFLOW
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
        message: 'Enter borrower name to update WhereAbouts’s tracking:',
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
          showToast(`Done · Marked ${item.name} as lent to ${item.lent.lentTo}!`, 'success');
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
      item.description = item.description
        ? `${item.description} (Used up on ${formatStandardDate(new Date())})`
        : `Used up on ${formatStandardDate(new Date())}`;
      item.lastVerifiedAt = new Date().toISOString();
      saveItems();
      renderApp();
      showToast(`Done · Marked ${item.name} as used up (0 in stock)`, 'success');
      break;

    case 'missing':
      item.isMissing = true;
      delete item.lastVerifiedAt;
      saveItems();
      renderApp();
      showToast(`Flagged "${item.name}" as missing in red (not verified today)`, 'warning');
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
    const rooms = state.rooms.length > 0 ? state.rooms : INITIAL_ROOMS;
    roomSelect.innerHTML = rooms
      .map(
        (r) =>
          `<option value="${escapeHtml(r.name)}" ${r.name === item.location.room ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
      )
      .join('');
  }

  if (zoneInput) {
    zoneInput.value = '';
    zoneInput.placeholder = `e.g. Nightstand drawer in gray box (was: ${getItemLocationText(item)})`;
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
// PAGE NAVIGATION & VIEWS
// -------------------------------------------------------------------------

window.switchPage = function (pageId) {
  state.activePage = pageId;
  const pageList = ['home', 'add', 'streak', 'spotcheck', 'about'];

  pageList.forEach((p) => {
    const pageEl = document.getElementById(`view-${p}`);
    if (pageEl) {
      if (p === pageId) {
        pageEl.classList.remove('hidden');
        pageEl.classList.add('page-enter');
      } else {
        pageEl.classList.add('hidden');
        pageEl.classList.remove('page-enter');
      }
    }

    const navBtn = document.getElementById(`nav-btn-${p}`);
    if (navBtn) {
      if (p === 'add') {
        if (pageId === 'add') {
          navBtn.className =
            'nav-tab-btn active flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 cursor-pointer transform scale-105 transition-all min-h-[48px] select-none touch-manipulation';
        } else {
          navBtn.className =
            'nav-tab-btn flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all min-h-[48px] select-none touch-manipulation';
        }
      } else {
        if (p === pageId) {
          navBtn.className =
            'nav-tab-btn active flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl transition-all cursor-pointer text-amber-600 font-extrabold bg-amber-50/90 shadow-xs ring-1 ring-amber-300 min-h-[48px] select-none touch-manipulation';
        } else {
          navBtn.className =
            'nav-tab-btn flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl transition-all cursor-pointer text-stone-500 hover:text-stone-900 font-semibold min-h-[48px] select-none touch-manipulation';
        }
      }
    }
  });

  if (pageId === 'home') {
    renderApp();
  } else if (pageId === 'add') {
    initAddView();
  } else if (pageId === 'streak') {
    renderEngagementStatus();
  } else if (pageId === 'spotcheck') {
    initSpotCheckPage();
  }

  window.scrollTo(0, 0);
  safeCreateIcons();
};

window.handleNavItemsClick = function () {
  switchPage('home');
};

window.openAboutModal = function () {
  switchPage('about');
};

window.openHabitsModal = function () {
  switchPage('streak');
};

function renderMainView() {
  const container = document.getElementById('main-content-view');
  if (!container) return;

  const btnGrid = document.getElementById('view-tab-grid');
  const btnRooms = document.getElementById('view-tab-rooms');
  const btnLending = document.getElementById('view-tab-lending');

  if (btnGrid)
    btnGrid.className = `px-5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer text-center ${
      state.viewMode === 'grid'
        ? 'bg-white text-stone-900 shadow-soft'
        : 'text-stone-600 hover:text-stone-900'
    }`;
  if (btnRooms)
    btnRooms.className = `px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer text-center ${
      state.viewMode === 'rooms'
        ? 'bg-white text-stone-900 shadow-soft'
        : 'text-stone-600 hover:text-stone-900'
    }`;
  if (btnLending)
    btnLending.className = `px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
      state.viewMode === 'lending'
        ? 'bg-white text-stone-900 shadow-soft'
        : 'text-stone-600 hover:text-stone-900'
    }`;

  if (state.viewMode === 'grid') {
    renderGridView(container);
  } else if (state.viewMode === 'rooms') {
    renderRoomsView(container);
  } else if (state.viewMode === 'lending') {
    renderLendingView(container);
  }
}

function renderDirectAnswerCard(item, confidence, matchReason) {
  const theme = CATEGORY_THEMES[item.category] || CATEGORY_THEMES['Other'];
  const isLent = item.lent && item.lent.isLent;

  const locationParts = [
    item.location.room,
    getItemLocationText(item),
  ].filter(Boolean);

  return `
    <div class="w-full ${theme.themeClass} ${item.isMissing ? 'bg-red-50/95 border-red-500 ring-4 ring-red-400' : `${theme.bg} ${theme.border} ring-2 ring-amber-400/60`} rounded-2xl border-2 p-4 sm:p-5 shadow-elevated relative overflow-hidden text-center space-y-3.5 max-w-xl mx-auto">
      
      <div class="flex items-center justify-between gap-1.5 border-b border-stone-300/60 pb-2">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900 text-amber-300 font-black text-xs uppercase tracking-wider shadow-xs">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-300"></i>
          <span>Direct Answer</span>
        </div>

        ${
          !item.isMissing
            ? `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs ${confidence.badgeClass}">
                <i data-lucide="${confidence.icon}" class="w-3.5 h-3.5"></i>
                <span>${confidence.label}</span>
              </div>`
            : ''
        }
      </div>

      <div class="space-y-1">
        <div class="flex flex-wrap items-center justify-center gap-1.5">
          ${
            item.isMissing
              ? `<span class="inline-flex items-center gap-1.5 text-xs font-black px-3 py-0.5 rounded-full bg-red-600 text-white border border-red-700 shadow-xs animate-pulse">
                  <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-white"></i>
                  <span>Missing</span>
                </span>`
              : ''
          }
          <span class="text-xs font-extrabold px-3 py-1 rounded-full border shadow-xs ${theme.badge}">
            <i data-lucide="${theme.icon || 'tag'}" class="w-3.5 h-3.5 inline mr-1"></i>
            ${escapeHtml(item.category)}
          </span>
          ${
            isLent
              ? `<span class="text-xs font-bold px-3 py-0.5 rounded-full bg-rose-200 text-rose-950 border border-rose-300">
                  🤝 Lent to ${escapeHtml(item.lent.lentTo || 'Someone')}
                </span>`
              : ''
          }
        </div>
        <h3 class="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight break-words">
          ${escapeHtml(item.name)}
        </h3>
        ${
          matchReason
            ? `<p class="text-xs text-stone-600 font-semibold">Found via: <span class="font-bold text-stone-800">${escapeHtml(matchReason)}</span></p>`
            : ''
        }
      </div>

      <div class="bg-white/95 rounded-2xl p-4 border border-amber-300/90 shadow-soft space-y-2 text-center">
        <div class="text-stone-500 text-xs font-extrabold uppercase tracking-wider">
          📍 Exact Location
        </div>
        <div class="text-lg sm:text-xl font-black text-stone-900 leading-snug break-words">
          &ldquo;<span class="text-amber-800">${escapeHtml(item.name)}:</span> ${escapeHtml(locationParts.join(' › '))}&rdquo;
        </div>
      </div>

      <div class="pt-1 flex items-center justify-center gap-2.5 w-full max-w-sm mx-auto">
        <button
          type="button"
          onclick="openNotThereModal('${item.id}')"
          class="flex-1 py-2.5 px-3 bg-amber-100 hover:bg-amber-200 active:opacity-85 border border-amber-300 text-amber-950 font-extrabold text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors"
        >
          <i data-lucide="help-circle" class="w-4 h-4 text-amber-700"></i>
          <span>Not there!</span>
        </button>

        <button
          type="button"
          onclick="verifyLocation('${item.id}')"
          class="flex-1 py-2.5 px-3 ${item.isMissing ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} active:opacity-85 text-white font-extrabold text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-soft transition-colors"
        >
          <i data-lucide="check" class="w-4 h-4 text-white"></i>
          <span>${item.isMissing ? 'I Found It!' : 'Still here'}</span>
        </button>

        <button
          type="button"
          onclick="editItem('${item.id}')"
          class="py-2.5 px-3 bg-white hover:bg-stone-50 active:opacity-85 border border-stone-300 text-stone-700 font-bold text-sm rounded-xl cursor-pointer shadow-xs transition-colors"
          title="Edit"
        >
          <i data-lucide="pencil" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;
}

function renderGridView(container) {
  const isSearchActive = Boolean(state.searchQuery.trim());
  const filtered = getFilteredItems();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center bg-white/95 rounded-2xl border border-stone-200 space-y-3 shadow-soft w-full max-w-md mx-auto flex flex-col items-center justify-center">
        <div class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
          <i data-lucide="search" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-stone-900">No items found</h3>
        <p class="text-xs text-stone-500 max-w-xs mx-auto text-center">
          ${
            state.searchQuery
              ? `No items match "${escapeHtml(state.searchQuery)}". Try searching by function or Hinglish.`
              : 'No items match your active category or filters.'
          }
        </p>
        <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
          ${
            state.searchQuery || state.selectedCategory !== 'All' || state.filterLowStockOnly
              ? `<button onclick="clearAllFilters()" class="px-3 py-1.5 text-xs font-semibold border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 cursor-pointer">Clear filters</button>`
              : ''
          }
          <button
            onclick="switchPage('add')"
            class="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-soft"
          >
            <i data-lucide="plus" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Add item now</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  if (isSearchActive) {
    const topItem = filtered[0];
    const topConfidence = getVerificationConfidence(topItem);
    const { matchReason } = scoreItemForForgivingSearch(topItem, state.searchQuery);
    const otherMatches = filtered.slice(1);

    const directAnswerHtml = renderDirectAnswerCard(topItem, topConfidence, matchReason);
    const otherMatchesHtml =
      otherMatches.length > 0
        ? `
        <div class="w-full pt-3 space-y-3">
          <div class="w-full flex items-center justify-between border-b border-stone-200/80 pb-1 px-1">
            <span class="text-sm font-bold text-stone-700">
              Other related items (${otherMatches.length})
            </span>
            <span class="text-xs text-stone-500">
              Top match above
            </span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
            ${otherMatches.map((item) => renderItemCardHtml(item)).join('')}
          </div>
        </div>
      `
        : '';

    container.innerHTML = `
      <div class="space-y-4 w-full flex flex-col items-center">
        ${directAnswerHtml}
        ${otherMatchesHtml}
        <div class="pt-1 text-center">
          <button
            onclick="clearSearchInput()"
            class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Clear Search • View All (${state.items.length})
          </button>
        </div>
      </div>
    `;
    return;
  }

  const adCardSnippet = `
    <div class="w-full bg-stone-50 border-2 border-dashed border-stone-300 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-2 shadow-xs">
      <div class="flex items-center justify-between w-full px-1">
        <span class="text-[10px] font-black uppercase tracking-wider bg-stone-200 text-stone-700 px-2 py-0.5 rounded">Sponsored</span>
        <span class="text-xs text-stone-400 font-medium">Recommendation</span>
      </div>
      <div class="w-full py-3 flex flex-col items-center justify-center text-stone-500 space-y-1">
        <i data-lucide="package" class="w-6 h-6 text-stone-400"></i>
        <span class="text-sm font-bold text-stone-800">Clear Storage Bins & Labels</span>
        <span class="text-xs text-stone-500 max-w-xs">Organize shelves and drawers with durable stackable containers</span>
      </div>
    </div>
  `;

  let itemsHtml = '';
  filtered.forEach((item, index) => {
    itemsHtml += renderItemCardHtml(item);
    if ((index + 1) % 6 === 0 && index !== filtered.length - 1) {
      itemsHtml += adCardSnippet;
    }
  });

  container.innerHTML = `
    <div class="space-y-3.5 w-full flex flex-col items-center">
      <div class="w-full flex items-center justify-between text-xs sm:text-sm text-stone-600 px-1 text-center">
        <span>Showing <strong>${filtered.length}</strong> of <strong>${state.items.length}</strong> items</span>
        <span class="text-amber-800 font-bold">Tap card buttons to verify spot</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
        ${itemsHtml}
      </div>

      <div class="w-full pt-4 flex flex-col items-center justify-center text-center">
        <button
          onclick="scrollToTopView()"
          class="px-5 py-2.5 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 rounded-xl text-xs sm:text-sm font-bold shadow-soft flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <i data-lucide="arrow-up" class="w-4 h-4 text-stone-600"></i>
          <span>Back to Top</span>
        </button>
      </div>
    </div>
  `;
}

function renderItemCardHtml(item) {
  const isLent = item.lent && item.lent.isLent;
  const isLowConsumable =
    item.consumable?.isConsumable &&
    (item.consumable.quantity ?? 0) <= (item.consumable.minThreshold ?? 0);

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
              ? `<span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-xs ${confidence.badgeClass}" title="${confidence.label}">
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
                <button
                  onclick="returnLentItem('${item.id}')"
                  class="text-xs bg-white border border-rose-300 px-2.5 py-0.5 rounded-lg font-bold text-rose-900 hover:bg-rose-100 transition-colors shrink-0"
                >
                  Return
                </button>
              </div>`
            : ''
        }

        ${
          item.consumable?.isConsumable
            ? `<div class="inline-flex items-center gap-2 bg-white/95 rounded-xl px-3 py-1 border ${theme.border} text-xs shadow-xs">
                <span class="text-stone-500 font-medium">In Stock:</span>
                <strong class="${isLowConsumable ? 'text-red-600 font-black' : 'text-stone-900 font-extrabold'} text-sm">
                  ${item.consumable.quantity} ${escapeHtml(item.consumable.unit || 'items')}
                </strong>
                <div class="flex items-center gap-1 ml-1.5">
                  <button onclick="changeItemQuantity('${item.id}', -1)" class="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold leading-none">-</button>
                  <button onclick="changeItemQuantity('${item.id}', 1)" class="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold leading-none">+</button>
                </div>
              </div>`
            : ''
        }
      </div>

      <div class="w-full mt-3.5 pt-2.5 border-t ${theme.border} flex items-center justify-between gap-2 text-xs">
        <button
          onclick="verifyLocation('${item.id}')"
          class="flex-1 py-2 px-2.5 font-black text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs text-center"
          title="Confirm spot"
        >
          <i data-lucide="check" class="w-4 h-4 text-emerald-700 shrink-0"></i>
          <span class="text-xs">Still here</span>
        </button>

        <button
          onclick="openNotThereModal('${item.id}')"
          class="flex-1 py-2 px-2.5 font-black text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs text-center"
          title="Not in spot"
        >
          <i data-lucide="help-circle" class="w-4 h-4 text-amber-700 shrink-0"></i>
          <span class="text-xs">Not there!</span>
        </button>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            onclick="toggleLentStatus('${item.id}')"
            class="p-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 transition-colors shadow-xs"
            title="${isLent ? 'Mark Returned' : 'Lend out'}"
          >
            <i data-lucide="${isLent ? 'corner-down-left' : 'share-2'}" class="w-4 h-4"></i>
          </button>

          <button
            onclick="editItem('${item.id}')"
            class="p-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 transition-colors shadow-xs"
            title="Edit"
          >
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>

          <button
            onclick="deleteItem('${item.id}')"
            class="p-2 rounded-xl border border-stone-300 bg-white hover:bg-red-50 text-stone-400 hover:text-red-700 transition-colors shadow-xs"
            title="Delete"
          >
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

        <div class="border-t border-stone-100 pt-2 space-y-1.5 w-full text-center">
          ${
            roomItems.length === 0
              ? `<p class="text-xs text-stone-400 italic py-1 text-center">No items listed yet.</p>`
              : `<div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                  ${roomItems
                    .map(
                      (item) => `
                    <div class="flex items-center justify-between text-xs bg-stone-50 p-2 rounded-xl border border-stone-200/70">
                      <div class="text-left pr-1 truncate">
                        <span class="font-bold text-stone-900 text-xs">${escapeHtml(item.name)}</span>
                        <div class="text-xs text-stone-500 truncate">${escapeHtml(getItemLocationText(item))}</div>
                      </div>
                      <button onclick="editItem('${item.id}')" class="text-stone-400 hover:text-stone-800 p-1">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>`
          }
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
    <div class="space-y-4 w-full flex flex-col items-center">
      <div class="text-center text-xs sm:text-sm text-stone-500">
        Organized across <strong>${state.rooms.length}</strong> household spaces
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        ${roomsHtml}
      </div>
    </div>
  `;
}

function renderLendingView(container) {
  const lentItems = state.items.filter((i) => i.lent && i.lent.isLent);

  container.innerHTML = `
    <div class="space-y-4 w-full flex flex-col items-center">
      <div class="bg-white/95 border border-stone-200 rounded-2xl p-5 space-y-3 shadow-soft w-full flex flex-col items-center justify-center text-center">
        <div class="text-center space-y-1">
          <h3 class="text-lg font-extrabold text-stone-900">Lent Out Belongings</h3>
          <p class="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto">
            Know exactly who borrowed your tools, books, and gear.
          </p>
        </div>

        <button
          onclick="openRecordLoanModal()"
          class="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-soft"
        >
          <i data-lucide="plus" class="w-4 h-4 text-amber-400"></i>
          <span>Record a Loan</span>
        </button>

        ${
          lentItems.length === 0
            ? `<div class="p-6 text-center bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1 w-full max-w-sm mx-auto">
                <i data-lucide="check" class="w-6 h-6 text-emerald-600 mx-auto"></i>
                <h4 class="text-sm font-bold text-stone-800">Everything is at Home</h4>
              </div>`
            : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full pt-1">
                ${lentItems
                  .map(
                    (item) => `
                  <div class="bg-rose-100 border-2 border-rose-300 rounded-xl p-4 flex flex-col items-center justify-between space-y-2 text-center shadow-soft">
                    <div class="space-y-1.5 w-full flex flex-col items-center text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        <span class="text-sm font-black text-stone-900">${escapeHtml(item.name)}</span>
                        <span class="text-xs font-bold bg-rose-200 text-rose-950 border border-rose-400 px-2.5 py-0.5 rounded-full uppercase">Lent</span>
                      </div>
                      <div class="text-xs sm:text-sm text-stone-800">Borrower: <strong>${escapeHtml(item.lent.lentTo || 'Someone')}</strong></div>
                      ${item.lent.lentDate ? `<div class="text-xs text-stone-500">Lent on: ${escapeHtml(formatStandardDate(item.lent.lentDate))}</div>` : ''}
                      ${item.lent.expectedReturn ? `<div class="text-xs text-rose-700 font-bold">Expected return: ${escapeHtml(formatStandardDate(item.lent.expectedReturn))}</div>` : ''}
                    </div>

                    <div class="pt-2 border-t border-rose-200/80 flex items-center justify-between gap-1 text-xs w-full">
                      <span class="text-stone-500">${escapeHtml(item.location.room)}</span>
                      <button
                        onclick="returnLentItem('${item.id}')"
                        class="px-3 py-1 bg-white hover:bg-stone-50 border border-rose-300 rounded-lg font-bold text-rose-900 transition-colors shadow-soft"
                      >
                        Mark Returned
                      </button>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>`
        }
      </div>
    </div>
  `;
}

window.selectCategory = function (category) {
  state.selectedCategory = category;
  renderApp();
};

window.setViewMode = function (mode) {
  state.viewMode = mode;
  renderApp();
};

window.clearAllFilters = function () {
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  state.selectedCategory = 'All';
  state.filterLowStockOnly = false;
  renderApp();
};

window.toggleLowStockFilter = function () {
  state.filterLowStockOnly = !state.filterLowStockOnly;
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

window.markItemFound = function (id) {
  const now = new Date().toISOString();
  state.items = state.items.map((item) =>
    item.id === id ? { ...item, isMissing: false, lastVerifiedAt: now } : item
  );
  saveItems();
  renderApp();
  showToast('Done · Item found and verified!', 'success');
};

window.changeItemQuantity = function (id, delta) {
  state.items = state.items.map((item) => {
    if (item.id === id && item.consumable) {
      const newQty = Math.max(0, (item.consumable.quantity || 0) + delta);
      return {
        ...item,
        consumable: { ...item.consumable, quantity: newQty },
      };
    }
    return item;
  });
  saveItems();
  renderApp();
};

window.returnLentItem = function (id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  state.items = state.items.map((i) =>
    i.id === id
      ? { ...i, lent: { isLent: false }, lastVerifiedAt: new Date().toISOString() }
      : i
  );
  saveItems();
  renderApp();
  showToast(`Done · "${item.name}" returned home to ${item.location.room}`, 'success');
};

// -------------------------------------------------------------------------
// IN-APP DIALOGS
// -------------------------------------------------------------------------

function showConfirmDialog({ title, message, confirmText = 'Confirm', confirmClass = 'bg-rose-600 hover:bg-rose-700 text-white', onConfirm }) {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal) {
    if (onConfirm) onConfirm();
    return;
  }
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-message');
  const inputContainer = document.getElementById('dialog-input-container');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (inputContainer) inputContainer.classList.add('hidden');

  if (btnConfirm) {
    btnConfirm.textContent = confirmText;
    btnConfirm.className = `py-2.5 px-4 font-bold text-sm rounded-xl shadow-soft transition-colors cursor-pointer touch-manipulation ${confirmClass}`;
  }

  modal.classList.remove('hidden');

  const cleanup = () => {
    modal.classList.add('hidden');
    if (btnCancel) btnCancel.onclick = null;
    if (btnConfirm) btnConfirm.onclick = null;
  };

  if (btnCancel) {
    btnCancel.onclick = () => {
      cleanup();
    };
  }

  if (btnConfirm) {
    btnConfirm.onclick = () => {
      cleanup();
      if (onConfirm) onConfirm();
    };
  }
}

function showPromptDialog({ title, message, defaultValue = '', placeholder = '', confirmText = 'Save', onConfirm }) {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal) {
    if (onConfirm) onConfirm(defaultValue);
    return;
  }
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-message');
  const inputContainer = document.getElementById('dialog-input-container');
  const inputEl = document.getElementById('dialog-input');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (inputContainer) inputContainer.classList.remove('hidden');
  if (inputEl) {
    inputEl.value = defaultValue;
    inputEl.placeholder = placeholder;
  }

  if (btnConfirm) {
    btnConfirm.textContent = confirmText;
    btnConfirm.className = 'py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white font-bold text-sm rounded-xl shadow-soft transition-colors cursor-pointer touch-manipulation';
  }

  modal.classList.remove('hidden');
  if (inputEl) {
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 60);
  }

  const cleanup = () => {
    modal.classList.add('hidden');
    if (inputContainer) inputContainer.classList.add('hidden');
    if (btnCancel) btnCancel.onclick = null;
    if (btnConfirm) btnConfirm.onclick = null;
  };

  if (btnCancel) {
    btnCancel.onclick = () => {
      cleanup();
    };
  }

  if (btnConfirm) {
    btnConfirm.onclick = () => {
      const val = inputEl ? inputEl.value.trim() : '';
      cleanup();
      if (onConfirm) onConfirm(val || defaultValue);
    };
  }
}

window.toggleLentStatus = function (id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  if (item.lent && item.lent.isLent) {
    returnLentItem(id);
  } else {
    showPromptDialog({
      title: 'Lend Item',
      message: `Who is borrowing "${item.name}"?`,
      defaultValue: 'Neighbor / Friend',
      placeholder: 'Enter borrower name...',
      confirmText: 'Record Loan',
      onConfirm: (borrower) => {
        const lenderName = borrower.trim() || 'Neighbor / Friend';
        state.items = state.items.map((i) =>
          i.id === id
            ? {
                ...i,
                lent: {
                  isLent: true,
                  lentTo: lenderName,
                  lentDate: new Date().toISOString().slice(0, 10),
                },
              }
            : i
        );
        saveItems();
        renderApp();
        showToast(`Marked "${item.name}" as lent to ${lenderName}`);
      },
    });
  }
};

window.deleteItem = function (id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  showConfirmDialog({
    title: 'Delete Item',
    message: `Remove "${item.name}" from WhereAbouts? This action cannot be undone.`,
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
// ADD / CAPTURE WORKFLOW (2-FIELD LOCATION: ROOM & SPOT)
// -------------------------------------------------------------------------

window.openQuickAddModal = function () {
  state.editingItemId = null;
  switchPage('add');
};

window.openQuickAddModalWithRoom = function (roomName) {
  state.editingItemId = null;
  switchPage('add');
  setAddCaptureMode('form');
  setTimeout(() => {
    const roomSelect = document.getElementById('add-item-room');
    if (roomSelect) roomSelect.value = roomName;
  }, 100);
};

window.closeQuickAddModal = function () {
  switchPage('home');
};

function initAddView() {
  populateTourSelect();
  populateDetailedAddForm(state.editingItemId ? state.items.find((i) => i.id === state.editingItemId) : null);
  if (!state.editingItemId) {
    clearPhotoPreview();
    const voiceInput = document.getElementById('voice-nlp-input');
    if (voiceInput) voiceInput.value = '';
    const clearBtn = document.getElementById('btn-voice-input-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    const notice = document.getElementById('voice-autofill-notice');
    if (notice) notice.classList.add('hidden');
  }
  const formSection = document.getElementById('add-panel-form');
  if (formSection) formSection.classList.remove('hidden');
  safeCreateIcons();
}

window.setAddCaptureMode = function (mode) {
  state.addCaptureMode = mode;
  safeCreateIcons();
};

let voiceRecognitionInstance = null;
let voiceSilenceTimer = null;
let voiceFinalBuffer = '';
let voiceManualStop = false;

window.toggleVoiceRecognition = function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice recognition not supported on this browser. Type below!');
    const input = document.getElementById('voice-nlp-input');
    if (input) input.focus();
    return;
  }

  const btn = document.getElementById('btn-voice-record');
  const label = document.getElementById('voice-record-label');
  const input = document.getElementById('voice-nlp-input');

  const clearSilenceTimer = () => {
    if (voiceSilenceTimer) {
      clearTimeout(voiceSilenceTimer);
      voiceSilenceTimer = null;
    }
  };

  const stopVoiceSession = () => {
    voiceManualStop = true;
    clearSilenceTimer();
    state.isRecordingVoice = false;

    if (voiceRecognitionInstance) {
      try {
        voiceRecognitionInstance.stop();
      } catch (err) {}
    }

    if (btn) btn.classList.remove('recording-pulse');
    if (label) label.textContent = 'Tap microphone to speak';

    if (input && input.value.trim()) {
      voiceFinalBuffer = input.value.trim();
    }
  };

  if (state.isRecordingVoice) {
    stopVoiceSession();
    return;
  }

  voiceManualStop = false;
  voiceFinalBuffer = input && input.value.trim() ? input.value.trim() : '';

  const resetSilenceCountdown = () => {
    clearSilenceTimer();
    voiceSilenceTimer = setTimeout(() => {
      stopVoiceSession();
    }, 3000);
  };

  const initRecognition = () => {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = function () {
      state.isRecordingVoice = true;
      if (btn) btn.classList.add('recording-pulse');
      if (label) label.textContent = 'Listening... (waits 3s silence)';
      resetSilenceCountdown();
    };

    recognition.onresult = function (event) {
      resetSilenceCountdown();

      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          voiceFinalBuffer = voiceFinalBuffer ? `${voiceFinalBuffer} ${text.trim()}` : text.trim();
        } else {
          interimChunk += text;
        }
      }

      const fullSpokenText = [voiceFinalBuffer, interimChunk.trim()].filter(Boolean).join(' ');
      if (input) {
        input.value = fullSpokenText;
        handleNlpInputChange(fullSpokenText);
      }
    };

    recognition.onerror = function (e) {
      console.warn('Voice recognition event:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopVoiceSession();
        showToast('Microphone access denied. Please grant permission.');
      }
    };

    recognition.onend = function () {
      if (!voiceManualStop && state.isRecordingVoice) {
        try {
          recognition.start();
        } catch (e) {
          stopVoiceSession();
        }
      } else {
        stopVoiceSession();
      }
    };

    return recognition;
  };

  try {
    voiceRecognitionInstance = initRecognition();
    voiceRecognitionInstance.start();
  } catch (err) {
    console.error('Voice start error:', err);
    stopVoiceSession();
    showToast('Microphone error. You can type directly below.');
  }
};

let currentParsedNlp = null;

function parseSentence(raw) {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();

  text = text.replace(/^(?:i\s+(?:just\s+)?(?:put|placed|stored|kept|left|moved)\s+(?:the|my|a|an)?\s*)/i, '');
  text = text.replace(/^(?:put|place|store|keep|leave)\s+(?:the|my|a|an)?\s*)/i, '');

  const roomKeywords = [
    { match: /master\s+bedroom|bedroom/i, name: 'Master Bedroom' },
    { match: /garage|workshop/i, name: 'Garage & Workshop' },
    { match: /kitchen|pantry/i, name: 'Kitchen & Pantry' },
    { match: /hallway\s+closet|hallway|linen\s+closet|closet/i, name: 'Hallway Closet' },
    { match: /living\s+room/i, name: 'Living Room' },
    { match: /home\s+office|office|study/i, name: 'Home Office' },
    { match: /bathroom/i, name: 'Bathroom' },
    { match: /basement/i, name: 'Basement' },
    { match: /attic/i, name: 'Attic' },
  ];

  state.rooms.forEach((r) => {
    const escaped = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    roomKeywords.unshift({ match: new RegExp(escaped, 'i'), name: r.name });
  });

  let detectedRoom = null;
  let detectedZone = 'Main Storage Shelf';
  let itemName = text;

  for (const rk of roomKeywords) {
    const m = text.match(rk.match);
    if (m) {
      detectedRoom = rk.name;
      const roomIndex = m.index;
      const roomLength = m[0].length;

      let before = text.substring(0, roomIndex).replace(/(?:\s+in|\s+on|\s+at|\s+inside)\s*$/i, '').trim();
      let after = text.substring(roomIndex + roomLength).trim();
      after = after.replace(/^(?:in|on|at|inside|the)\s+/i, '').trim();

      if (before) itemName = before;
      if (after) detectedZone = after;
      break;
    }
  }

  if (!detectedRoom) {
    const splitIn = text.split(/\s+in\s+|\s+on\s+|\s+inside\s+/i);
    if (splitIn.length > 1) {
      itemName = splitIn[0].trim();
      detectedZone = splitIn[1].trim();
      detectedRoom = state.rooms[0]?.name || 'Living Room';
    } else {
      itemName = text;
      detectedRoom = state.rooms[0]?.name || 'Living Room';
      detectedZone = 'Main Shelf';
    }
  }

  itemName = itemName.replace(/^(?:the|my|a|an)\s+/i, '').trim();
  if (!itemName) itemName = 'Stored Belonging';
  itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
  detectedZone = detectedZone.charAt(0).toUpperCase() + detectedZone.slice(1);

  let category = 'Other';
  const lowerItem = itemName.toLowerCase();
  if (lowerItem.match(/passport|document|paper|tax|deed|certificate|card|cash|will|receipt|id|ticket/)) {
    category = 'Documents & Valuables';
  } else if (lowerItem.match(/drill|hammer|saw|screw|wrench|pliers|tape|hardware|tool|ladder|nail|blade/)) {
    category = 'Tools & Hardware';
  } else if (lowerItem.match(/battery|cable|charger|remote|phone|laptop|hdmi|adapter|earbuds|usb|wire/)) {
    category = 'Electronics & Cables';
  } else if (lowerItem.match(/band\s*aid|medicine|pills|first\s*aid|antihistamine|vitamin|syrup|spray/)) {
    category = 'Health & Medication';
  } else if (lowerItem.match(/bulb|soap|towel|cleaner|detergent|filter|foil|bag|sponge|bleach|wipe/)) {
    category = 'Household & Cleaning';
  } else if (lowerItem.match(/coat|gloves|scarf|jacket|umbrella|boots|sweater|blanket|socks/)) {
    category = 'Seasonal & Apparel';
  } else if (lowerItem.match(/pen|paper|stapler|notebook|marker|printer|envelope|folder/)) {
    category = 'Office & Tech';
  }

  return {
    name: itemName,
    room: detectedRoom,
    zone: detectedZone,
    category,
  };
}

window.handleNlpInputChange = function (val) {
  const clearBtn = document.getElementById('btn-voice-input-clear');
  if (clearBtn) {
    if (val && val.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }

  if (!val || val.trim().length < 2) {
    currentParsedNlp = null;
    return;
  }

  const parsed = parseSentence(val);
  currentParsedNlp = parsed;

  if (parsed) {
    const nameInput = document.getElementById('add-item-name');
    const roomSelect = document.getElementById('add-item-room');
    const locInput = document.getElementById('add-item-location-desc');
    const catSelect = document.getElementById('add-item-category');

    if (nameInput) nameInput.value = parsed.name;
    if (locInput) locInput.value = parsed.zone;
    if (catSelect && parsed.category) catSelect.value = parsed.category;
    if (roomSelect && parsed.room) {
      const matchOpt = Array.from(roomSelect.options).find(
        (o) => o.value.toLowerCase() === parsed.room.toLowerCase()
      );
      if (matchOpt) {
        roomSelect.value = matchOpt.value;
      } else {
        const newOpt = document.createElement('option');
        newOpt.value = parsed.room;
        newOpt.textContent = parsed.room;
        newOpt.selected = true;
        roomSelect.appendChild(newOpt);
      }
    }

    const notice = document.getElementById('voice-autofill-notice');
    const noticeText = document.getElementById('voice-autofill-text');
    if (notice && noticeText) {
      notice.classList.remove('hidden');
      noticeText.innerHTML = `Heard: <strong>&ldquo;${escapeHtml(val)}&rdquo;</strong> → Form filled below! Review or edit.`;
    }
  }
};

window.clearVoiceInputOnly = function () {
  const input = document.getElementById('voice-nlp-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btn-voice-input-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
};

window.dismissVoiceNotice = function () {
  const notice = document.getElementById('voice-autofill-notice');
  if (notice) notice.classList.add('hidden');
};

window.toggleTourModeSection = function () {
  const panel = document.getElementById('add-panel-tour');
  if (panel) {
    panel.classList.toggle('hidden');
  }
};

window.discardVoiceEntry = function () {
  discardDetailedFormEntry();
};

window.confirmNlpCapture = function () {
  if (!currentParsedNlp) {
    const val = document.getElementById('voice-nlp-input')?.value;
    if (val) currentParsedNlp = parseSentence(val);
  }
  if (!currentParsedNlp) {
    showToast('Please speak or type what you put away first.');
    return;
  }

  const now = new Date().toISOString();
  const newItem = {
    id: `item-${Date.now()}`,
    name: currentParsedNlp.name,
    category: currentParsedNlp.category,
    location: {
      room: currentParsedNlp.room,
      spot: currentParsedNlp.zone,
      zone: currentParsedNlp.zone,
    },
    description: '',
    tags: [currentParsedNlp.name.toLowerCase(), currentParsedNlp.room.toLowerCase()],
    lent: { isLent: false },
    lastVerifiedAt: now,
    createdAt: now,
  };

  state.items = [newItem, ...state.items];
  saveItems();
  handleDailyCheckIn();

  const nlpInput = document.getElementById('voice-nlp-input');
  if (nlpInput) nlpInput.value = '';
  const clearBtn = document.getElementById('btn-voice-input-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  currentParsedNlp = null;

  showToast(`Done · Saved "${newItem.name}" in ${newItem.location.room}!`, 'success');
  switchPage('home');
};

let currentPhotoDataUrl = null;

function populatePhotoSelect() {
  const sel = document.getElementById('photo-room-select');
  if (!sel) return;
  sel.innerHTML = state.rooms
    .map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`)
    .join('');
}

window.handlePhotoUpload = function (event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 600;

      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const compressed = canvas.toDataURL('image/jpeg', 0.72);
      currentPhotoDataUrl = compressed;

      const previewImg = document.getElementById('photo-preview-img');
      const previewContainer = document.getElementById('photo-preview-container');
      if (previewImg) previewImg.src = compressed;
      if (previewContainer) previewContainer.classList.remove('hidden');

      const photoIndicator = document.getElementById('photo-status-indicator');
      if (photoIndicator) {
        photoIndicator.textContent = '✅ Image attached & visible in detailed form below!';
        photoIndicator.className = 'text-xs text-indigo-700 font-bold';
      }
      showToast('Image captured! Attached to form below.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.clearPhotoPreview = function () {
  currentPhotoDataUrl = null;
  const previewContainer = document.getElementById('photo-preview-container');
  if (previewContainer) previewContainer.classList.add('hidden');
  const fileInput = document.getElementById('photo-file-input');
  if (fileInput) fileInput.value = '';
  const photoIndicator = document.getElementById('photo-status-indicator');
  if (photoIndicator) {
    photoIndicator.textContent = 'Optional • Visible in detailed form once captured';
    photoIndicator.className = 'text-xs text-stone-500 italic';
  }
};

window.discardPhotoEntry = function () {
  discardDetailedFormEntry();
};

window.savePhotoClueItem = function () {
  if (!currentPhotoDataUrl) {
    showToast('Please take or choose a photo first!');
    return;
  }

  const room = document.getElementById('photo-room-select')?.value || state.rooms[0]?.name || 'Living Room';
  const customName = document.getElementById('photo-item-name')?.value.trim();
  const name = customName || `Photo Memory Clue (${room})`;

  const now = new Date().toISOString();
  const newItem = {
    id: `item-${Date.now()}`,
    name,
    category: 'Household & Cleaning',
    photoUrl: currentPhotoDataUrl,
    location: {
      room,
      spot: 'Visual Photo Area',
      zone: 'Visual Photo Area',
    },
    description: 'Visual shelf / box memory clue.',
    tags: ['photo', 'clue', room.toLowerCase()],
    lent: { isLent: false },
    lastVerifiedAt: now,
    createdAt: now,
  };

  state.items = [newItem, ...state.items];
  saveItems();
  handleDailyCheckIn();

  clearPhotoPreview();
  const nameInput = document.getElementById('photo-item-name');
  if (nameInput) nameInput.value = '';

  showToast(`Done · Saved photo clue for ${room}!`, 'success');
  switchPage('home');
};

let tourRecognitionInstance = null;

function populateTourSelect() {
  const sel = document.getElementById('tour-room-select');
  if (!sel) return;
  sel.innerHTML = state.rooms
    .map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`)
    .join('');
}

window.toggleTourVoice = function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Speech recognition not available. Please type items separated by commas.');
    return;
  }

  const label = document.getElementById('tour-voice-label');
  const btn = document.getElementById('btn-tour-voice');

  if (state.isRecordingTour && tourRecognitionInstance) {
    tourRecognitionInstance.stop();
    state.isRecordingTour = false;
    if (btn) btn.classList.remove('recording-pulse');
    if (label) label.textContent = 'Speak items';
    return;
  }

  try {
    tourRecognitionInstance = new SpeechRecognition();
    tourRecognitionInstance.continuous = true;
    tourRecognitionInstance.interimResults = false;
    tourRecognitionInstance.lang = 'en-US';

    tourRecognitionInstance.onstart = function () {
      state.isRecordingTour = true;
      if (btn) btn.classList.add('recording-pulse');
      if (label) label.textContent = 'Listening... Say items!';
    };

    tourRecognitionInstance.onresult = function (event) {
      const newWords = [];
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          newWords.push(event.results[i][0].transcript);
        }
      }
      if (newWords.length > 0) {
        const textarea = document.getElementById('tour-items-input');
        if (textarea) {
          const existing = textarea.value.trim();
          const joined = newWords.join(', ');
          textarea.value = existing ? `${existing}, ${joined}` : joined;
          handleTourInputChange(textarea.value);
        }
      }
    };

    tourRecognitionInstance.onend = function () {
      state.isRecordingTour = false;
      if (btn) btn.classList.remove('recording-pulse');
      if (label) label.textContent = 'Speak items';
    };

    tourRecognitionInstance.start();
  } catch (e) {
    console.error('Tour voice error:', e);
    state.isRecordingTour = false;
    showToast('Could not start microphone. You can type items with commas.');
  }
};

window.handleTourInputChange = function (val) {
  const badgesContainer = document.getElementById('tour-preview-badges');
  const labelBtn = document.getElementById('btn-save-tour-label');

  const items = val
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  state.activeTourItems = items;

  if (badgesContainer) {
    badgesContainer.innerHTML = items
      .map(
        (item) =>
          `<span class="px-3 py-1 bg-emerald-100 text-emerald-950 font-bold text-xs rounded-xl border border-emerald-300 shadow-xs">${escapeHtml(
            item
          )}</span>`
      )
      .join('');
  }

  if (labelBtn) {
    labelBtn.textContent =
      items.length > 0
        ? `Add ${items.length} Items to Room in 1 Tap`
        : 'Add Items in Tour';
  }
};

window.saveBulkTourItems = function () {
  const room = document.getElementById('tour-room-select')?.value || state.rooms[0]?.name || 'Living Room';
  const locationSpot = document.getElementById('tour-zone-input')?.value.trim() || 'Room Shelf / Drawer';
  const rawItems = state.activeTourItems;

  if (!rawItems || rawItems.length === 0) {
    showToast('Please speak or type at least one item to catalog.');
    return;
  }

  const now = new Date().toISOString();
  const newItems = rawItems.map((rawName, idx) => {
    const cleaned = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    return {
      id: `item-${Date.now()}-${idx}`,
      name: cleaned,
      category: inferCategoryFromName(cleaned),
      location: {
        room,
        spot: locationSpot,
        zone: locationSpot,
      },
      description: `Batch cataloged in ${room}`,
      tags: [cleaned.toLowerCase(), room.toLowerCase()],
      lent: { isLent: false },
      lastVerifiedAt: now,
      createdAt: now,
    };
  });

  state.items = [...newItems, ...state.items];
  saveItems();
  handleDailyCheckIn();

  const textarea = document.getElementById('tour-items-input');
  if (textarea) textarea.value = '';
  const badges = document.getElementById('tour-preview-badges');
  if (badges) badges.innerHTML = '';
  state.activeTourItems = [];

  showToast(`Done · Added ${newItems.length} items to ${room}!`, 'success');
  switchPage('home');
};

window.discardTourEntry = function () {
  const textarea = document.getElementById('tour-items-input');
  if (textarea) textarea.value = '';
  const zoneInput = document.getElementById('tour-zone-input');
  if (zoneInput) zoneInput.value = '';
  const badges = document.getElementById('tour-preview-badges');
  if (badges) badges.innerHTML = '';
  state.activeTourItems = [];
  const labelBtn = document.getElementById('btn-save-tour-label');
  if (labelBtn) labelBtn.textContent = 'Add Items in Tour';

  if (state.isRecordingTour && tourRecognitionInstance) {
    try {
      tourRecognitionInstance.stop();
    } catch (e) {}
    state.isRecordingTour = false;
    const btn = document.getElementById('btn-tour-voice');
    if (btn) btn.classList.remove('recording-pulse');
    const label = document.getElementById('tour-voice-label');
    if (label) label.textContent = 'Speak items';
  }

  showToast('Tour entry discarded');
};

function inferCategoryFromName(name) {
  const l = name.toLowerCase();
  if (l.match(/drill|hammer|saw|screw|wrench|pliers|tape|hardware|tool|ladder|nail|blade|knife/)) return 'Tools & Hardware';
  if (l.match(/passport|document|paper|tax|deed|certificate|card|cash|will|receipt|id/)) return 'Documents & Valuables';
  if (l.match(/battery|cable|charger|remote|phone|laptop|hdmi|adapter|earbuds|usb|wire/)) return 'Electronics & Cables';
  if (l.match(/band\s*aid|medicine|pills|first\s*aid|antihistamine|vitamin|syrup|spray|drops/)) return 'Health & Medication';
  if (l.match(/bulb|soap|towel|cleaner|detergent|filter|foil|bag|sponge|bleach|wipe/)) return 'Household & Cleaning';
  if (l.match(/coat|gloves|scarf|jacket|umbrella|boots|sweater|blanket|socks/)) return 'Seasonal & Apparel';
  if (l.match(/pen|paper|stapler|notebook|marker|printer|envelope|folder/)) return 'Office & Tech';
  return 'Other';
}

window.editItem = function (id) {
  state.editingItemId = id;
  switchPage('add');
  setAddCaptureMode('form');
  populateDetailedAddForm(state.items.find((i) => i.id === id));
};

function populateDetailedAddForm(editingItem) {
  const addTitle = document.getElementById('add-view-title');
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
    if (addTitle) addTitle.textContent = `Edit "${editingItem.name}"`;
    document.getElementById('add-item-name').value = editingItem.name;
    document.getElementById('add-item-category').value = editingItem.category;
    document.getElementById('add-item-room').value = editingItem.location.room;
    const locInput = document.getElementById('add-item-location-desc');
    if (locInput) {
      locInput.value = editingItem.location.spot || editingItem.location.zone || getItemLocationText(editingItem);
    }
    document.getElementById('add-item-desc').value = editingItem.description || '';
    document.getElementById('add-item-tags').value = (editingItem.tags || []).join(', ');

    const isConsumable = !!editingItem.consumable?.isConsumable;
    document.getElementById('add-item-consumable-toggle').checked = isConsumable;
    document.getElementById('consumable-fields').style.display = isConsumable ? 'grid' : 'none';
    if (isConsumable) {
      document.getElementById('add-item-quantity').value = editingItem.consumable.quantity || 1;
      document.getElementById('add-item-unit').value = editingItem.consumable.unit || 'items';
      document.getElementById('add-item-threshold').value = editingItem.consumable.minThreshold || 1;
    }

    const isLent = !!editingItem.lent?.isLent;
    document.getElementById('add-item-lent-toggle').checked = isLent;
    document.getElementById('lent-fields').style.display = isLent ? 'grid' : 'none';
    if (isLent) {
      document.getElementById('add-item-lent-to').value = editingItem.lent.lentTo || '';
      document.getElementById('add-item-expected-return').value = editingItem.lent.expectedReturn || '';
    } else {
      document.getElementById('add-item-lent-to').value = '';
      document.getElementById('add-item-expected-return').value = '';
    }

    if (editingItem.photoUrl) {
      currentPhotoDataUrl = editingItem.photoUrl;
      const previewImg = document.getElementById('photo-preview-img');
      const previewContainer = document.getElementById('photo-preview-container');
      if (previewImg) previewImg.src = editingItem.photoUrl;
      if (previewContainer) previewContainer.classList.remove('hidden');
      const photoIndicator = document.getElementById('photo-status-indicator');
      if (photoIndicator) {
        photoIndicator.textContent = '✅ Image attached & visible in detailed form below!';
        photoIndicator.className = 'text-xs text-indigo-700 font-bold';
      }
    } else {
      clearPhotoPreview();
    }
  } else {
    if (addTitle) addTitle.textContent = 'Add to Physical Memory';
    if (form) form.reset();
    clearPhotoPreview();
    const consFields = document.getElementById('consumable-fields');
    if (consFields) consFields.style.display = 'none';
    const lentFields = document.getElementById('lent-fields');
    if (lentFields) lentFields.style.display = 'none';
  }
}

window.toggleConsumableInputs = function () {
  const toggle = document.getElementById('add-item-consumable-toggle');
  const isChecked = toggle ? toggle.checked : false;
  const el = document.getElementById('consumable-fields');
  if (el) {
    if (isChecked) {
      el.classList.remove('hidden');
      el.style.display = 'grid';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  }
};

window.toggleLentInputs = function () {
  const toggle = document.getElementById('add-item-lent-toggle');
  const isChecked = toggle ? toggle.checked : false;
  const el = document.getElementById('lent-fields');
  if (el) {
    if (isChecked) {
      el.classList.remove('hidden');
      el.style.display = 'grid';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  }
};

window.handleSaveItemSubmit = function (e) {
  e.preventDefault();

  const name = document.getElementById('add-item-name').value.trim();
  const category = document.getElementById('add-item-category').value;
  const room = document.getElementById('add-item-room').value;
  const spot = (document.getElementById('add-item-location-desc')?.value || '').trim();
  const description = document.getElementById('add-item-desc').value.trim();
  const tagsStr = document.getElementById('add-item-tags').value;
  const isConsumable = document.getElementById('add-item-consumable-toggle').checked;
  const isLent = document.getElementById('add-item-lent-toggle').checked;

  const tags = tagsStr
    ? tagsStr.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  let consumableData = undefined;
  if (isConsumable) {
    const qty = parseInt(document.getElementById('add-item-quantity').value, 10) || 1;
    const unit = document.getElementById('add-item-unit').value.trim() || 'items';
    const thresh = parseInt(document.getElementById('add-item-threshold').value, 10) || 1;
    consumableData = {
      isConsumable: true,
      quantity: qty,
      unit,
      minThreshold: thresh,
    };
  }

  let lentData = { isLent: false };
  if (isLent) {
    const borrower = document.getElementById('add-item-lent-to').value.trim();
    const returnDate = document.getElementById('add-item-expected-return').value;
    lentData = {
      isLent: true,
      lentTo: borrower || 'Someone',
      lentDate: new Date().toISOString().slice(0, 10),
      expectedReturn: returnDate || undefined,
    };
  }

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
          consumable: consumableData,
          lent: lentData,
          photoUrl: currentPhotoDataUrl !== null && currentPhotoDataUrl !== undefined ? currentPhotoDataUrl : item.photoUrl,
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
      photoUrl: currentPhotoDataUrl || null,
      lent: lentData,
      consumable: consumableData,
      lastVerifiedAt: now,
      createdAt: now,
    };
    state.items = [newItem, ...state.items];
    showToast(`Done · Saved "${name}" in ${room}`, 'success');
  }

  clearPhotoPreview();
  clearVoiceInputOnly();
  dismissVoiceNotice();
  const form = document.getElementById('full-add-form');
  if (form) form.reset();

  saveItems();
  handleDailyCheckIn();
  switchPage('home');
};

window.discardDetailedFormEntry = function () {
  try {
    const form = document.getElementById('full-add-form');
    if (form) form.reset();
    state.editingItemId = null;
    clearPhotoPreview();
    clearVoiceInputOnly();
    dismissVoiceNotice();

    if (state.isRecordingVoice && voiceRecognitionInstance) {
      try {
        voiceRecognitionInstance.stop();
      } catch (e) {}
      state.isRecordingVoice = false;
      const btn = document.getElementById('btn-voice-record');
      if (btn) btn.classList.remove('recording-pulse');
      const label = document.getElementById('voice-record-label');
      if (label) label.textContent = 'Tap microphone to speak';
    }

    const tourInput = document.getElementById('tour-items-input');
    if (tourInput) tourInput.value = '';
    const zoneInput = document.getElementById('tour-zone-input');
    if (zoneInput) zoneInput.value = '';
    const badges = document.getElementById('tour-preview-badges');
    if (badges) badges.innerHTML = '';
    state.activeTourItems = [];
    if (state.isRecordingTour && tourRecognitionInstance) {
      try {
        tourRecognitionInstance.stop();
      } catch (e) {}
      state.isRecordingTour = false;
      const tourBtn = document.getElementById('btn-tour-voice');
      if (tourBtn) tourBtn.classList.remove('recording-pulse');
      const tourLabel = document.getElementById('tour-voice-label');
      if (tourLabel) tourLabel.textContent = 'Speak items';
    }

    const consFields = document.getElementById('consumable-fields');
    if (consFields) {
      consFields.style.display = 'none';
      consFields.classList.add('hidden');
    }
    const lentFields = document.getElementById('lent-fields');
    if (lentFields) {
      lentFields.style.display = 'none';
      lentFields.classList.add('hidden');
    }
    showToast('Entry discarded');
  } catch (err) {
    console.warn('Discard cleanup warning:', err);
  } finally {
    switchPage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

window.discardAllAddEntries = function () {
  discardDetailedFormEntry();
};

// -------------------------------------------------------------------------
// SPOT CHECK (15-SECOND MEMORY FLASHCARD)
// -------------------------------------------------------------------------

function initSpotCheckPage() {
  const itemsSortedByAge = [...state.items].sort(
    (a, b) => new Date(a.lastVerifiedAt || 0).getTime() - new Date(b.lastVerifiedAt || 0).getTime()
  );
  state.spotCheckItems = itemsSortedByAge.slice(0, 3);
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
        <button onclick="switchPage('add')" class="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold">Add Item</button>
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
        <p class="text-sm text-stone-600 max-w-xs mx-auto text-center">
          You confirmed your items are right where they belong.
        </p>

        <div class="w-full my-3 p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col items-center justify-center text-center text-stone-500 space-y-1.5 shadow-xs">
          <div class="flex items-center justify-between w-full px-1">
            <span class="text-[10px] font-black uppercase tracking-wider bg-stone-200 text-stone-700 px-2 py-0.5 rounded">Ad</span>
            <span class="text-xs text-stone-400">Sponsored</span>
          </div>
          <p class="text-xs text-stone-700 font-bold">Keep home supplies stocked with doorstep deliveries.</p>
        </div>

        <button
          onclick="switchPage('home')"
          class="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-soft text-center"
        >
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
      <div class="flex items-center justify-center gap-2 text-xs sm:text-sm text-stone-500">
        <span class="font-extrabold">Item ${state.spotCheckCurrentIndex + 1} of ${state.spotCheckItems.length}</span>
      </div>

      <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2 w-full text-center">
        <h4 class="text-lg font-black text-stone-900">${escapeHtml(item.name)}</h4>
        <div class="text-sm text-stone-900 flex items-center justify-center gap-1.5 font-bold">
          <i data-lucide="map-pin" class="w-4 h-4 text-amber-600"></i>
          <span>${escapeHtml(item.location.room)} › ${escapeHtml(getItemLocationText(item))}</span>
        </div>
      </div>

      <p class="text-sm text-stone-800 font-extrabold text-center">Is this still in this spot?</p>

      <div class="grid grid-cols-2 gap-2.5 pt-1 w-full">
        <button
          onclick="confirmSpotCheckItem('${item.id}')"
          class="py-3 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-soft text-center"
        >
          <i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>
          <span>Still there</span>
        </button>
        <button
          onclick="relocateSpotCheckItem('${item.id}')"
          class="py-3 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
        >
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
  editItem(id);
};

window.startQuickVoiceFromHeader = function () {
  switchPage('add');
  setAddCaptureMode('voice');
  setTimeout(() => {
    toggleVoiceRecognition();
  }, 250);
};

window.resetData = function () {
  showConfirmDialog({
    title: 'Reset Demo Data',
    message: 'Reset all items, rooms, and organizing habits back to the starter demo data?',
    confirmText: 'Reset All',
    confirmClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    onConfirm: () => {
      state.items = INITIAL_ITEMS;
      state.rooms = INITIAL_ROOMS;
      state.engagement = {
        streak: 3,
        lastCheckInDate: '',
        totalCheckIns: 5,
        notificationsEnabled: false,
        lastNotificationTimestamp: 0,
      };
      saveItems();
      saveRooms();
      saveEngagement();
      renderApp();
      showToast('Reset to starter items');
    },
  });
};

window.scrollToItemsView = function () {
  const target = document.getElementById('main-content-view');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.scrollToTopView = function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (!state.deferredInstallPrompt) {
    showToast('To install, tap Share (iOS) or Menu (Android) -> "Add to Home Screen"');
    return;
  }
  state.deferredInstallPrompt.prompt();
  state.deferredInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      showToast('Thank you for installing WhereAbouts!');
    }
    state.deferredInstallPrompt = null;
    const installBtn = document.getElementById('btn-pwa-install');
    if (installBtn) installBtn.classList.add('hidden');
  });
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration:', err);
    });
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

  document.addEventListener(
    'touchend',
    (e) => {
      const btn = e.target.closest('button, [role="button"], .nav-tab-btn, label[for]');
      if (!btn) return;
      btn.style.opacity = '0.75';
      setTimeout(() => {
        btn.style.opacity = '';
      }, 120);
    },
    { passive: true }
  );

  switchPage('home');
});
