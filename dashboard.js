// dashboard.js - FULL UPDATED VERSION (USER DASHBOARD)

// ===============================
// Global State
// ===============================
let currentUser = null;
let dashboardComplaintCache = [];
let activeDashboardComplaintFilter = 'all';

// Backend API base URL used for uploads and AI requests.
// Local runs use the Express server on port 5000; deployed runs use the hosted backend.
const API_BASE_URL = (() => {
    const override = window.API_BASE_URL || window.__API_BASE_URL__;
    if (override) return override.replace(/\/$/, '');

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:5000';
    }

    return 'https://smart-public-complaints-backend.onrender.com';
})();
window.API_BASE_URL = API_BASE_URL;
window.__API_BASE_URL__ = API_BASE_URL;

// ===============================
// Cloudinary Upload Function
// ===============================
async function uploadToCloudinary(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload failed: ' + response.statusText);
        }
        
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

// ===============================
// Helper Functions
// ===============================
function showError(msg) {
    console.error("ERROR:", msg);
    alert("Error: " + msg);
}

// ===============================
// Mobile sidebar toggle (responsive)
// ===============================
function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    const overlayId = 'mobileOverlay';
    const existing = document.getElementById(overlayId);
    const willOpen = !sb.classList.contains('open');

    sb.classList.toggle('open');

    if (willOpen) {
        // create overlay
        if (!existing) {
            const ov = document.createElement('div');
            ov.id = overlayId;
            ov.className = 'mobile-overlay visible';
            ov.onclick = () => toggleSidebar();
            document.body.appendChild(ov);
        } else {
            existing.classList.add('visible');
        }
        // prevent body scroll
        document.body.style.overflow = 'hidden';
    } else {
        if (existing) existing.classList.remove('visible');
        // remove overlay after transition
        setTimeout(() => {
            const el = document.getElementById(overlayId);
            if (el) el.remove();
        }, 300);
        document.body.style.overflow = '';
    }
}

// Close sidebar when clicking outside on small screens
document.addEventListener('click', (e) => {
    try {
        if (window.innerWidth > 768) return;
        const sb = document.querySelector('.sidebar');
        const btn = document.getElementById('mobileMenuBtn');
        if (!sb || !sb.classList.contains('open')) return;
        if (btn && (e.target === btn || btn.contains(e.target))) return;
        if (!sb.contains(e.target)) sb.classList.remove('open');
    } catch (err) {
        // ignore
    }
});

function showSuccess(msg) {
    console.log("SUCCESS:", msg);
    alert(msg);
}

function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ===============================
// Navigation / Tabs
// ===============================
function switchTab(tabName, navItem) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (navItem) navItem.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Load tab-specific content
    if (tabName === 'analytics') {
        setTimeout(() => loadUserAnalytics(), 100);
    } else if (tabName === 'help') {
        setTimeout(() => loadHelpCenter(), 100);
    } else if (tabName === 'settings') {
        setTimeout(() => loadUserSettings(), 100);
    } else if (tabName === 'ai-insights') {
        setTimeout(() => loadChatHistory(), 100);
    } else if (tabName === 'my-challan-complaints') {
        setTimeout(() => loadMyChallanComplaints(), 100);
    }
}

// ===============================
// Complaint Card UI
// ===============================
function createComplaintElement(id, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'complaint-item';
    wrapper.dataset.status = (data.status || 'pending').toLowerCase();

    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const status = (data.status || 'pending').toLowerCase();

    // Compact thumbnail images (max 3 shown)
    let mediaHTML = '';
    if (data.media && Array.isArray(data.media) && data.media.length > 0) {
        const images = data.media.filter(m => m.type === 'image').slice(0, 3);
        const extra  = data.media.filter(m => m.type === 'image').length - 3;
        if (images.length > 0) {
            mediaHTML = `<div class="complaint-thumb">
                ${images.map(m => `<img class="complaint-thumb-img" src="${m.url}" alt="img" onclick="window.open('${m.url}','_blank')">`).join('')}
                ${extra > 0 ? `<div class="complaint-thumb-more" onclick="window.open('${data.media[3]?.url || '#'}','_blank')">+${extra} more</div>` : ''}
            </div>`;
        }
    }

    const categoryDisplay = data.subCategory
        ? `${data.category || 'General'} › ${data.subCategory}`
        : data.category || 'General';

    const statusColors = {
        pending: '#00d4ff', 'in-progress': '#fb5607', resolved: '#3a86ff', rejected: '#d62828'
    };
    const sColor = statusColors[status] || '#666';

    // Rejection reason block
    const rejectionHTML = (status === 'rejected' && data.rejectionReason)
        ? `<div class="rejection-reason-banner">
                <div class="rejection-reason-label">❌ Rejection Reason</div>
                <div class="rejection-reason-text">${data.rejectionReason}</div>
           </div>`
        : '';

    wrapper.innerHTML = `
        <div style="width:100%;">
            <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;align-items:center;">
                <span style="color:#00d4ff;font-weight:700;font-size:13px;">#${id.slice(0,6).toUpperCase()}</span>
                <span style="font-size:11px;background:rgba(0,212,255,.15);padding:2px 8px;border-radius:10px;" title="${categoryDisplay}">${categoryDisplay.length > 28 ? categoryDisplay.substring(0,28)+'…' : categoryDisplay}</span>
                <span style="font-size:11px;background:${sColor}20;color:${sColor};padding:2px 8px;border-radius:10px;font-weight:600;border:1px solid ${sColor}40;text-transform:uppercase;margin-left:auto;">${status.replace('-',' ')}</span>
            </div>
            <div class="complaint-title">${data.title || '(No title)'}</div>
            <div class="complaint-desc">${data.description || ''}</div>
            ${mediaHTML}
            ${rejectionHTML}
            <div class="complaint-meta" style="margin-top:8px;">
                📍 ${data.location || 'N/A'} &nbsp;·&nbsp; 🕒 ${timeAgo(ts)}
            </div>
        </div>
    `;
    return wrapper;
}

function normalizeComplaintStatus(status) {
    const value = (status || 'pending').toLowerCase();
    if (value === 'open') return 'pending';
    return value;
}

function getDashboardComplaintBucket(data) {
    const status = normalizeComplaintStatus(data.status);
    if (status === 'resolved') return 'resolved';
    if (status === 'in-progress') return 'in-progress';
    return 'pending';
}

function renderDashboardComplaintFilterSummary() {
    const summary = document.getElementById('dashboardFilterSummary');
    const total = dashboardComplaintCache.length;
    const current = activeDashboardComplaintFilter;

    if (!summary) return;

    const labelMap = {
        all: 'All complaints',
        pending: 'Pending complaints',
        'in-progress': 'In progress complaints',
        resolved: 'Resolved complaints',
    };

    summary.textContent = `${labelMap[current] || 'All complaints'} · ${total} total`;
}

function setDashboardComplaintFilter(status, sourceEl) {
    activeDashboardComplaintFilter = status;

    document.querySelectorAll('.stat-card[data-filter]').forEach(card => {
        card.classList.toggle('is-active', card.dataset.filter === status);
        card.setAttribute('aria-pressed', card.dataset.filter === status ? 'true' : 'false');
    });

    document.querySelectorAll('#dashboardStatusFilters .filter-btn').forEach(btn => {
        const btnStatus = btn.dataset.status || 'all';
        btn.classList.toggle('active', btnStatus === status || (status === 'pending' && btnStatus === 'open'));
    });

    renderDashboardComplaintList();
    renderDashboardComplaintFilterSummary();

    if (sourceEl && typeof sourceEl.scrollIntoView === 'function') {
        sourceEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderDashboardComplaintList() {
    const el = document.getElementById('recentComplaintsList');
    if (!el) return;

    const filteredDocs = dashboardComplaintCache.filter(doc => {
        const bucket = getDashboardComplaintBucket(doc);
        if (activeDashboardComplaintFilter === 'all') return true;
        return bucket === activeDashboardComplaintFilter;
    });

    if (!filteredDocs.length) {
        el.innerHTML = `<p style="color:var(--text-secondary);padding:16px 0;">No complaints found for this filter.</p>`;
        return;
    }

    el.innerHTML = '';
    filteredDocs.forEach(doc => {
        el.appendChild(createComplaintElement(doc.id, doc));
    });
}

// ===============================
// USER DASHBOARD STATS (USER ONLY)
// ===============================
function loadComplaintStats() {
    const grid = document.querySelector('.stats-grid');
    if (!grid || !window.firebaseDB || !currentUser) return;

    grid.innerHTML = '<p style="padding:20px;">Loading stats…</p>';

    firebaseDB
        .collection('complaints')
        .where('authorId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            let total = 0;
            let pending = 0;
            let inProgress = 0;
            let resolved = 0;

            dashboardComplaintCache = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.complaintType === 'challan') return; // Ignore challans in general stats

                dashboardComplaintCache.push({ id: doc.id, ...data });
                total++;
                const s = normalizeComplaintStatus(data.status);
                if (s === 'resolved') resolved++;
                else if (s === 'in-progress') inProgress++;
                else pending++;
            });

            dashboardComplaintCache.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });

            const rate = total ? Math.round((resolved / total) * 100) : 0;

            grid.innerHTML = `
                <div class="stat-card" data-filter="all" role="button" tabindex="0" aria-pressed="${activeDashboardComplaintFilter === 'all'}">
                    <div class="stat-label">📤 Total</div>
                    <div class="stat-value">${total}</div>
                </div>
                <div class="stat-card" data-filter="pending" role="button" tabindex="0" aria-pressed="${activeDashboardComplaintFilter === 'pending'}">
                    <div class="stat-label">⏳ Pending</div>
                    <div class="stat-value">${pending}</div>
                </div>
                <div class="stat-card" data-filter="in-progress" role="button" tabindex="0" aria-pressed="${activeDashboardComplaintFilter === 'in-progress'}">
                    <div class="stat-label">🛠 In Progress</div>
                    <div class="stat-value">${inProgress}</div>
                </div>
                <div class="stat-card" data-filter="resolved" role="button" tabindex="0" aria-pressed="${activeDashboardComplaintFilter === 'resolved'}">
                    <div class="stat-label">✅ Resolved</div>
                    <div class="stat-value">${resolved}</div>
                    <div class="stat-change">${rate}% success</div>
                </div>
            `;

            grid.querySelectorAll('.stat-card[data-filter]').forEach(card => {
                card.addEventListener('click', () => setDashboardComplaintFilter(card.dataset.filter, card));
                card.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDashboardComplaintFilter(card.dataset.filter, card);
                    }
                });
                card.classList.toggle('is-active', card.dataset.filter === activeDashboardComplaintFilter);
            });

            if (activeDashboardComplaintFilter !== 'all' && !dashboardComplaintCache.some(doc => getDashboardComplaintBucket(doc) === activeDashboardComplaintFilter)) {
                activeDashboardComplaintFilter = 'all';
            }

            renderDashboardComplaintList();
            renderDashboardComplaintFilterSummary();
        }, err => {
            console.error(err);
            grid.innerHTML = '<p style="color:red;padding:20px;">Failed to load stats</p>';
        });
}

// ===============================
// Recent Complaints (USER ONLY – NO INDEX REQUIRED)
// ===============================
function loadRecentComplaints() {
    const el = document.getElementById('recentComplaintsList');
    if (!el || !window.firebaseDB || !currentUser) return;

    el.innerHTML = '<p>Loading recent complaints…</p>';

    firebaseDB
        .collection('complaints')
        .where('authorId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            el.innerHTML = '';

            if (snapshot.empty) {
                el.innerHTML = '<p>No complaints yet.</p>';
                return;
            }
            
            const docs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.complaintType !== 'challan') {
                    docs.push({ id: doc.id, ...data });
                }
            });

            if (!dashboardComplaintCache.length) {
                dashboardComplaintCache = [...docs];
                dashboardComplaintCache.sort((a, b) => {
                    const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                    const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                    return tb - ta;
                });
            }
            
            // Sort manually
            docs.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            
            const recentDocs = docs.slice(0, 5);

            if (activeDashboardComplaintFilter === 'all') {
                el.innerHTML = '';
                recentDocs.forEach(d => {
                    el.appendChild(createComplaintElement(d.id, d));
                });
            } else {
                renderDashboardComplaintList();
                renderDashboardComplaintFilterSummary();
            }
        }, err => {
            console.error(err);
            el.innerHTML = '<p>Error loading recent complaints</p>';
        });
}

// ===============================
// My Complaints (USER ONLY)
// ===============================
function loadMyComplaints() {
    const el = document.getElementById('myComplaintsList');
    if (!el || !window.firebaseDB || !currentUser) {
        el.innerHTML = '<p>Please login again.</p>';
        return;
    }

    el.innerHTML = '<p>Loading your complaints…</p>';

    firebaseDB
        .collection('complaints')
        .where('authorId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            el.innerHTML = '';

            if (snapshot.empty) {
                el.innerHTML = '<p>You have not submitted any complaints.</p>';
                return;
            }

            const docs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.complaintType !== 'challan') {
                    docs.push({ id: doc.id, ...data });
                }
            });

            // Sort manually
            docs.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });

            dashboardComplaintCache = [...docs];

            docs.forEach(d => {
                el.appendChild(createComplaintElement(d.id, d));
            });

            if (activeDashboardComplaintFilter !== 'all') {
                renderDashboardComplaintList();
                renderDashboardComplaintFilterSummary();
            }
        }, err => {
            console.error(err);
            el.innerHTML = '<p>Error loading complaints</p>';
        });
}

// ===============================
// Update Welcome Message with User Name
// ===============================
function updateWelcomeMessage() {
    const welcomeElement = document.getElementById('welcomeMessage');
    if (!welcomeElement || !currentUser || !window.firebaseDB) return;

    // Try to get user's first name from Firestore
    firebaseDB.collection('users').doc(currentUser.uid).get()
        .then(doc => {
                if (doc.exists) {
                const userData = doc.data();
                const firstName = userData.firstName || userData.displayName || '';
                if (firstName) {
                    welcomeElement.textContent = `Welcome ${firstName} 👋`;
                } else {
                    // Fallback to email if no name available
                    const emailName = currentUser.email ? currentUser.email.split('@')[0] : 'User';
                    welcomeElement.textContent = `Welcome ${emailName} 👋`;
                }
            } else {
                // Fallback if user document doesn't exist
                const emailName = currentUser.email ? currentUser.email.split('@')[0] : 'User';
                welcomeElement.textContent = `Welcome ${emailName} 👋`;
            }
        })
        .catch(err => {
            console.error('Error loading user name:', err);
            // Fallback on error
            const emailName = currentUser.email ? currentUser.email.split('@')[0] : 'User';
            welcomeElement.textContent = `Welcome ${emailName} 👋`;
        });
}

// ===============================
// Geolocation Functions
// ===============================
let currentGeolocation = null;

function getUserLocation() {
    const btn = document.getElementById('getLocationBtn');
    const statusDiv = document.getElementById('locationStatus');
    const geolocationInput = document.getElementById('geolocation');

    if (!navigator.geolocation) {
        statusDiv.style.display = 'block';
        statusDiv.textContent = '❌ Geolocation is not supported by your browser';
        statusDiv.style.color = '#d62828';
        showError('Geolocation is not supported by your browser');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Getting location...';
    statusDiv.style.display = 'block';
    statusDiv.textContent = '📍 Requesting location permission...';
    statusDiv.style.color = 'var(--text-secondary)';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            currentGeolocation = {
                latitude: lat,
                longitude: lng,
                accuracy: position.coords.accuracy || null
            };

            geolocationInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            statusDiv.textContent = `✅ Location captured! Accuracy: ${Math.round(position.coords.accuracy || 0)}m`;
            statusDiv.style.color = '#3a86ff';
            btn.disabled = false;
            btn.textContent = '📍 Get My Location';
        },
        (error) => {
            let errorMsg = 'Failed to get location';
            let showAlert = false;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'Location permission denied. Please enable location access in your browser settings and try again.';
                    showAlert = true; // Permission denied is important to alert
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'Location information unavailable. Please check your GPS/network connection and try again.';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'Location request timed out. Please try again or enter location manually.';
                    break;
            }
            
            statusDiv.textContent = `❌ ${errorMsg}`;
            statusDiv.style.color = '#d62828';
            btn.disabled = false;
            btn.textContent = '📍 Get My Location';
            
            // Only show alert for permission denied, not for timeout
            if (showAlert) {
                showError(errorMsg);
            }
        },
        {
            enableHighAccuracy: false, // Changed to false to reduce timeout issues
            timeout: 20000, // Increased to 20 seconds
            maximumAge: 60000 // Allow cached position up to 1 minute old
        }
    );
}

// ===============================
// Category Sub-Categories Mapping
// ===============================
const categorySubCategories = {
    'Road Damage': [
        'Pothole',
        'Crack in Road',
        'Broken Asphalt',
        'Sinkhole',
        'Road Marking Faded',
        'Speed Bump Damaged',
        'Road Shoulder Eroded',
        'Debris on Road',
        'Uneven Road Surface',
        'Other Road Damage'
    ],
    'Water Supply': [
        'No Water Supply',
        'Low Water Pressure',
        'Water Leakage',
        'Dirty/Contaminated Water',
        'Water Quality Issue',
        'Broken Water Pipe',
        'Water Supply Interruption',
        'Overflowing Water Tank',
        'Water Meter Issue',
        'Other Water Supply Issue'
    ],
    'Streetlight': [
        'Light Not Working',
        'Flickering Light',
        'Broken Bulb',
        'Missing Streetlight',
        'Light Always On',
        'Damaged Light Pole',
        'Insufficient Lighting',
        'Light Cover Broken',
        'Wiring Issue',
        'Other Streetlight Issue'
    ],
    'Garbage Disposal': [
        'Overflowing Garbage Bin',
        'No Garbage Collection',
        'Illegal Dump Site',
        'Garbage Bin Missing',
        'Garbage Bin Damaged',
        'Garbage Not Collected on Time',
        'Animal Scattering Garbage',
        'Garbage Truck Issue',
        'Recycling Bin Issue',
        'Other Garbage Disposal Issue'
    ],
    'Noise Pollution': [
        'Construction Noise',
        'Loud Music/Sound System',
        'Traffic Noise',
        'Industrial Noise',
        'Neighbor Noise',
        'Vehicle Horn Noise',
        'Event/Party Noise',
        'Machinery Noise',
        'Animal Noise',
        'Other Noise Pollution'
    ],
    'Drainage': [
        'Blocked Drain',
        'Drain Overflow',
        'Flooding',
        'Clogged Sewer',
        'Drain Cover Missing',
        'Drain Cover Broken',
        'Waterlogging',
        'Drainage System Not Working',
        'Sewer Smell',
        'Other Drainage Issue'
    ]
};

// ===============================
// Category Change Handler
// ===============================
function handleCategoryChange() {
    const categorySelect = document.getElementById('category');
    const selectedCategory = categorySelect.value;
    const subCategoryContainer = document.getElementById('subCategoryContainer');
    const subCategorySelect = document.getElementById('subCategory');
    const otherInputDiv = document.getElementById('otherCategoryInput');
    const otherInput = document.getElementById('otherCategoryText');
    
    // Reset sub-category
    subCategorySelect.innerHTML = '<option value="">Select Problem Type</option>';
    subCategorySelect.value = '';
    
    if (selectedCategory === 'Other') {
        subCategoryContainer.style.display = 'none';
        otherInputDiv.style.display = 'block';
        otherInput.focus();
    } else if (selectedCategory && categorySubCategories[selectedCategory]) {
        // Show sub-category dropdown
        subCategoryContainer.style.display = 'block';
        otherInputDiv.style.display = 'none';
        otherInput.value = '';
        
        // Populate sub-categories
        const subCategories = categorySubCategories[selectedCategory];
        subCategories.forEach(subCat => {
            const option = document.createElement('option');
            option.value = subCat;
            option.textContent = subCat;
            subCategorySelect.appendChild(option);
        });
    } else {
        // No category selected
        subCategoryContainer.style.display = 'none';
        otherInputDiv.style.display = 'none';
        otherInput.value = '';
    }

    // update priority when category/sub-category changes
    try { updatePriorityFromInputs(); } catch(e) { /* ignore */ }
}

// ===============================
// Priority auto-selection logic
// ===============================
const priorityOrder = ['Low','Medium','High','Critical'];

const subCategoryPriorityOverrides = {
    'Sinkhole': 'Critical',
    'Flooding': 'Critical',
    'No Water Supply': 'High',
    'Water Leakage': 'High',
    'Blocked Drain': 'High',
    'Drain Overflow': 'High',
    'Light Not Working': 'Low',
    'Pothole': 'Medium',
    'Overflowing Garbage Bin': 'Medium',
    'Illegal Dump Site': 'Medium',
    'Construction Noise': 'Low'
};

function severityRank(level) {
    const idx = priorityOrder.indexOf(level);
    return idx === -1 ? 0 : idx;
}

function higherSeverity(a, b) {
    return severityRank(a) >= severityRank(b) ? a : b;
}

function computePriorityFromInputs() {
    const subCategory = (document.getElementById('subCategory')?.value || '').trim();
    const category = (document.getElementById('category')?.value || '').trim();
    const affectedRaw = document.getElementById('affected')?.value || '';
    const affected = Number(affectedRaw) || 0;

    // base priority from affected people thresholds
    let base = 'Low';
    if (affected >= 50) base = 'Critical';
    else if (affected >= 10) base = 'High';
    else if (affected >= 3) base = 'Medium';

    // override from sub-category if present
    let override = null;
    if (subCategory && subCategoryPriorityOverrides[subCategory]) {
        override = subCategoryPriorityOverrides[subCategory];
    }

    // fallback overrides by category
    const categoryDefaults = {
        'Road Damage': 'Medium',
        'Water Supply': 'High',
        'Streetlight': 'Low',
        'Garbage Disposal': 'Medium',
        'Noise Pollution': 'Low',
        'Drainage': 'High'
    };
    const catDefault = categoryDefaults[category] || null;

    // decide final priority: take the highest severity among base, override, category default
    let final = base;
    if (override) final = higherSeverity(final, override);
    if (catDefault) final = higherSeverity(final, catDefault);

    return final;
}

function setPrioritySelect(value) {
    const sel = document.getElementById('priority');
    if (!sel) return;
    // only set if value exists in options
    const opt = Array.from(sel.options).find(o => o.value === value);
    if (opt) sel.value = value;
}

function updatePriorityFromInputs() {
    const p = computePriorityFromInputs();
    setPrioritySelect(p);
}

// Attach listeners so priority updates as user types/selects
document.addEventListener('DOMContentLoaded', () => {
    const sub = document.getElementById('subCategory');
    const cat = document.getElementById('category');
    const aff = document.getElementById('affected');

    if (sub) sub.addEventListener('change', updatePriorityFromInputs);
    if (cat) cat.addEventListener('change', updatePriorityFromInputs);
    if (aff) aff.addEventListener('input', updatePriorityFromInputs);
});

// ===============================
// AI Category Suggestion
// ===============================
let suggestedCategory = null;

async function suggestCategoryFromDescription() {
    const description = document.getElementById('description').value.trim();
    const suggestionDiv = document.getElementById('categorySuggestion');
    const suggestedText = document.getElementById('suggestedCategoryText');
    
    if (description.length < 20) {
        suggestionDiv.style.display = 'none';
        return;
    }
    
    // Simple keyword-based category suggestion (can be enhanced with AI API)
    const categories = {
        'Road Damage': ['road', 'pothole', 'crack', 'asphalt', 'street', 'pavement', 'damage', 'broken'],
        'Water Supply': ['water', 'supply', 'leak', 'pipe', 'dripping', 'no water', 'pressure', 'tap'],
        'Streetlight': ['light', 'streetlight', 'lamp', 'dark', 'bulb', 'out', 'broken', 'flickering'],
        'Garbage Disposal': ['garbage', 'trash', 'waste', 'bin', 'dump', 'rubbish', 'collection', 'overflow'],
        'Noise Pollution': ['noise', 'loud', 'sound', 'music', 'construction', 'disturbance', 'annoying'],
        'Drainage': ['drain', 'drainage', 'water', 'flood', 'blocked', 'clogged', 'sewer', 'overflow']
    };
    
    const lowerDesc = description.toLowerCase();
    let bestMatch = null;
    let maxMatches = 0;
    
    for (const [cat, keywords] of Object.entries(categories)) {
        const matches = keywords.filter(kw => lowerDesc.includes(kw)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = cat;
        }
    }
    
    if (bestMatch && maxMatches > 0) {
        suggestedCategory = bestMatch;
        suggestedText.textContent = `Suggested category: "${bestMatch}"`;
        suggestionDiv.style.display = 'flex';
    } else {
        suggestionDiv.style.display = 'none';
        suggestedCategory = null;
    }
}

function applySuggestedCategory() {
    if (suggestedCategory) {
        const categorySelect = document.getElementById('category');
        categorySelect.value = suggestedCategory;
        handleCategoryChange();
        document.getElementById('categorySuggestion').style.display = 'none';
        
        // Try to suggest sub-category based on description
        const description = document.getElementById('description').value.toLowerCase();
        if (subCategories[suggestedCategory]) {
            const subCats = subCategories[suggestedCategory];
            // Find best matching sub-category
            let bestMatch = null;
            let maxMatches = 0;
            
            subCats.forEach(subCat => {
                const keywords = subCat.toLowerCase().split(' ');
                const matches = keywords.filter(kw => description.includes(kw)).length;
                if (matches > maxMatches) {
                    maxMatches = matches;
                    bestMatch = subCat;
                }
            });
            
            if (bestMatch && maxMatches > 0) {
                setTimeout(() => {
                    const subCategorySelect = document.getElementById('subCategory');
                    subCategorySelect.value = bestMatch;
                }, 100);
            }
        }
        
        showSuccess(`Category set to "${suggestedCategory}"`);
    }
}

// ===============================
// Media Upload Handler
// ===============================
let uploadedMediaFiles = []; // array of { id: string, file: File }
const uploadTasks = {}; // map fileId -> firebase upload task

function handleMediaUpload(event) {
    const files = Array.from(event.target.files);
    const previewDiv = document.getElementById('mediaPreview');
    
    if (files.length === 0) return;
    
    files.forEach(file => {
        // Validate file size (max 10MB for images, 50MB for videos)
        const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showError(`${file.name} is too large. Max size: ${file.type.startsWith('video/') ? '50MB' : '10MB'}`);
            return;
        }
        
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        uploadedMediaFiles.push({ id: uid, file });
        
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-preview-item';
        mediaItem.dataset.fileId = uid;
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                mediaItem.innerHTML = `
                    <div class="media-preview-content">
                        <img src="${e.target.result}" alt="${file.name}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;">
                        <div class="media-preview-info">
                            <span style="font-size:12px; color:var(--text-secondary);">${file.name}</span>
                            <div style="display:flex; gap:8px;">
                              <button type="button" onclick="replaceMediaFile('${uid}')" style="background:none; border:none; color:var(--primary-light); cursor:pointer; font-size:13px;">Replace</button>
                              <button type="button" onclick="removeMediaFile('${uid}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:18px;">×</button>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:8px;">
                      <div class="progress-bar upload-progress" style="display:none;"><div class="progress-fill" style="width:0%"></div></div>
                      <button type="button" class="upload-cancel-btn" data-file-id="${uid}" onclick="cancelUpload('${uid}')" style="display:none; background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px;">Cancel Upload</button>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                mediaItem.innerHTML = `
                    <div class="media-preview-content">
                        <video src="${e.target.result}" controls style="width:100%; height:150px; object-fit:cover; border-radius:8px;"></video>
                        <div class="media-preview-info">
                            <span style="font-size:12px; color:var(--text-secondary);">${file.name}</span>
                            <div style="display:flex; gap:8px;">
                              <button type="button" onclick="replaceMediaFile('${uid}')" style="background:none; border:none; color:var(--primary-light); cursor:pointer; font-size:13px;">Replace</button>
                              <button type="button" onclick="removeMediaFile('${uid}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:18px;">×</button>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:8px;">
                      <div class="progress-bar upload-progress" style="display:none;"><div class="progress-fill" style="width:0%"></div></div>
                      <button type="button" class="upload-cancel-btn" data-file-id="${uid}" onclick="cancelUpload('${uid}')" style="display:none; background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px;">Cancel Upload</button>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        }
        
        previewDiv.appendChild(mediaItem);
        previewDiv.style.display = 'grid';
        const clearBtn = document.getElementById('clearMediaBtn');
        if (clearBtn) clearBtn.style.display = 'block';
    });
    
    event.target.value = ''; // Reset input
}

function removeMediaFile(fileId) {
    // If there is an active upload task, cancel it first
    if (uploadTasks[fileId]) {
        try { uploadTasks[fileId].cancel(); } catch (e) { /* ignore */ }
        delete uploadTasks[fileId];
    }
    uploadedMediaFiles = uploadedMediaFiles.filter(obj => obj.id !== fileId);
    const item = document.querySelector(`[data-file-id="${fileId}"]`);
    if (item) item.remove();
    
    const previewDiv = document.getElementById('mediaPreview');
    if (uploadedMediaFiles.length === 0) {
        previewDiv.style.display = 'none';
        const clearBtn = document.getElementById('clearMediaBtn');
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

function cancelUpload(fileId) {
    const task = uploadTasks[fileId];
    if (task && typeof task.cancel === 'function') {
        try {
            task.cancel();
        } catch (err) {
            console.error('Failed to cancel upload:', err);
        }
    }
    // remove UI and array entry
    removeMediaFile(fileId);
}

function clearAllMediaUploads() {
    uploadedMediaFiles = [];
    const previewDiv = document.getElementById('mediaPreview');
    if (previewDiv) {
        previewDiv.innerHTML = '';
        previewDiv.style.display = 'none';
    }
    const clearBtn = document.getElementById('clearMediaBtn');
    if (clearBtn) clearBtn.style.display = 'none';
}

// Replace a specific uploaded file (preserve order)
function replaceMediaFile(fileId) {
    const existingIndex = uploadedMediaFiles.findIndex(obj => obj.id === fileId);
    if (existingIndex === -1) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showError(`${file.name} is too large. Max size: ${file.type.startsWith('video/') ? '50MB' : '10MB'}`);
            return;
        }

        // replace in array
        uploadedMediaFiles[existingIndex].file = file;

        // update preview
        const mediaItem = document.querySelector(`[data-file-id="${fileId}"]`);
        if (!mediaItem) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (file.type.startsWith('image/')) {
                mediaItem.querySelector('.media-preview-content').innerHTML = `
                    <img src="${ev.target.result}" alt="${file.name}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;">
                    <div class="media-preview-info">
                        <span style="font-size:12px; color:var(--text-secondary);">${file.name}</span>
                        <div style="display:flex; gap:8px;">
                          <button type="button" onclick="replaceMediaFile('${fileId}')" style="background:none; border:none; color:var(--primary-light); cursor:pointer; font-size:13px;">Replace</button>
                          <button type="button" onclick="removeMediaFile('${fileId}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:18px;">×</button>
                        </div>
                    </div>
                `;
            } else {
                mediaItem.querySelector('.media-preview-content').innerHTML = `
                    <video src="${ev.target.result}" controls style="width:100%; height:150px; object-fit:cover; border-radius:8px;"></video>
                    <div class="media-preview-info">
                        <span style="font-size:12px; color:var(--text-secondary);">${file.name}</span>
                        <div style="display:flex; gap:8px;">
                          <button type="button" onclick="replaceMediaFile('${fileId}')" style="background:none; border:none; color:var(--primary-light); cursor:pointer; font-size:13px;">Replace</button>
                          <button type="button" onclick="removeMediaFile('${fileId}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:18px;">×</button>
                        </div>
                    </div>
                `;
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ===============================
// Voice Recording
// ===============================
let recognition = null;
let isRecording = false;

function initVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Speech recognition not supported');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const chatInput = document.getElementById('chatInput');
        chatInput.value = transcript;
        autoResizeChatInput(chatInput);
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            showError('No speech detected. Please try again.');
        }
        stopVoiceRecording();
    };
    
    recognition.onend = () => {
        stopVoiceRecording();
    };
}

function toggleVoiceRecording() {
    if (!recognition) {
        initVoiceRecognition();
        if (!recognition) {
            showError('Voice recognition is not supported in your browser');
            return;
        }
    }
    
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    if (!recognition) return;
    
    try {
        recognition.start();
        isRecording = true;
        const micBtn = document.getElementById('micBtn');
        const micIcon = document.getElementById('micIcon');
        const recordingStatus = document.getElementById('recordingStatus');
        
        micIcon.textContent = '🔴';
        micBtn.style.background = 'linear-gradient(135deg, var(--danger), #ff4d4d)';
        recordingStatus.style.display = 'block';
    } catch (error) {
        console.error('Error starting recognition:', error);
        showError('Failed to start voice recording');
    }
}

function stopVoiceRecording() {
    if (!recognition || !isRecording) return;
    
    try {
        recognition.stop();
        isRecording = false;
        const micBtn = document.getElementById('micBtn');
        const micIcon = document.getElementById('micIcon');
        const recordingStatus = document.getElementById('recordingStatus');
        
        micIcon.textContent = '🎤';
        micBtn.style.background = '';
        recordingStatus.style.display = 'none';
    } catch (error) {
        console.error('Error stopping recognition:', error);
    }
}

// ===============================
// Submit Complaint
// ===============================
async function handleComplaintSubmit(e) {
    if (e) e.preventDefault();

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    let category = document.getElementById('category').value;
    const subCategory = document.getElementById('subCategory').value;
    const priority = document.getElementById('priority').value;
    const location = document.getElementById('location').value;

    // Handle "Other" category
    if (category === 'Other') {
        const otherCategoryText = document.getElementById('otherCategoryText').value.trim();
        if (!otherCategoryText) {
            showError('Please specify your issue in the "Other" category field');
            return;
        }
        category = otherCategoryText; // Use the custom text as the category
    } else if (category && !subCategory) {
        // Require sub-category for all categories except "Other"
        showError('Please select the specific problem type');
        return;
    }

    if (!title || !description || !location || !category) {
        showError('All required fields must be filled');
        return;
    }

    const submitBtn = document.getElementById('submitComplaintBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Uploading...';

    // Upload media files first using Cloudinary
    const mediaUrls = [];
    if (uploadedMediaFiles.length > 0) {
        try {
            // upload sequentially
            for (const item of [...uploadedMediaFiles]) {
                const file = item.file;
                
                // show progress UI
                const progressBar = document.querySelector(`[data-file-id="${item.id}"] .upload-progress`);
                const progressFill = progressBar ? progressBar.querySelector('.progress-fill') : null;
                const cancelBtn = document.querySelector(`[data-file-id="${item.id}"] .upload-cancel-btn`);
                if (progressBar) progressBar.style.display = 'block';
                if (cancelBtn) cancelBtn.style.display = 'inline-block';

                try {
                    const url = await uploadToCloudinary(file);
                    if (url) {
                        mediaUrls.push({ 
                            url, 
                            type: file.type.startsWith('video/') ? 'video' : 'image', 
                            name: file.name 
                        });
                    }
                    if (progressFill) progressFill.style.width = '100%';
                } catch (err) {
                    console.error('Error uploading file:', err);
                    throw err;
                }
            }
        } catch (error) {
            console.error('Error uploading media:', error);
            showError('Failed to upload some media files. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }
    }

    const complaintData = {
        title,
        description,
        category,
        subCategory: subCategory || null,
        priority,
        location,
        status: 'pending',
        progress: 0,
        authorId: currentUser.uid,
        authorEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Add media URLs if any
    if (mediaUrls.length > 0) {
        complaintData.media = mediaUrls;
    }

    // Add geolocation if available
    if (currentGeolocation) {
        complaintData.geolocation = {
            latitude: currentGeolocation.latitude,
            longitude: currentGeolocation.longitude,
            accuracy: currentGeolocation.accuracy
        };
    }

    firebaseDB.collection('complaints').add(complaintData)
    .then(() => {
        showSuccess('Complaint submitted successfully');
        // Reset form
        document.getElementById('title').value = '';
        document.getElementById('description').value = '';
        document.getElementById('category').value = '';
        document.getElementById('subCategory').value = '';
        document.getElementById('subCategoryContainer').style.display = 'none';
        document.getElementById('priority').value = '';
        document.getElementById('location').value = '';
        document.getElementById('affected').value = '1';
        document.getElementById('geolocation').value = '';
        document.getElementById('locationStatus').style.display = 'none';
        document.getElementById('otherCategoryInput').style.display = 'none';
        document.getElementById('otherCategoryText').value = '';
        document.getElementById('categorySuggestion').style.display = 'none';
        document.getElementById('mediaPreview').innerHTML = '';
        document.getElementById('mediaPreview').style.display = 'none';
        uploadedMediaFiles = [];
        const clearBtn = document.getElementById('clearMediaBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        currentGeolocation = null;
        suggestedCategory = null;
        
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        
        switchTab(
            'my-complaints',
            document.querySelector('[data-tab="my-complaints"]')
        );
    })
    .catch(err => {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    });
}

// ===============================
// Auth Guard + Init
// ===============================
document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('.nav-item').forEach(item => {
        const tab = item.dataset.tab;
        item.addEventListener('click', e => {
            e.preventDefault();
            switchTab(tab, item);
        });
    });

    const submitBtn = document.getElementById('submitComplaintBtn');
    if (submitBtn) submitBtn.addEventListener('click', handleComplaintSubmit);

    firebaseAuth.onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        currentUser = user;

        // Update welcome message with user's name
        updateWelcomeMessage();

        loadComplaintStats();
        loadRecentComplaints();
        loadMyComplaints();

        // Initialize voice recognition if available
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            initVoiceRecognition();
        }

        // Initialize challan file upload listeners
        if (typeof initChallanUploads === 'function') {
            initChallanUploads();
        }

        // Setup vehicle type radio card visual highlight
        document.querySelectorAll('input[name="vehicleType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('.challan-vehicle-card-inner').forEach(c => c.classList.remove('selected'));
                if (radio.checked) {
                    radio.closest('.challan-vehicle-card').querySelector('.challan-vehicle-card-inner').classList.add('selected');
                }
            });
        });

        switchTab(
            'dashboard',
            document.querySelector('[data-tab="dashboard"]')
        );

        // Initialize dashboard location widget
        setTimeout(() => initDashboardLocation(), 500);
    });
});

// ===============================
// USER ANALYTICS PAGE
// ===============================
function loadUserAnalytics() {
    const content = document.getElementById('analyticsContent');
    if (!content || !window.firebaseDB || !currentUser) return;

    content.innerHTML = '<p>Loading analytics...</p>';

    firebaseDB.collection('complaints')
        .where('authorId', '==', currentUser.uid)
        .get()
        .then(snapshot => {
            const complaints = [];
            snapshot.forEach(doc => complaints.push({ id: doc.id, ...doc.data() }));

            const stats = calculateUserAnalytics(complaints);
            displayUserAnalytics(stats, complaints, content);
        })
        .catch(err => {
            console.error('Error loading analytics:', err);
            content.innerHTML = '<p style="color:var(--danger);">Error loading analytics</p>';
        });
}

function calculateUserAnalytics(complaints) {
    const stats = {
        total: complaints.length,
        byStatus: { pending: 0, 'in-progress': 0, resolved: 0, rejected: 0 },
        byCategory: {},
        byPriority: {},
        resolutionTime: [],
        avgResolutionTime: 0,
        monthlyTrend: {},
        successRate: 0
    };

    complaints.forEach(comp => {
        const status = (comp.status || 'pending').toLowerCase();
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        const category = comp.category || 'General';
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

        const priority = comp.priority || 'Medium';
        stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

        const created = comp.createdAt?.toDate ? comp.createdAt.toDate() : new Date();
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
        stats.monthlyTrend[monthKey] = (stats.monthlyTrend[monthKey] || 0) + 1;

        if (status === 'resolved' && comp.updatedAt) {
            const updated = comp.updatedAt.toDate ? comp.updatedAt.toDate() : new Date();
            const days = Math.ceil((updated - created) / (1000 * 60 * 60 * 24));
            stats.resolutionTime.push(days);
        }
    });

    stats.avgResolutionTime = stats.resolutionTime.length > 0
        ? Math.round(stats.resolutionTime.reduce((a, b) => a + b, 0) / stats.resolutionTime.length)
        : 0;

    stats.successRate = stats.total > 0
        ? Math.round((stats.byStatus.resolved / stats.total) * 100)
        : 0;

    return stats;
}

function displayUserAnalytics(stats, complaints, container) {
    const pending   = stats.byStatus.pending || 0;
    const inProgress= stats.byStatus['in-progress'] || 0;
    const resolved  = stats.byStatus.resolved || 0;
    const rejected  = stats.byStatus.rejected || 0;

    container.style.textAlign = 'left';
    container.style.padding   = '0';

    if (stats.total === 0) {
        container.innerHTML = `
            <div class="analytics-empty">
                <div class="analytics-empty-icon">📊</div>
                <h3 style="color:var(--text-secondary);margin-bottom:8px;">No Complaint Data Yet</h3>
                <p style="color:var(--text-secondary);font-size:14px;">Submit your first complaint to see analytics here.</p>
            </div>`;
        return;
    }

    // Build category bars
    const catEntries = Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const catMax = catEntries.length ? catEntries[0][1] : 1;
    const catColors = ['#00d4ff','#8338ec','#ff006e','#fb5607','#3a86ff','#51cf66'];
    const catBarsHTML = catEntries.map(([cat, cnt], i) => {
        const pct = Math.round((cnt/catMax)*100);
        return `<div class="analytics-bar-row">
            <div class="analytics-bar-header">
                <span class="analytics-bar-label">${cat}</span>
                <span class="analytics-bar-count">${cnt} complaint${cnt>1?'s':''}</span>
            </div>
            <div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${catColors[i%catColors.length]};"></div></div>
        </div>`;
    }).join('');

    // Status legend
    const statusCfg = [
        { key:'pending',     label:'Pending',     color:'#00d4ff', count: pending },
        { key:'in-progress', label:'In Progress', color:'#fb5607', count: inProgress },
        { key:'resolved',    label:'Resolved',    color:'#51cf66', count: resolved },
        { key:'rejected',    label:'Rejected',    color:'#d62828', count: rejected },
    ];
    const statusBarsHTML = statusCfg.map(s => {
        const pct = stats.total > 0 ? Math.round((s.count/stats.total)*100) : 0;
        return `<div class="analytics-bar-row">
            <div class="analytics-bar-header">
                <span class="analytics-bar-label" style="color:${s.color};">${s.label}</span>
                <span class="analytics-bar-count">${s.count} (${pct}%)</span>
            </div>
            <div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${s.color};"></div></div>
        </div>`;
    }).join('');

    // Monthly trend bars
    const monthEntries = Object.entries(stats.monthlyTrend).sort().slice(-6);
    const monthMax = monthEntries.length ? Math.max(...monthEntries.map(e=>e[1]),1) : 1;
    const monthGradients = ['linear-gradient(180deg,#00d4ff,#3a86ff)','linear-gradient(180deg,#8338ec,#00d4ff)','linear-gradient(180deg,#ff006e,#8338ec)','linear-gradient(180deg,#fb5607,#ff006e)','linear-gradient(180deg,#3a86ff,#51cf66)','linear-gradient(180deg,#51cf66,#3a86ff)'];
    const monthBarsHTML = monthEntries.map(([mk, cnt], i) => {
        const heightPct = Math.round((cnt/monthMax)*100);
        const label = new Date(mk+'-01').toLocaleDateString('en-US',{month:'short'});
        return `<div class="analytics-month-bar" style="max-width:60px;">
            <div class="analytics-month-bar-fill" style="height:${heightPct}%;background:${monthGradients[i%monthGradients.length]};box-shadow:0 4px 14px rgba(0,212,255,0.3);">
                <span class="analytics-month-count">${cnt}</span>
            </div>
            <span class="analytics-month-label">${label}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
        <!-- KPI Hero Cards -->
        <div class="analytics-hero">
            <div class="analytics-stat-card">
                <span class="analytics-stat-icon">📤</span>
                <div class="analytics-stat-value">${stats.total}</div>
                <div class="analytics-stat-label">Total Complaints</div>
                <span class="analytics-stat-badge" style="background:rgba(0,212,255,0.15);color:#00d4ff;">All time</span>
            </div>
            <div class="analytics-stat-card">
                <span class="analytics-stat-icon">✅</span>
                <div class="analytics-stat-value" style="background:linear-gradient(135deg,#51cf66,#3a86ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${stats.successRate}%</div>
                <div class="analytics-stat-label">Success Rate</div>
                <span class="analytics-stat-badge" style="background:rgba(81,207,102,0.15);color:#51cf66;">${resolved} resolved</span>
            </div>
            <div class="analytics-stat-card">
                <span class="analytics-stat-icon">⏱️</span>
                <div class="analytics-stat-value" style="background:linear-gradient(135deg,#fb5607,#ffd60a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${stats.avgResolutionTime}d</div>
                <div class="analytics-stat-label">Avg Resolution</div>
                <span class="analytics-stat-badge" style="background:rgba(251,86,7,0.15);color:#fb5607;">${stats.resolutionTime.length} cases</span>
            </div>
            <div class="analytics-stat-card">
                <span class="analytics-stat-icon">⏳</span>
                <div class="analytics-stat-value" style="background:linear-gradient(135deg,#d62828,#ff006e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${pending}</div>
                <div class="analytics-stat-label">Still Pending</div>
                <span class="analytics-stat-badge" style="background:rgba(214,40,40,0.15);color:#d62828;">${stats.total>0?Math.round((pending/stats.total)*100):0}% of total</span>
            </div>
        </div>

        <!-- Charts Grid -->
        <div class="analytics-chart-grid">
            <div class="analytics-chart-card">
                <div class="analytics-chart-title">📊 Status Breakdown</div>
                ${statusBarsHTML}
            </div>

            <div class="analytics-chart-card">
                <div class="analytics-chart-title">📂 Top Categories</div>
                ${catBarsHTML || '<div class="analytics-empty" style="padding:20px;"><p>No category data</p></div>'}
            </div>
        </div>

        <!-- Monthly Trend -->
        <div class="analytics-chart-card" style="margin-bottom:0;">
            <div class="analytics-chart-title">📅 Monthly Activity (Last 6 Months)</div>
            <div class="analytics-monthly-chart">
                ${monthBarsHTML || '<p style="color:var(--text-secondary);padding:20px;">No monthly data available</p>'}
            </div>
        </div>
    `;
}

function renderStatusChart(byStatus) {
    // Kept for backward compatibility but analytics now uses displayUserAnalytics directly
    const total = Object.values(byStatus).reduce((a,b)=>a+b,0);
    if (total === 0) return '<p style="color:var(--text-secondary);">No data available</p>';
    const colors = { pending:'#00d4ff', 'in-progress':'#fb5607', resolved:'#3a86ff', rejected:'#d62828' };
    return Object.entries(byStatus).map(([s,c]) => {
        const pct = Math.round((c/total)*100);
        return `<div class="analytics-bar-row"><div class="analytics-bar-header"><span class="analytics-bar-label" style="text-transform:capitalize;">${s.replace('-',' ')}</span><span class="analytics-bar-count">${c} (${pct}%)</span></div><div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${colors[s]||'#666'};"></div></div></div>`;
    }).join('');
}

function renderCategoryChartUser(byCategory) {
    const entries = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!entries.length) return '<p style="color:var(--text-secondary);">No category data</p>';
    const max = entries[0][1];
    const colors = ['#00d4ff','#8338ec','#ff006e','#fb5607','#3a86ff'];
    return entries.map(([cat,cnt],i) => {
        const pct = Math.round((cnt/max)*100);
        return `<div class="analytics-bar-row"><div class="analytics-bar-header"><span class="analytics-bar-label">${cat}</span><span class="analytics-bar-count">${cnt}</span></div><div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${colors[i]};"></div></div></div>`;
    }).join('');
}

function renderMonthlyTrendUser(monthlyTrend) {
    const entries = Object.entries(monthlyTrend).sort().slice(-6);
    if (!entries.length) return '<p style="color:var(--text-secondary);">No data available</p>';
    const max = Math.max(...entries.map(e=>e[1]),1);
    const colors = ['#00d4ff','#8338ec','#ff006e','#fb5607','#3a86ff','#51cf66'];
    return `<div style="display:flex;align-items:flex-end;gap:12px;height:160px;">${entries.map(([m,c],i)=>{
        const h = Math.round((c/max)*100);
        const label = new Date(m+'-01').toLocaleDateString('en-US',{month:'short'});
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;">
            <span style="font-size:11px;font-weight:700;">${c}</span>
            <div style="width:100%;background:${colors[i%colors.length]};height:${h}%;border-radius:6px 6px 0 0;box-shadow:0 4px 12px ${colors[i%colors.length]}40;min-height:4px;"></div>
            <span style="font-size:10px;color:var(--text-secondary);">${label}</span>
        </div>`;
    }).join('')}</div>`;
}

// ===============================
// HELP CENTER PAGE
// ===============================
function loadHelpCenter() {
    const content = document.getElementById('helpContent');
    if (!content) return;

    content.innerHTML = `
        <div class="complaints-section" style="margin-bottom:24px;">
            <div class="section-header">
                <div class="section-title">❓ Frequently Asked Questions</div>
            </div>

            <div style="margin-top:24px;">
                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">How do I submit a complaint?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        Click on the "+ New Complaint" button in the sidebar or dashboard. Fill in all required fields including category, priority, location, title, and description. You can also upload photos to help describe the issue better.
                    </div>
                </div>

                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">How long does it take to resolve a complaint?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        Resolution time varies based on the priority and complexity of the issue. Critical issues are typically addressed within 24-48 hours, while standard complaints may take 3-7 business days. You can track the status in real-time through your dashboard.
                    </div>
                </div>

                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">Can I edit or delete my complaint after submission?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        You cannot edit complaints after submission, but you can contact support if you need to provide additional information. Only admins can delete complaints, and only if they haven't been resolved yet.
                    </div>
                </div>

                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">What are the complaint priorities?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        <strong>Critical:</strong> Safety risks, emergencies (24-48 hours)<br>
                        <strong>High:</strong> Major inconveniences affecting many (3-5 days)<br>
                        <strong>Medium:</strong> Standard issues requiring attention (5-7 days)<br>
                        <strong>Low:</strong> Minor issues that can wait (7-14 days)
                    </div>
                </div>

                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">How does the AI-powered system work?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        Our AI system automatically analyzes your complaint description to suggest the best category, detects your location, analyzes uploaded images, and assigns priority scores. This helps process complaints faster and more accurately.
                    </div>
                </div>

                <div class="faq-item" style="margin-bottom:20px; padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color);">
                    <div style="font-size:18px; font-weight:700; margin-bottom:12px; color:var(--primary-light);">Will I receive notifications about my complaint status?</div>
                    <div style="color:var(--text-secondary); line-height:1.6;">
                        Yes! You'll receive real-time notifications when your complaint status changes, when it's assigned to an admin, or when it's resolved. You can manage notification preferences in your Settings.
                    </div>
                </div>
            </div>
        </div>

        <div class="complaints-section">
            <div class="section-header">
                <div class="section-title">📞 Contact Support</div>
            </div>

            <div style="margin-top:24px;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:20px;">
                    <div style="padding:24px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-align:center;">
                        <div style="font-size:32px; margin-bottom:12px;">📧</div>
                        <div style="font-weight:700; margin-bottom:8px;">Email Support</div>
                        <div style="color:var(--text-secondary); font-size:14px;">support@smartcomplaintapp.com</div>
                        <div style="color:var(--text-secondary); font-size:12px; margin-top:8px;">Response within 24 hours</div>
                    </div>

                    <div style="padding:24px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-align:center;">
                        <div style="font-size:32px; margin-bottom:12px;">💬</div>
                        <div style="font-weight:700; margin-bottom:8px;">Live Chat</div>
                        <div style="color:var(--text-secondary); font-size:14px;">Available 24/7</div>
                        <button class="btn btn-primary" style="margin-top:12px; width:100%;" onclick="alert('Live chat feature coming soon!')">Start Chat</button>
                    </div>

                    <div style="padding:24px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-align:center;">
                        <div style="font-size:32px; margin-bottom:12px;">📱</div>
                        <div style="font-weight:700; margin-bottom:8px;">Phone Support</div>
                        <div style="color:var(--text-secondary); font-size:14px;">1-800-SMART-APP</div>
                        <div style="color:var(--text-secondary); font-size:12px; margin-top:8px;">Mon-Fri, 9 AM - 6 PM</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="complaints-section" style="margin-top:24px;">
            <div class="section-header">
                <div class="section-title">📖 User Guides</div>
            </div>

            <div style="margin-top:24px;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
                    <a href="#" onclick="alert('Guide coming soon!'); return false;" style="padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-decoration:none; color:var(--text-primary); transition:all 0.3s ease;" onmouseover="this.style.borderColor='var(--primary-light)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'">
                        <div style="font-size:24px; margin-bottom:8px;">🚀</div>
                        <div style="font-weight:700; margin-bottom:4px;">Getting Started</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Learn the basics</div>
                    </a>

                    <a href="#" onclick="alert('Guide coming soon!'); return false;" style="padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-decoration:none; color:var(--text-primary); transition:all 0.3s ease;" onmouseover="this.style.borderColor='var(--primary-light)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'">
                        <div style="font-size:24px; margin-bottom:8px;">📋</div>
                        <div style="font-weight:700; margin-bottom:4px;">Submitting Complaints</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Step-by-step guide</div>
                    </a>

                    <a href="#" onclick="alert('Guide coming soon!'); return false;" style="padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-decoration:none; color:var(--text-primary); transition:all 0.3s ease;" onmouseover="this.style.borderColor='var(--primary-light)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'">
                        <div style="font-size:24px; margin-bottom:8px;">📊</div>
                        <div style="font-weight:700; margin-bottom:4px;">Understanding Analytics</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Track your data</div>
                    </a>

                    <a href="#" onclick="alert('Guide coming soon!'); return false;" style="padding:20px; background:var(--bg-dark); border-radius:12px; border:1px solid var(--border-color); text-decoration:none; color:var(--text-primary); transition:all 0.3s ease;" onmouseover="this.style.borderColor='var(--primary-light)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'">
                        <div style="font-size:24px; margin-bottom:8px;">⚙</div>
                        <div style="font-weight:700; margin-bottom:4px;">Account Settings</div>
                        <div style="font-size:12px; color:var(--text-secondary);">Manage preferences</div>
                    </a>
                </div>
            </div>
        </div>
    `;
}

// ===============================
// USER SETTINGS PAGE
// ===============================
function loadUserSettings() {
    const content = document.getElementById('settingsContent');
    if (!content || !currentUser || !window.firebaseDB) return;

    content.innerHTML = '<p style="text-align:center; padding:40px;">Loading settings...</p>';

    firebaseDB.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            const userData = doc.exists ? doc.data() : {};
            displayUserSettings(userData, content);
        })
        .catch(err => {
            console.error('Error loading settings:', err);
            content.innerHTML = '<p style="color:var(--danger); padding:20px;">Error loading settings</p>';
        });
}

function displayUserSettings(userData, container) {
    container.innerHTML = `
        <div class="settings-section">
            <div class="settings-section-title">👤 Profile Information</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input type="text" id="userFirstName" class="form-input" value="${userData.firstName || ''}" placeholder="First Name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input type="text" id="userLastName" class="form-input" value="${userData.lastName || ''}" placeholder="Last Name">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" id="userEmail" class="form-input" value="${currentUser.email || ''}" disabled>
                        <div class="ai-suggestion">📧 Email cannot be changed</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Phone</label>
                        <input type="tel" id="userPhone" class="form-input" value="${userData.phone || ''}" placeholder="Phone Number">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">User ID</label>
                        <input type="text" class="form-input" value="${currentUser.uid}" disabled>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Member Since</label>
                        <input type="text" class="form-input" value="${userData.createdAt ? (userData.createdAt.toDate ? userData.createdAt.toDate().toLocaleDateString() : 'N/A') : 'N/A'}" disabled>
                    </div>
                </div>

                <button class="btn btn-primary" onclick="saveUserProfile()">💾 Save Profile</button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🔐 Security</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Current Password</label>
                        <input type="password" id="userCurrentPassword" class="form-input" placeholder="Enter current password">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">New Password</label>
                        <input type="password" id="userNewPassword" class="form-input" placeholder="Enter new password">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Confirm New Password</label>
                        <input type="password" id="userConfirmPassword" class="form-input" placeholder="Confirm new password">
                    </div>
                </div>

                <button class="btn btn-primary" onclick="updateUserPassword()">🔒 Update Password</button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🔔 Preferences</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Email Notifications</label>
                        <select id="emailNotif" class="form-select">
                            <option value="enabled" ${userData.emailNotifications !== false ? 'selected' : ''}>Enabled</option>
                            <option value="disabled" ${userData.emailNotifications === false ? 'selected' : ''}>Disabled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Language</label>
                        <select id="userLanguage" class="form-select">
                            <option value="en" ${(userData.language || 'en') === 'en' ? 'selected' : ''}>English</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                        </select>
                    </div>
                </div>

                <button class="btn btn-primary" onclick="saveUserPreferences()">💾 Save Preferences</button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">⚠ Danger Zone</div>
            <div class="settings-form" style="border:2px solid var(--danger);">
                <div style="color:var(--text-secondary); margin-bottom:24px;">
                    Deleting your account will permanently remove all your data including complaints and profile information. This action cannot be undone.
                </div>
                <button class="btn" style="background:rgba(214,40,40,0.2); color:var(--danger); border:1px solid var(--danger);" onclick="deleteUserAccount()">
                    🗑 Delete Account
                </button>
            </div>
        </div>

        <div class="settings-section">
            <div style="text-align:center; padding:32px;">
                <button class="btn btn-primary" style="padding:14px 32px; font-size:16px;" onclick="userLogout()">
                    🔒 Logout
                </button>
            </div>
        </div>
    `;
}

function saveUserProfile() {
    const firstName = document.getElementById('userFirstName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const phone = document.getElementById('userPhone').value.trim();

    firebaseDB.collection('users').doc(currentUser.uid).update({
        firstName,
        lastName,
        phone,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showSuccess('Profile updated successfully!');
    }).catch(err => {
        showError(err.message);
    });
}

function updateUserPassword() {
    const currentPassword = document.getElementById('userCurrentPassword').value;
    const newPassword = document.getElementById('userNewPassword').value;
    const confirmPassword = document.getElementById('userConfirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('All password fields are required');
        return;
    }

    if (newPassword.length < 8) {
        showError('New password must be at least 8 characters');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('New passwords do not match');
        return;
    }

    const credential = firebase.auth.EmailAuthProvider.credential(
        currentUser.email,
        currentPassword
    );

    currentUser.reauthenticateWithCredential(credential)
        .then(() => currentUser.updatePassword(newPassword))
        .then(() => {
            showSuccess('Password updated successfully!');
            document.getElementById('userCurrentPassword').value = '';
            document.getElementById('userNewPassword').value = '';
            document.getElementById('userConfirmPassword').value = '';
        })
        .catch(err => showError(err.message));
}

function saveUserPreferences() {
    const emailNotifications = document.getElementById('emailNotif').value === 'enabled';
    const language = document.getElementById('userLanguage').value;

    firebaseDB.collection('users').doc(currentUser.uid).update({
        emailNotifications,
        language,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showSuccess('Preferences saved successfully!');
    }).catch(err => {
        showError(err.message);
    });
}

function deleteUserAccount() {
    if (!confirm('Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.')) {
        return;
    }

    if (!confirm('This is your last chance. Type DELETE to confirm:')) {
        return;
    }

    showError('Account deletion is disabled for safety. Please contact support for assistance.');
}

function userLogout() {
    if (confirm('Are you sure you want to logout?')) {
        firebaseAuth.signOut().then(() => {
            localStorage.clear();
            window.location.href = 'index.html';
        }).catch(err => {
            showError(err.message);
        });
    }
}

// ===============================
// AI CHATBOT FUNCTIONS
// ===============================
// AI Backend API URL - update if your backend URL changes
const AI_API_URL = `${API_BASE_URL}/api/ai/chat`;
let chatHistory = [];
let isWaitingForResponse = false;

function autoResizeChatInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function handleChatInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

function sendSuggestedMessage(message) {
    const input = document.getElementById('chatInput');
    input.value = message;
    autoResizeChatInput(input);
    sendChatMessage();
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || isWaitingForResponse) return;

    // Hide suggested questions after first message
    const suggestedQuestions = document.getElementById('suggestedQuestions');
    if (suggestedQuestions && chatHistory.length === 0) {
        suggestedQuestions.style.display = 'none';
        document.getElementById('clearChatBtn').style.display = 'inline-flex';
    }

    // Add user message to chat
    addChatMessage('user', message);
    input.value = '';
    autoResizeChatInput(input);

    // Show typing indicator
    showTypingIndicator();

    // Get user context for better responses
    const userContext = await getUserContextForAI();

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                context: userContext
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get AI response');
        }

        const data = await response.json();
        hideTypingIndicator();

        // Add AI response to chat
        addChatMessage('assistant', data.reply || 'I apologize, but I could not generate a response. Please try again.');

        // Save to Firebase
        await saveChatMessage(message, data.reply);

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        addChatMessage('assistant', `Sorry, I'm having trouble connecting to the AI service. Please make sure the backend at ${AI_API_URL} is reachable, or try again later.`);
    }
}

function addChatMessage(role, content) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove welcome message if it exists
    const welcomeMsg = messagesContainer.querySelector('.chat-welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const timestamp = new Date();
    displayChatMessage(role, content, timestamp);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Save to chat history
    chatHistory.push({ role, content, timestamp });
}

function formatAIResponse(text) {
    // Convert markdown-style formatting to HTML
    let formatted = escapeHtml(text);
    
    // Bold (**text**)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic (*text*)
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Lists
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return formatted;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTypingIndicator() {
    isWaitingForResponse = true;
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = 'flex';
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    isWaitingForResponse = false;
    document.getElementById('typingIndicator').style.display = 'none';
}

async function getUserContextForAI() {
    if (!currentUser || !window.firebaseDB) return null;

    try {
        // Get user's complaint stats
        const complaintsSnapshot = await firebaseDB.collection('complaints')
            .where('authorId', '==', currentUser.uid)
            .get();

        const complaints = [];
        let pending = 0, inProgress = 0, resolved = 0;

        complaintsSnapshot.forEach(doc => {
            const data = doc.data();
            complaints.push({
                title: data.title,
                status: data.status,
                category: data.category,
                createdAt: data.createdAt
            });
            
            const status = (data.status || 'pending').toLowerCase();
            if (status === 'resolved') resolved++;
            else if (status === 'in-progress') inProgress++;
            else pending++;
        });

        // Get user profile
        const userDoc = await firebaseDB.collection('users').doc(currentUser.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        return {
            userName: userData.firstName || currentUser.email?.split('@')[0] || 'User',
            totalComplaints: complaints.length,
            pendingComplaints: pending,
            inProgressComplaints: inProgress,
            resolvedComplaints: resolved,
            recentComplaints: complaints.slice(0, 3).map(c => ({
                title: c.title,
                status: c.status,
                category: c.category
            }))
        };
    } catch (error) {
        console.error('Error getting user context:', error);
        return null;
    }
}

async function saveChatMessage(userMessage, aiResponse) {
    if (!currentUser || !window.firebaseDB) return;

    try {
        await firebaseDB.collection('chatHistory').add({
            userId: currentUser.uid,
            userMessage,
            aiResponse,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error saving chat message:', error);
    }
}

async function loadChatHistory() {
    if (!currentUser || !window.firebaseDB) return;

    const messagesContainer = document.getElementById('chatMessages');
    const suggestedQuestions = document.getElementById('suggestedQuestions');
    const clearBtn = document.getElementById('clearChatBtn');
    
    // Reset chat history
    chatHistory = [];

    const showDefaultState = () => {
        if (!messagesContainer) return;

        messagesContainer.innerHTML = `
            <div class="chat-welcome-message">
                <div class="chat-welcome-icon">🤖</div>
                <div class="chat-welcome-text">
                    <h3>Hello! I'm your AI Assistant</h3>
                    <p>I can help you with:</p>
                    <ul>
                        <li>Filing and managing complaints</li>
                        <li>Understanding the complaint process</li>
                        <li>Tracking your complaint status</li>
                        <li>Answering questions about civic issues</li>
                        <li>Suggesting categories and priorities</li>
                    </ul>
                    <p style="margin-top:16px; color:var(--text-secondary); font-size:13px;">Click on a suggested question above or type your message below to get started!</p>
                </div>
            </div>
        `;

        if (suggestedQuestions) suggestedQuestions.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
    };
    
    try {
        const snapshot = await firebaseDB.collection('chatHistory')
            .where('userId', '==', currentUser.uid)
            .get();

        if (snapshot.empty) {
            showDefaultState();
            return;
        }

        const messages = [];
        snapshot.forEach(doc => {
            messages.push(doc.data());
        });

        messages.sort((a, b) => {
            const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
            const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
            return aTime - bTime;
        });

        if (suggestedQuestions) suggestedQuestions.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'inline-flex';

        messagesContainer.innerHTML = '';

        messages.forEach(msg => {
            const userMsg = { role: 'user', content: msg.userMessage, timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date() };
            const aiMsg = { role: 'assistant', content: msg.aiResponse, timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date() };
            chatHistory.push(userMsg, aiMsg);
            displayChatMessage('user', msg.userMessage, userMsg.timestamp);
            displayChatMessage('assistant', msg.aiResponse, aiMsg.timestamp);
        });

        if (!chatHistory.length) {
            showDefaultState();
        }

    } catch (error) {
        console.error('Error loading chat history:', error);
        showDefaultState();
    }
}

function displayChatMessage(role, content, timestamp) {
    const messagesContainer = document.getElementById('chatMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message chat-message-${role}`;
    
    const timeStr = timestamp ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="chat-message-content">
                <div class="chat-message-text">${escapeHtml(content)}</div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
            <div class="chat-message-avatar user-avatar">👤</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="chat-message-avatar ai-avatar">🤖</div>
            <div class="chat-message-content">
                <div class="chat-message-text">${formatAIResponse(content)}</div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
        `;
    }

    messagesContainer.appendChild(messageDiv);
}

async function clearChatHistory() {
    if (!confirm('Are you sure you want to clear all chat history? This will remove all your previous conversations.')) {
        return;
    }

    if (!currentUser || !window.firebaseDB) return;

    try {
        const snapshot = await firebaseDB.collection('chatHistory')
            .where('userId', '==', currentUser.uid)
            .get();

        const batch = firebaseDB.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Clear UI
        chatHistory = [];
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.innerHTML = `
            <div class="chat-welcome-message">
                <div class="chat-welcome-icon">🤖</div>
                <div class="chat-welcome-text">
                    <h3>Hello! I'm your AI Assistant</h3>
                    <p>I can help you with:</p>
                    <ul>
                        <li>Filing and managing complaints</li>
                        <li>Understanding the complaint process</li>
                        <li>Tracking your complaint status</li>
                        <li>Answering questions about civic issues</li>
                        <li>Suggesting categories and priorities</li>
                    </ul>
                    <p style="margin-top:16px; color:var(--text-secondary); font-size:13px;">Click on a suggested question above or type your message below to get started!</p>
                </div>
            </div>
        `;

        document.getElementById('suggestedQuestions').style.display = 'block';
        document.getElementById('clearChatBtn').style.display = 'none';
        showSuccess('Chat history cleared successfully!');
    } catch (error) {
        console.error('Error clearing chat history:', error);
        showError('Failed to clear chat history');
    }
}

// ===============================
// LOCATION WIDGET
// ===============================
let _locationCoords = null;
let _nearbyCache    = {};
let _activeNearbyType = 'police';

async function initDashboardLocation() {
    const cityEl     = document.getElementById('locationCity');
    const coordEl    = document.getElementById('locationCoords');
    const loadingEl  = document.getElementById('nearbyLoading');
    const refreshBtn = document.getElementById('locationRefreshBtn');
    const manualEl   = document.getElementById('locationManualSearch');

    if (!cityEl) return;

    // Always show manual search as an option
    if (manualEl) manualEl.style.display = 'block';

    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '\u23f3 Locating...'; }

    if (!navigator.geolocation) {
        cityEl.textContent  = '\ud83d\udccd Enter location below';
        coordEl.textContent = 'GPS not supported — use manual search';
        if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '\ud83d\udd04 Refresh'; }
        return;
    }

    cityEl.textContent  = 'Detecting location\u2026';
    coordEl.textContent = 'Requesting GPS access';

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            _locationCoords = { lat, lng };
            _nearbyCache = {};

            if (coordEl) coordEl.textContent = `${lat.toFixed(5)}\u00b0 N, ${lng.toFixed(5)}\u00b0 E \u00b7 GPS Active`;

            // Reverse geocode with Nominatim
            try {
                const resp = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const geo  = await resp.json();
                const addr = geo.address || {};
                const city = addr.city || addr.town || addr.village || addr.county || addr.state || 'Unknown City';
                const state = addr.state || '';
                const fullCity = `${city}${state ? ', ' + state : ''}`;
                if (cityEl) cityEl.textContent = `\ud83d\udccd ${fullCity}`;
                // Pre-fill the manual input with detected city
                const inp = document.getElementById('locationManualInput');
                if (inp && !inp.value) inp.value = fullCity;
            } catch (e) {
                if (cityEl) cityEl.textContent = `\ud83d\udccd ${lat.toFixed(3)}\u00b0 N, ${lng.toFixed(3)}\u00b0 E`;
            }

            if (loadingEl) loadingEl.style.display = 'flex';
            await fetchNearbyServices(_activeNearbyType, lat, lng);
            if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '\ud83d\udd04 Refresh'; }
        },
        (err) => {
            console.warn('Geolocation error:', err.message);
            if (cityEl) cityEl.textContent = '\ud83d\udccd GPS Unavailable';
            if (coordEl) coordEl.textContent = 'Enter your city below to find nearby services';

            // Show prompt in all nearby lists
            ['Police','Municipal','Hospital','Fire'].forEach(t => {
                const el = document.getElementById('nearby' + t);
                if (el) {
                    el.innerHTML = `<div class="nearby-no-data">\u2197\ufe0f Type your city in the search box above and click <strong>Search</strong> to find nearby services.</div>`;
                    el.style.display = (t === 'Police') ? 'block' : 'none';
                }
            });
            if (loadingEl) loadingEl.style.display = 'none';
            if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '\ud83d\udd04 Retry GPS'; }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );
}

async function searchLocationManually() {
    const inp = document.getElementById('locationManualInput');
    const btn = document.getElementById('locationSearchBtn');
    const cityEl  = document.getElementById('locationCity');
    const coordEl = document.getElementById('locationCoords');
    const loadingEl = document.getElementById('nearbyLoading');

    const query = (inp?.value || '').trim();
    if (!query) {
        inp?.focus();
        inp?.style && (inp.style.borderColor = '#d62828');
        setTimeout(() => { if (inp) inp.style.borderColor = ''; }, 2000);
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Searching...'; }
    if (cityEl) cityEl.textContent = `\ud83d\udccd Searching "${query}"\u2026`;
    if (coordEl) coordEl.textContent = 'Looking up coordinates\u2026';

    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const results = await resp.json();

        if (!results.length) {
            // Try without country restriction
            const resp2 = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const r2 = await resp2.json();
            if (!r2.length) {
                if (cityEl) cityEl.textContent = `\ud83d\udccd "${query}" not found`;
                if (coordEl) coordEl.textContent = 'Try a more specific city name';
                if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
                return;
            }
            results.push(r2[0]);
        }

        const place = results[0];
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);
        _locationCoords = { lat, lng };
        _nearbyCache = {};

        if (cityEl) cityEl.textContent = `\ud83d\udccd ${place.display_name.split(',').slice(0, 2).join(', ')}`;
        if (coordEl) coordEl.textContent = `${lat.toFixed(5)}\u00b0 N, ${lng.toFixed(5)}\u00b0 E`;

        // Reset all lists so they re-fetch
        ['Police','Municipal','Hospital','Fire'].forEach(t => {
            const el = document.getElementById('nearby' + t);
            if (el) { el.innerHTML = ''; el.style.display = 'none'; }
        });

        if (loadingEl) loadingEl.style.display = 'flex';
        await fetchNearbyServices(_activeNearbyType, lat, lng);

    } catch (err) {
        console.error('Manual search error:', err);
        if (cityEl) cityEl.textContent = '\ud83d\udccd Search failed. Try again.';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
    }
}

function switchNearbyTab(type, btn) {
    document.querySelectorAll('.nearby-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _activeNearbyType = type;

    ['Police','Municipal','Hospital','Fire'].forEach(t => {
        const el = document.getElementById('nearby' + t);
        if (el) el.style.display = 'none';
    });

    const capitalType = type.charAt(0).toUpperCase() + type.slice(1);
    const targetEl = document.getElementById('nearby' + capitalType);
    if (!targetEl) return;

    if (targetEl.innerHTML.trim()) {
        targetEl.style.display = 'block';
        return;
    }

    if (_locationCoords) {
        const loadingEl = document.getElementById('nearbyLoading');
        if (loadingEl) loadingEl.style.display = 'flex';
        fetchNearbyServices(type, _locationCoords.lat, _locationCoords.lng);
    } else {
        targetEl.innerHTML = `<div class="nearby-no-data">\ud83d\udccd Waiting for location data\u2026</div>`;
        targetEl.style.display = 'block';
    }
}

async function fetchNearbyServices(type, lat, lng) {
    const loadingEl    = document.getElementById('nearbyLoading');
    const capitalType  = type.charAt(0).toUpperCase() + type.slice(1);
    const targetEl     = document.getElementById('nearby' + capitalType);
    if (!targetEl) return;

    if (_nearbyCache[type]) {
        if (loadingEl) loadingEl.style.display = 'none';
        targetEl.innerHTML = _nearbyCache[type];
        targetEl.style.display = 'block';
        return;
    }

    const queries = {
        police:    `[out:json];(node["amenity"="police"](around:5000,${lat},${lng});way["amenity"="police"](around:5000,${lat},${lng}););out center 8;`,
        municipal: `[out:json];(node["office"~"government|administrative"](around:6000,${lat},${lng});node["amenity"="townhall"](around:6000,${lat},${lng}););out center 8;`,
        hospital:  `[out:json];(node["amenity"="hospital"](around:5000,${lat},${lng});node["amenity"="clinic"](around:4000,${lat},${lng}););out center 8;`,
        fire:      `[out:json];(node["amenity"="fire_station"](around:8000,${lat},${lng}););out center 8;`
    };
    const icons  = { police:'\ud83d\ude94', municipal:'\ud83c\udfdb\ufe0f', hospital:'\ud83c\udfe5', fire:'\ud83d\ude92' };
    const labels = { police:'Police Station', municipal:'Municipal Office', hospital:'Hospital / Clinic', fire:'Fire Station' };
    const mapTerms = { police:'police+station', municipal:'municipal+office', hospital:'hospital', fire:'fire+station' };

    try {
        const resp = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: queries[type]
        });
        const data = await resp.json();
        const elements = (data.elements || []).filter(e => e.tags && e.tags.name);

        if (!elements.length) {
            const searchUrl = `https://www.google.com/maps/search/${mapTerms[type]}/@${lat},${lng},14z`;
            const html = `<div class="nearby-no-data">
                <div style="font-size:32px;margin-bottom:8px;">${icons[type]}</div>
                <p>No ${labels[type]}s found within 5 km.</p>
                <a href="${searchUrl}" target="_blank" style="color:var(--primary-light);font-size:12px;font-weight:600;">\ud83d\udd0d Search on Google Maps</a>
            </div>`;
            _nearbyCache[type] = html;
            targetEl.innerHTML = html;
            if (loadingEl) loadingEl.style.display = 'none';
            targetEl.style.display = 'block';
            return;
        }

        const html = elements.slice(0, 6).map(el => {
            const name = el.tags.name || labels[type];
            const eLat = el.center ? el.center.lat : (el.lat || lat);
            const eLng = el.center ? el.center.lon : (el.lon || lng);
            const distM   = haversineDistance(lat, lng, eLat, eLng);
            const distStr = distM < 1000 ? `${Math.round(distM)} m away` : `${(distM/1000).toFixed(1)} km away`;
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${eLat},${eLng}`;
            return `<a class="nearby-service-item" href="${mapsUrl}" target="_blank">
                <div class="nearby-service-icon">${icons[type]}</div>
                <div style="flex:1;min-width:0;">
                    <div class="nearby-service-name">${_escHtml(name)}</div>
                    <div class="nearby-service-dist">${distStr}</div>
                </div>
                <div class="nearby-service-action">\ud83d\uddfa\ufe0f Navigate</div>
            </a>`;
        }).join('');

        _nearbyCache[type] = html;
        targetEl.innerHTML = html;
    } catch (err) {
        console.warn('Overpass fetch error:', err.message);
        const searchUrl = `https://www.google.com/maps/search/${mapTerms[type]}/@${lat},${lng},14z`;
        targetEl.innerHTML = `<div class="nearby-no-data">
            <p>Could not load nearby services.</p>
            <a href="${searchUrl}" target="_blank" style="color:var(--primary-light);font-weight:600;">\ud83d\udd0d Search on Google Maps</a>
        </div>`;
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        targetEl.style.display = 'block';
    }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _escHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text || '');
    return d.innerHTML;
}