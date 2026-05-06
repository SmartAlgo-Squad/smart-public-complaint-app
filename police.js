// police.js — Police Officer Dashboard Logic

// =================================================
// GLOBAL STATE
// =================================================
let currentPoliceUser  = null;
let allChallanData     = [];
let activeStatusFilter = 'all';
let policeUnsubscribe  = null;

const CHALLAN_STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected', 'Resolved'];
const CHALLAN_COLLECTIONS = ['complaints', 'challanComplaints'];

async function fetchMergedChallanDocs() {
    const results = await Promise.allSettled(
        CHALLAN_COLLECTIONS.map(collectionName => firebaseDB.collection(collectionName).get())
    );

    const docsMap = new Map();
    results.forEach(result => {
        if (result.status !== 'fulfilled') return;
        result.value.forEach(doc => {
            const data = doc.data();
            const isChallan = data.complaintType === 'challan' || doc.ref.parent.id === 'challanComplaints';
            if (!isChallan) return;
            docsMap.set(doc.id, { id: doc.id, ...data });
        });
    });

    return Array.from(docsMap.values()).sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
    });
}

async function updateMergedChallanDoc(id, data) {
    await Promise.allSettled(
        CHALLAN_COLLECTIONS.map(collectionName =>
            firebaseDB.collection(collectionName).doc(id).update(data)
        )
    );
}

// =================================================
// HELPERS — Toast Notifications
// =================================================
function _showToast(msg, type) {
    const existing = document.getElementById('policeToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'policeToast';
    toast.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:99999;
        background:${type === 'error' ? 'linear-gradient(135deg,#cc0000,#990000)' : 'linear-gradient(135deg,#0057b8,#1a73e8)'};
        color:#fff; padding:14px 22px; border-radius:12px; font-weight:600;
        font-size:14px; max-width:400px; box-shadow:0 8px 32px rgba(0,0,0,.5);
        border-left:4px solid ${type === 'error' ? '#ff5c5c' : '#ffd700'};
        animation:slideInRight .35s cubic-bezier(0.34,1.56,0.64,1);
        display:flex; align-items:center; gap:10px;`;
    toast.innerHTML = `<span style="font-size:20px;">${type === 'error' ? '⚠️' : '✅'}</span><span>${msg}</span>`;
    document.body.appendChild(toast);

    // Add animation keyframes once
    if (!document.getElementById('policeToastStyle')) {
        const s = document.createElement('style');
        s.id = 'policeToastStyle';
        s.textContent = `@keyframes slideInRight{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}`;
        document.head.appendChild(s);
    }
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, type === 'error' ? 5000 : 3000);
}

function showError(msg)   { console.error(msg); _showToast(msg, 'error');   }
function showSuccess(msg) { console.log(msg);   _showToast(msg, 'success'); }

function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text || '');
    return d.innerHTML;
}

function getStatusCfg(status) {
    switch ((status || '').toLowerCase()) {
        case 'pending':      return { color:'#fb8500', bg:'rgba(251,133,0,0.15)',   border:'rgba(251,133,0,0.4)',   icon:'⏳' };
        case 'under review': return { color:'#ffd60a', bg:'rgba(255,214,10,0.15)',  border:'rgba(255,214,10,0.4)',  icon:'🔍' };
        case 'approved':     return { color:'#51cf66', bg:'rgba(81,207,102,0.15)',  border:'rgba(81,207,102,0.4)',  icon:'✅' };
        case 'rejected':     return { color:'#d62828', bg:'rgba(214,40,40,0.15)',   border:'rgba(214,40,40,0.4)',   icon:'❌' };
        case 'resolved':     return { color:'#3a86ff', bg:'rgba(58,134,255,0.15)',  border:'rgba(58,134,255,0.4)',  icon:'🏁' };
        default:             return { color:'#fb8500', bg:'rgba(251,133,0,0.15)',   border:'rgba(251,133,0,0.4)',   icon:'⏳' };
    }
}

// =================================================
// MOBILE SIDEBAR
// =================================================
function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    const overlayId = 'mobileOverlay';
    const existing  = document.getElementById(overlayId);
    const willOpen  = !sb.classList.contains('open');
    sb.classList.toggle('open');
    if (willOpen) {
        if (!existing) {
            const ov = document.createElement('div');
            ov.id = overlayId;
            ov.className = 'mobile-overlay visible';
            ov.onclick = () => toggleSidebar();
            document.body.appendChild(ov);
        } else { existing.classList.add('visible'); }
        document.body.style.overflow = 'hidden';
    } else {
        if (existing) existing.classList.remove('visible');
        setTimeout(() => { const el = document.getElementById(overlayId); if (el) el.remove(); }, 300);
        document.body.style.overflow = '';
    }
}

// =================================================
// NAVIGATION
// =================================================
function switchPoliceTab(tabName, navItem) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navItem) navItem.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Tab-specific loaders
    if (tabName === 'all-challans')    { setTimeout(() => loadPoliceAllChallans(), 80);     }
    if (tabName === 'pending-actions') { setTimeout(() => loadPolicePending(), 80);          }
    if (tabName === 'analytics')       { setTimeout(() => loadPoliceAnalytics(), 80);        }
    if (tabName === 'activity-log')    { setTimeout(() => loadPoliceActivityLog(), 80);      }
    if (tabName === 'settings')        { setTimeout(() => loadPoliceSettings(), 80);         }
}

function filterAndOpenTab(status) {
    activeStatusFilter = status;
    switchPoliceTab('all-challans', document.querySelector('[data-tab="all-challans"]'));
}

// =================================================
// AUTH GUARD — role === 'police'
// =================================================
function checkPoliceAuth() {
    if (!window.firebaseAuth || !window.firebaseDB) {
        setTimeout(checkPoliceAuth, 300);
        return;
    }

    firebaseAuth.onAuthStateChanged(async user => {
        if (!user) { window.location.href = 'index.html'; return; }

        const snap = await firebaseDB.collection('users').doc(user.uid).get();

        if (!snap.exists) {
            alert('User profile not found.');
            window.location.href = 'index.html';
            return;
        }

        const role = snap.data().role || 'user';

        if (role !== 'police' && role !== 'admin') {
            alert('Access denied. This portal is for Police Officers only.');
            window.location.href = 'dashboard.html';
            return;
        }

        currentPoliceUser = { ...user, ...snap.data() };

        // Update officer header
        const nameEl   = document.getElementById('officerName');
        const welcomeEl = document.getElementById('policeWelcome');
        const fullName  = `${snap.data().firstName || ''} ${snap.data().lastName || ''}`.trim() || user.email;
        if (nameEl)    nameEl.textContent    = fullName;
        if (welcomeEl) welcomeEl.textContent = `🚔 Welcome, Officer ${snap.data().firstName || ''}`;

        // Init
        loadPoliceStats();
        loadPoliceRecentActivity();
        loadTodayMetrics();
        switchPoliceTab('overview', document.querySelector('[data-tab="overview"]'));
    });
}

// =================================================
// LOGOUT
// =================================================
function policeLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    if (policeUnsubscribe) policeUnsubscribe();
    firebaseAuth.signOut().finally(() => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}

// =================================================
// OVERVIEW STATS
// =================================================
function loadPoliceStats() {
    const grid = document.getElementById('policeStatsGrid');
    if (!grid || !window.firebaseDB) return;
    grid.innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-secondary);">Loading…</p>';

    firebaseDB.collection('challanComplaints').onSnapshot(snap => {
        const counts = { total:0, pending:0, review:0, approved:0, rejected:0, resolved:0 };
        snap.forEach(doc => {
            counts.total++;
            const s = (doc.data().status || 'Pending').toLowerCase();
            if (s === 'pending')      counts.pending++;
            else if (s === 'under review') counts.review++;
            else if (s === 'approved')  counts.approved++;
            else if (s === 'rejected')  counts.rejected++;
            else if (s === 'resolved')  counts.resolved++;
        });

        // Update quick action counts
        const setQA = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setQA('qaCountPending',  counts.pending);
        setQA('qaCountReview',   counts.review);
        setQA('qaCountApproved', counts.approved);

        grid.innerHTML = `
            <div class="stat-card police-stat-card">
                <div class="stat-label">📋 Total</div>
                <div class="stat-value">${counts.total}</div>
                <div class="stat-change">All submittted complaints</div>
            </div>
            <div class="stat-card police-stat-card" style="cursor:pointer;" onclick="switchPoliceTab('pending-actions',document.querySelector('[data-tab=pending-actions]'))">
                <div class="stat-label">⏳ Pending</div>
                <div class="stat-value" style="color:#fb8500;">${counts.pending}</div>
                <div class="stat-change" style="color:#fb8500;">Requires action</div>
            </div>
            <div class="stat-card police-stat-card">
                <div class="stat-label">🔍 Under Review</div>
                <div class="stat-value" style="color:#ffd60a;">${counts.review}</div>
                <div class="stat-change">Currently reviewing</div>
            </div>
            <div class="stat-card police-stat-card">
                <div class="stat-label">✅ Approved</div>
                <div class="stat-value" style="color:#51cf66;">${counts.approved}</div>
                <div class="stat-change">Challan cancelled/approved</div>
            </div>
            <div class="stat-card police-stat-card">
                <div class="stat-label">❌ Rejected</div>
                <div class="stat-value" style="color:#d62828;">${counts.rejected}</div>
                <div class="stat-change">Proof insufficient</div>
            </div>
            <div class="stat-card police-stat-card">
                <div class="stat-label">🏁 Resolved</div>
                <div class="stat-value" style="color:#3a86ff;">${counts.resolved}</div>
                <div class="stat-change">Fully closed</div>
            </div>
        `;
    });
}

function loadTodayMetrics() {
    const container = document.getElementById('policeTodayMetrics');
    if (!container || !window.firebaseDB) return;

    firebaseDB.collection('challanComplaints').get().then(snap => {
        const today = new Date(); today.setHours(0,0,0,0);
        let todayNew = 0, todayResolved = 0, avgResponseHrs = 0;
        const times = [];

        snap.forEach(doc => {
            const d = doc.data();
            const created = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
            if (created >= today) todayNew++;
            if (d.status?.toLowerCase() === 'resolved' && d.updatedAt) {
                const updated = d.updatedAt.toDate ? d.updatedAt.toDate() : new Date();
                if (updated >= today) todayResolved++;
                times.push((updated - created) / 3600000);
            }
        });

        avgResponseHrs = times.length ? (times.reduce((a,b)=>a+b,0) / times.length).toFixed(1) : '—';

        container.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="police-metric-box">
                    <div class="police-metric-value" style="color:var(--primary-light);">${todayNew}</div>
                    <div class="police-metric-label">New Today</div>
                </div>
                <div class="police-metric-box">
                    <div class="police-metric-value" style="color:#51cf66;">${todayResolved}</div>
                    <div class="police-metric-label">Resolved Today</div>
                </div>
            </div>
            <div class="police-metric-box" style="margin-top:12px;">
                <div class="police-metric-value" style="color:#ffd60a;">${avgResponseHrs}h</div>
                <div class="police-metric-label">Avg. Response Time</div>
            </div>
        `;
    });
}

function loadPoliceRecentActivity() {
    const container = document.getElementById('policeRecentList');
    if (!container || !window.firebaseDB) return;

    firebaseDB.collection('challanComplaints')
        // Sort in memory to avoid index errors
        .onSnapshot(snap => {
            container.innerHTML = '';
            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:30px;">No recent complaints.</p>';
                return;
            }
            
            const docs = [];
            snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
            
            // Sort descending
            docs.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            
            // Limit to 8
            const recentDocs = docs.slice(0, 8);
            
            recentDocs.forEach(d => {
                container.appendChild(buildChallanRow(d.id, d, true));
            });
        });
}

function refreshPoliceDashboard() {
    loadPoliceStats();
    loadPoliceRecentActivity();
    loadTodayMetrics();
    showSuccess('Dashboard refreshed!');
}

// =================================================
// ALL CHALLANS
// =================================================
function loadPoliceAllChallans() {
    const list = document.getElementById('policeAllList');
    if (!list || !window.firebaseDB) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">Loading challan complaints…</p>';

    if (policeUnsubscribe) { policeUnsubscribe(); policeUnsubscribe = null; }

    policeUnsubscribe = firebaseDB.collection('challanComplaints')
        .onSnapshot(snap => {
            allChallanData = [];
            snap.forEach(doc => allChallanData.push({ id: doc.id, ...doc.data() }));
            
            // Sort descending
            allChallanData.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            
            renderFilteredList();
        }, err => {
            console.error(err);
            list.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">Failed to load complaints.</p>';
        });
}

function renderFilteredList() {
    const list = document.getElementById('policeAllList');
    if (!list) return;

    const search  = (document.getElementById('policeSearch')?.value || '').toLowerCase().trim();
    const fromVal = document.getElementById('policeFromDate')?.value;
    const toVal   = document.getElementById('policeToDate')?.value;
    const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const toDate   = toVal   ? new Date(toVal   + 'T23:59:59') : null;

    let filtered = allChallanData.filter(d => {
        const s = (d.status || 'Pending').toLowerCase();
        const statusOk = activeStatusFilter === 'all' || s === activeStatusFilter;

        const q = search;
        const searchOk = !q ||
            (d.challanNumber  || '').toLowerCase().includes(q) ||
            (d.authorEmail    || '').toLowerCase().includes(q) ||
            (d.authorName     || '').toLowerCase().includes(q) ||
            (d.vehicleType    || '').toLowerCase().includes(q) ||
            (d.description    || '').toLowerCase().includes(q) ||
            (d.status         || '').toLowerCase().includes(q);

        const ts = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
        const dateOk = (!fromDate || ts >= fromDate) && (!toDate || ts <= toDate);

        return statusOk && searchOk && dateOk;
    });

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">No complaints match your filters.</p>';
        return;
    }

    filtered.forEach(d => list.appendChild(buildChallanRow(d.id, d, false)));
}

function applyPoliceFilters() { renderFilteredList(); }

function clearPoliceDateFilter() {
    const f = document.getElementById('policeFromDate');
    const t = document.getElementById('policeToDate');
    if (f) f.value = '';
    if (t) t.value = '';
    renderFilteredList();
}

function policeFilterByStatus(status, btn) {
    document.querySelectorAll('#policeFilterBtns .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    activeStatusFilter = status;
    renderFilteredList();
}

function policeSearchComplaints(query) { renderFilteredList(); }

// =================================================
// PENDING ACTIONS TAB
// =================================================
function loadPolicePending() {
    const list = document.getElementById('policePendingList');
    if (!list || !window.firebaseDB) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">Loading pending complaints…</p>';

    firebaseDB.collection('challanComplaints')
        .where('status', 'in', ['Pending', 'Under Review'])
        .onSnapshot(snap => {
            list.innerHTML = '';
            if (snap.empty) {
                list.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;">
                        <div style="font-size:64px;margin-bottom:16px">🎉</div>
                        <h3 style="color:var(--primary-light);margin-bottom:8px;">All Clear!</h3>
                        <p style="color:var(--text-secondary);">No pending complaints. Great work, Officer!</p>
                    </div>`;
                return;
            }
            
            const docs = [];
            snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
            
            // Sort ascending (Oldest first)
            docs.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return ta - tb;
            });
            
            docs.forEach(doc => list.appendChild(buildChallanRow(doc.id, doc, false)));
        }, err => {
            console.error(err);
            list.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;">Error loading pending complaints.</p>';
        });
}

// =================================================
// CHALLAN COMPLAINT ROW CARD
// =================================================
function buildChallanRow(id, data, compact) {
    const el = document.createElement('div');
    el.className = 'complaint-item police-challan-row';
    el.dataset.id = id;
    const ts  = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const cfg = getStatusCfg(data.status || 'Pending');
    const vIcon = data.vehicleType === 'Two-Wheeler' ? '🛵' : data.vehicleType === 'Four-Wheeler' ? '🚗' : '🚌';

    const age = (Date.now() - ts.getTime()) / 3600000; // hours
    const urgentBadge = (data.status || '').toLowerCase() === 'pending' && age > 48
        ? '<span class="police-urgent-badge">🔴 URGENT &gt;48h</span>'
        : '';

    el.innerHTML = `
        <div style="flex:1;min-width:0;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
                <span class="police-challan-id">#CHN-${id.slice(0,6).toUpperCase()}</span>
                <span class="police-vehicle-badge">${vIcon} ${data.vehicleType || 'Vehicle'}</span>
                <span style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">${cfg.icon} ${data.status || 'Pending'}</span>
                ${urgentBadge}
            </div>
            <div class="police-vehicle-number">${escapeHtml(data.challanNumber || 'N/A')}</div>
            <div style="color:var(--text-secondary);font-size:13px;margin-bottom:6px;max-height:40px;overflow:hidden;">${escapeHtml((data.description||'').substring(0,120))}${(data.description||'').length>120?'…':''}</div>
            <div style="display:flex;gap:14px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap;">
                <span>👤 ${escapeHtml(data.authorName||'')} · ${escapeHtml(data.authorEmail||'Unknown')}</span>
                <span>🕒 ${timeAgo(ts)}</span>
                <span>📅 ${ts.toLocaleDateString()}</span>
                ${data.vehicleFrontImage ? '<span style="color:var(--primary-light);">📷 Images</span>' : ''}
                ${data.rcDocumentUrl    ? '<span style="color:var(--primary-light);">📋 RC</span>'     : ''}
                ${data.aadhaarDocumentUrl ? '<span style="color:var(--primary-light);">🪪 Aadhaar</span>' : ''}
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:150px;">
            <select class="status-dropdown" onclick="event.stopPropagation();"
                onchange="quickPoliceStatusUpdate('${id}', this.value, this)">
                ${CHALLAN_STATUSES.map(s=>`<option value="${s}" ${s===(data.status||'Pending')?'selected':''}>${s}</option>`).join('')}
            </select>
            <button class="btn police-btn-primary" style="padding:8px 12px;font-size:12px"
                onclick="event.stopPropagation(); openPoliceModal('${id}')">
                🔍 View Details
            </button>
        </div>
    `;
    el.addEventListener('click', () => openPoliceModal(id));
    return el;
}

// =================================================
// QUICK STATUS UPDATE (inline)
// =================================================
function quickPoliceStatusUpdate(id, status, selectEl) {
    if (!window.firebaseDB) return;
    firebaseDB.collection('challanComplaints').doc(id).update({
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: currentPoliceUser?.email || 'officer'
    }).then(() => {
        logPoliceActivity('status_updated', `Challan #${id.slice(0,6).toUpperCase()} status → ${status}`, id);
    }).catch(err => { showError('Failed to update status: ' + err.message); });
}

// =================================================
// DETAIL MODAL
// =================================================
function openPoliceModal(id) {
    const data = allChallanData.find(d => d.id === id);
    if (!data) {
        // Fetch from Firestore directly
        firebaseDB.collection('challanComplaints').doc(id).get().then(doc => {
            if (doc.exists) {
                const d = { id: doc.id, ...doc.data() };
                allChallanData.push(d);
                openPoliceModal(id);
            }
        });
        return;
    }

    const existingModal = document.getElementById('policeModal');
    if (existingModal) existingModal.remove();

    const ts        = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const updatedTs = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;
    const cfg       = getStatusCfg(data.status || 'Pending');
    const vIcon     = data.vehicleType === 'Two-Wheeler' ? '🛵' : data.vehicleType === 'Four-Wheeler' ? '🚗' : '🚌';

    const imgPanel = (url, label) => url
        ? `<div>
             <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">${label}</div>
             <a href="${url}" target="_blank">
               <img src="${url}" alt="${label}" style="width:100%;height:170px;object-fit:cover;border-radius:10px;border:1px solid var(--border-color);cursor:pointer;transition:.2s;" onmouseover="this.style.opacity=.8" onmouseout="this.style.opacity=1">
             </a>
           </div>`
        : `<div style="height:100px;background:var(--bg-dark);border:1px dashed var(--border-color);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;">${label} — Not uploaded</div>`;

    const docLink = (url, label, icon) => url
        ? `<a href="${url}" target="_blank" style="display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px solid rgba(0,212,255,.3);border-radius:10px;padding:14px;text-decoration:none;color:var(--primary-light);transition:.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='rgba(0,212,255,.3)'">
             <span style="font-size:28px">${icon}</span>
             <div><div style="font-weight:600;font-size:13px;">${label}</div><div style="font-size:11px;color:var(--text-secondary);">Click to view / download</div></div>
           </a>`
        : `<div style="display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px dashed var(--border-color);border-radius:10px;padding:14px;color:var(--text-secondary);">
             <span style="font-size:28px">${icon}</span><div>${label} — Not uploaded</div>
           </div>`;

    const modal = document.createElement('div');
    modal.id = 'policeModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.9);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);animation:fadeIn .3s ease;';
    modal.addEventListener('click', e => { if (e.target === modal) closePoliceModal(); });

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#0d1033,rgba(0,212,255,.04));border:1px solid var(--border-color);border-radius:22px;max-width:980px;width:100%;max-height:93vh;overflow-y:auto;position:relative;box-shadow:0 30px 90px rgba(0,0,0,.7);">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(131,56,236,.1));border-bottom:1px solid var(--border-color);padding:28px 32px;border-radius:22px 22px 0 0;position:sticky;top:0;z-index:10;backdrop-filter:blur(8px);">
                <button onclick="closePoliceModal()" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,.06);border:1px solid var(--border-color);color:var(--text-primary);font-size:20px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:.3s;" onmouseover="this.style.background='rgba(214,40,40,.35)'" onmouseout="this.style.background='rgba(255,255,255,.06)'">×</button>
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <div style="width:52px;height:52px;background:linear-gradient(135deg,#0057b8,#003580);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 4px 16px rgba(0,87,184,.5);">🚔</div>
                    <div style="flex:1;">
                        <h2 style="font-size:20px;color:var(--primary-light);font-weight:700;margin-bottom:8px;">Challan Complaint #CHN-${id.slice(0,6).toUpperCase()}</h2>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <span style="background:rgba(0,212,255,.2);color:var(--primary-light);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid rgba(0,212,255,.3);">${vIcon} ${data.vehicleType || 'Vehicle'}</span>
                            <span style="background:${cfg.bg};color:${cfg.color};padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid ${cfg.border};">${cfg.icon} ${data.status || 'Pending'}</span>
                            <span style="background:rgba(131,56,236,.2);color:#8338ec;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid rgba(131,56,236,.3);">🕒 ${timeAgo(ts)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Body -->
            <div style="padding:32px;">

                <!-- Info Grid -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px;">
                    <div class="police-info-box">
                        <div class="police-info-label">🔢 Challan / Vehicle No.</div>
                        <div class="police-info-value" style="font-family:monospace;letter-spacing:2px;font-size:18px;">${escapeHtml(data.challanNumber||'N/A')}</div>
                    </div>
                    <div class="police-info-box">
                        <div class="police-info-label">👤 Complainant</div>
                        <div class="police-info-value">${escapeHtml(data.authorName||'—')}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(data.authorEmail||'')}</div>
                    </div>
                    <div class="police-info-box">
                        <div class="police-info-label">📅 Submitted</div>
                        <div class="police-info-value">${timeAgo(ts)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${ts.toLocaleString()}</div>
                    </div>
                    ${updatedTs ? `<div class="police-info-box">
                        <div class="police-info-label">🔄 Last Updated</div>
                        <div class="police-info-value">${timeAgo(updatedTs)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${updatedTs.toLocaleString()}</div>
                    </div>` : ''}
                </div>

                <!-- Description -->
                <div style="margin-bottom:28px;">
                    <div class="police-section-label">📝 Complaint Description</div>
                    <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:20px;line-height:1.75;white-space:pre-wrap;color:var(--text-primary);">${escapeHtml(data.description||'No description provided.')}</div>
                </div>

                <!-- Vehicle Photos -->
                <div style="margin-bottom:28px;">
                    <div class="police-section-label">📷 Vehicle Images</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        ${imgPanel(data.vehicleFrontImage, '📷 Front Image')}
                        ${imgPanel(data.vehicleBackImage,  '📷 Back Image')}
                    </div>
                </div>

                <!-- Documents -->
                <div style="margin-bottom:28px;">
                    <div class="police-section-label">📄 Supporting Documents</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        ${docLink(data.rcDocumentUrl,       'RC Certificate', '📋')}
                        ${docLink(data.aadhaarDocumentUrl,  'Aadhaar Card',   '🪪')}
                    </div>
                </div>

                <!-- Current Response -->
                ${data.adminResponse ? `
                <div style="margin-bottom:24px;">
                    <div class="police-section-label">🚔 Current Police Response</div>
                    <div style="background:rgba(0,87,184,.12);border:1px solid rgba(0,87,184,.4);border-left:4px solid #0057b8;border-radius:12px;padding:18px;line-height:1.7;">${escapeHtml(data.adminResponse)}</div>
                </div>` : ''}

                <!-- Action Panel -->
                <div style="border-top:2px solid var(--border-color);padding-top:28px;">
                    <div class="police-section-label" style="margin-bottom:20px;">⚙️ Police Action Center</div>

                    <!-- Status + Assign Row -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                        <div>
                            <label class="form-label" style="margin-bottom:8px;">Update Status</label>
                            <select id="policeModalStatus" class="status-dropdown" style="width:100%;padding:14px;"
                                onchange="document.getElementById('rejectionNoteSection').style.display=this.value==='Rejected'?'block':'none'">
                                ${CHALLAN_STATUSES.map(s=>`<option value="${s}" ${s===(data.status||'Pending')?'selected':''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:flex;align-items:flex-end;">
                            <button class="btn police-btn-primary" style="width:100%;padding:14px;" onclick="applyPoliceModalStatus('${id}')">
                                💾 Apply Status
                            </button>
                        </div>
                    </div>

                    <!-- Response Textarea -->
                    <div style="margin-bottom:16px;">
                        <label class="form-label" style="margin-bottom:8px;">Police Response / Remarks</label>
                        <div class="police-response-templates" style="margin-bottom:10px;">
                            <span style="font-size:12px;color:var(--text-secondary);margin-right:6px;">Quick templates:</span>
                            <button class="police-template-btn" onclick="useTemplate('Your challan has been verified and cancelled. No further action required.')">✅ Cancelled</button>
                            <button class="police-template-btn" onclick="useTemplate('Your complaint is under review. Please wait for further updates.')">🔍 Under Review</button>
                            <button class="police-template-btn" onclick="useTemplate('The provided proof is not sufficient. Please submit clearer documents.')">❌ Insufficient Proof</button>
                            <button class="police-template-btn" onclick="useTemplate('After thorough verification, your challan has been upheld. The violation was confirmed.')">⚠️ Upheld</button>
                        </div>
                        <textarea id="policeModalResponse" class="form-textarea"
                            placeholder="Write your official police response here… " rows="4"
                            style="width:100%;min-height:110px;">${escapeHtml(data.adminResponse||'')}</textarea>
                    </div>

                    <!-- Rejection Note (required when Rejected) -->
                    <div id="rejectionNoteSection" style="margin-bottom:16px;display:${(data.status||'').toLowerCase()==='rejected'?'block':'none'};">
                        <label class="form-label" style="margin-bottom:8px;color:#ff6b6b;">❌ Rejection Reason <span style="color:#d62828;font-weight:800;">*</span> <small style="font-weight:400;color:var(--text-secondary);">(Required when rejecting)</small></label>
                        <textarea id="policeRejectionNote" class="form-textarea"
                            placeholder="Explain why this challan complaint is being rejected…" rows="3"
                            style="width:100%;min-height:90px;border-color:rgba(214,40,40,0.5);"
                        >${escapeHtml(data.rejectionReason||'')}</textarea>
                    </div>

                    <!-- Show existing rejection reason if already rejected -->
                    ${data.rejectionReason ? `
                    <div style="background:linear-gradient(135deg,rgba(214,40,40,0.12),rgba(255,107,107,0.08));border:1px solid rgba(214,40,40,0.4);border-left:4px solid #d62828;border-radius:10px;padding:14px;margin-bottom:16px;">
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#ff6b6b;margin-bottom:6px;">❌ Previous Rejection Reason</div>
                        <div style="font-size:13px;line-height:1.6;">${escapeHtml(data.rejectionReason)}</div>
                    </div>` : ''}

                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <button class="btn police-btn-primary" style="flex:1;min-width:200px;" onclick="sendPoliceResponse('${id}')">
                            📤 Send Response to Citizen
                        </button>
                        <button class="btn btn-secondary" onclick="closePoliceModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closePoliceModal() {
    const m = document.getElementById('policeModal');
    if (m) m.remove();
}

function useTemplate(text) {
    const ta = document.getElementById('policeModalResponse');
    if (ta) ta.value = text;
}

function applyPoliceModalStatus(id) {
    const sel = document.getElementById('policeModalStatus');
    if (!sel) return;
    const newStatus = sel.value;

    // Toggle rejection note visibility
    const rejSection = document.getElementById('rejectionNoteSection');
    if (rejSection) rejSection.style.display = newStatus === 'Rejected' ? 'block' : 'none';

    // Enforce rejection reason when Rejected
    if (newStatus === 'Rejected') {
        const note = (document.getElementById('policeRejectionNote')?.value || '').trim();
        if (!note) {
            showError('❌ A Rejection Reason is required when rejecting a complaint. Please explain why.');
            document.getElementById('policeRejectionNote')?.focus();
            return;
        }
        // Save status + rejectionReason together
        firebaseDB.collection('challanComplaints').doc(id).update({
            status: 'Rejected',
            rejectionReason: note,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: currentPoliceUser?.email || 'officer'
        }).then(() => {
            logPoliceActivity('status_updated', `Challan #${id.slice(0,6).toUpperCase()} REJECTED — ${note.substring(0,60)}`, id);
            showSuccess('Complaint rejected with reason saved.');
            const idx = allChallanData.findIndex(d => d.id === id);
            if (idx > -1) { allChallanData[idx].status = 'Rejected'; allChallanData[idx].rejectionReason = note; }
            closePoliceModal();
        }).catch(err => showError('Failed to update: ' + err.message));
        return;
    }

    quickPoliceStatusUpdate(id, newStatus, sel);
    const idx = allChallanData.findIndex(d => d.id === id);
    if (idx > -1) allChallanData[idx].status = newStatus;
    showSuccess(`Status updated to "${newStatus}"`);
}

function sendPoliceResponse(id) {
    const ta     = document.getElementById('policeModalResponse');
    const status = document.getElementById('policeModalStatus')?.value;
    if (!ta) return;
    const msg = ta.value.trim();
    if (!msg) { showError('Please enter a response message.'); return; }

    // If marking as Rejected, also require rejection reason
    if (status === 'Rejected') {
        const note = (document.getElementById('policeRejectionNote')?.value || '').trim();
        if (!note) {
            showError('❌ Please provide a Rejection Reason before sending the response.');
            document.getElementById('policeRejectionNote')?.focus();
            return;
        }
    }

    const update = {
        adminResponse: msg,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: currentPoliceUser?.email || 'officer'
    };
    if (status) update.status = status;
    if (status === 'Rejected') {
        update.rejectionReason = (document.getElementById('policeRejectionNote')?.value || '').trim();
    }

    firebaseDB.collection('challanComplaints').doc(id).update(update)
        .then(() => {
            logPoliceActivity('response_sent', `Response sent for #CHN-${id.slice(0,6).toUpperCase()}`, id);
            showSuccess('Response sent to citizen successfully!');
            closePoliceModal();
        }).catch(err => showError('Failed to send response: ' + err.message));
}

// =================================================
// ANALYTICS
// =================================================
function loadPoliceAnalytics() {
    const container = document.getElementById('policeAnalyticsContent');
    if (!container || !window.firebaseDB) return;
    container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Loading analytics…</p>';

    firebaseDB.collection('challanComplaints').get().then(snap => {
        const data = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

        const statCounts = { total: data.length, pending:0, review:0, approved:0, rejected:0, resolved:0 };
        const byVehicle  = { 'Two-Wheeler':0, 'Four-Wheeler':0, 'Others':0 };
        const byMonth    = {};
        let resTextimes  = [];

        data.forEach(d => {
            const s = (d.status || 'Pending').toLowerCase();
            if (s === 'pending')      statCounts.pending++;
            else if (s === 'under review') statCounts.review++;
            else if (s === 'approved')  statCounts.approved++;
            else if (s === 'rejected')  statCounts.rejected++;
            else if (s === 'resolved')  statCounts.resolved++;

            byVehicle[d.vehicleType] = (byVehicle[d.vehicleType] || 0) + 1;

            const created = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
            const mk = `${created.getFullYear()}-${String(created.getMonth()+1).padStart(2,'0')}`;
            byMonth[mk] = (byMonth[mk] || 0) + 1;

            if (d.status?.toLowerCase() === 'resolved' && d.updatedAt) {
                const u = d.updatedAt.toDate ? d.updatedAt.toDate() : new Date();
                resTextimes.push((u - created) / 3600000);
            }
        });

        const resRate   = data.length ? ((statCounts.resolved + statCounts.approved) / data.length * 100).toFixed(1) : 0;
        const avgResH   = resTextimes.length ? (resTextimes.reduce((a,b)=>a+b,0)/resTextimes.length).toFixed(1) : '—';

        const barMax = Math.max(...Object.values(byVehicle), 1);
        const vehicleBars = Object.entries(byVehicle).map(([k,v]) => {
            const ico = k === 'Two-Wheeler' ? '🛵' : k === 'Four-Wheeler' ? '🚗' : '🚌';
            const pct = Math.round((v / barMax) * 100);
            return `<div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
                    <span>${ico} ${k}</span><span style="color:var(--primary-light);font-weight:700;">${v}</span>
                </div>
                <div style="background:rgba(0,212,255,.1);border-radius:6px;height:10px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--accent));border-radius:6px;transition:width 1s ease;"></div>
                </div>
            </div>`;
        }).join('');

        const statusColors = { pending:'#fb8500', review:'#ffd60a', approved:'#51cf66', rejected:'#d62828', resolved:'#3a86ff' };
        const pieItems = Object.entries(statCounts).filter(([k])=>k!=='total').map(([k,v])=>{
            const pct = data.length ? (v/data.length*100).toFixed(1) : 0;
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <div style="width:12px;height:12px;border-radius:3px;background:${statusColors[k]};flex-shrink:0;"></div>
                <div style="flex:1;font-size:13px;">${k.charAt(0).toUpperCase()+k.slice(1)}</div>
                <div style="font-weight:700;color:${statusColors[k]};">${v} (${pct}%)</div>
            </div>`;
        }).join('');

        const sortedMonths = Object.keys(byMonth).sort();
        const monthMax = Math.max(...Object.values(byMonth), 1);
        const monthBars = sortedMonths.slice(-6).map(mk => {
            const v = byMonth[mk];
            const h = Math.round((v / monthMax) * 100);
            const label = mk.split('-')[1] + '/' + mk.split('-')[0].slice(2);
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <div style="font-weight:700;font-size:12px;color:var(--primary-light);">${v}</div>
                <div style="width:36px;background:linear-gradient(180deg,var(--primary),var(--accent));border-radius:4px 4px 0 0;height:${h}px;min-height:8px;transition:height 1s;"></div>
                <div style="font-size:11px;color:var(--text-secondary);">${label}</div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <!-- KPI row -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px;">
                <div class="complaints-section" style="text-align:center;padding:20px;">
                    <div style="font-size:36px;font-weight:700;color:var(--primary-light);">${data.length}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Total Complaints</div>
                </div>
                <div class="complaints-section" style="text-align:center;padding:20px;">
                    <div style="font-size:36px;font-weight:700;color:#51cf66;">${resRate}%</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Resolution Rate</div>
                </div>
                <div class="complaints-section" style="text-align:center;padding:20px;">
                    <div style="font-size:36px;font-weight:700;color:#ffd60a;">${avgResH}h</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Avg. Response Time</div>
                </div>
                <div class="complaints-section" style="text-align:center;padding:20px;">
                    <div style="font-size:36px;font-weight:700;color:#fb8500;">${statCounts.pending}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Still Pending</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-bottom:28px;">
                <!-- Vehicle Breakdown -->
                <div class="complaints-section">
                    <div class="section-title police-section-title" style="margin-bottom:20px;">🚗 Vehicle Type Breakdown</div>
                    ${vehicleBars}
                </div>
                <!-- Status Distribution -->
                <div class="complaints-section">
                    <div class="section-title police-section-title" style="margin-bottom:20px;">📊 Status Distribution</div>
                    ${pieItems}
                </div>
            </div>

            <!-- Monthly Trend -->
            <div class="complaints-section">
                <div class="section-title police-section-title" style="margin-bottom:20px;">📅 Monthly Complaint Trend (Last 6 months)</div>
                <div style="display:flex;align-items:flex-end;gap:16px;height:130px;padding:0 10px;">
                    ${monthBars || '<p style="color:var(--text-secondary);">No data yet.</p>'}
                </div>
            </div>
        `;
    }).catch(err => {
        console.error(err);
        container.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;">Error loading analytics.</p>';
    });
}

// =================================================
// ACTIVITY LOG
// =================================================
const policeActivityStore = [];

function logPoliceActivity(type, message, complaintId) {
    if (!window.firebaseDB || !currentPoliceUser) return;
    firebaseDB.collection('policeActivityLog').add({
        type, message, complaintId,
        officerId:    currentPoliceUser.uid,
        officerEmail: currentPoliceUser.email,
        timestamp:    firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('Activity log error:', err));
}

function loadPoliceActivityLog() {
    const container = document.getElementById('policeActivityLog');
    if (!container || !window.firebaseDB) return;
    container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center;">Loading…</p>';

    firebaseDB.collection('policeActivityLog')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snap => {
            if (snap.empty) {
                container.innerHTML = '<p style="color:var(--text-secondary);padding:30px;text-align:center;">No activity recorded yet.</p>';
                return;
            }
            container.innerHTML = snap.docs.map(doc => {
                const d   = doc.data();
                const ts  = d.timestamp?.toDate ? d.timestamp.toDate() : new Date();
                const icon = d.type === 'status_updated' ? '🔄' : d.type === 'response_sent' ? '📤' : '📋';
                return `<div style="display:flex;gap:12px;padding:14px;border-bottom:1px solid var(--border-color);align-items:flex-start;transition:.2s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
                    <span style="font-size:20px;">${icon}</span>
                    <div style="flex:1;">
                        <div style="color:var(--text-primary);font-size:13px;margin-bottom:3px;">${escapeHtml(d.message)}</div>
                        <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(d.officerEmail||'Unknown')} · ${timeAgo(ts)}</div>
                    </div>
                </div>`;
            }).join('');
        }, err => {
            console.error(err);
            container.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;">Error loading activity log.</p>';
        });
}

// =================================================
// EXPORT
// =================================================
function exportPoliceReport() {
    if (!allChallanData.length) {
        showError('No data to export. Please open the All Challans tab first.');
        return;
    }
    const headers = ['Complaint ID', 'Challan/Vehicle No.', 'Vehicle Type', 'Citizen Name', 'Citizen Email', 'Status', 'Submitted', 'Admin Response', 'Description'];
    const rows = allChallanData.map(d => {
        const ts = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : 'N/A';
        return [
            `#CHN-${d.id.slice(0,6).toUpperCase()}`,
            `"${(d.challanNumber||'').replace(/"/g,'""')}"`,
            d.vehicleType || 'N/A',
            `"${(d.authorName||'').replace(/"/g,'""')}"`,
            d.authorEmail || 'N/A',
            d.status || 'Pending',
            ts,
            `"${(d.adminResponse||'').replace(/"/g,'""')}"`,
            `"${(d.description||'').replace(/"/g,'""').substring(0,200)}"`
        ].join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `police_challan_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Report exported successfully!');
}

// =================================================
// SETTINGS
// =================================================
function loadPoliceSettings() {
    const container = document.getElementById('policeSettingsContent');
    if (!container || !currentPoliceUser) return;

    container.innerHTML = `
        <div style="max-width:600px;">
            <div class="complaints-section" style="margin-bottom:24px;">
                <div class="section-title police-section-title" style="margin-bottom:20px;">👮 Officer Profile</div>
                <div class="form-group" style="margin-bottom:16px;">
                    <label class="form-label">First Name</label>
                    <input type="text" id="policeFirstName" class="form-input" value="${escapeHtml(currentPoliceUser.firstName||'')}">
                </div>
                <div class="form-group" style="margin-bottom:16px;">
                    <label class="form-label">Last Name</label>
                    <input type="text" id="policeLastName" class="form-input" value="${escapeHtml(currentPoliceUser.lastName||'')}">
                </div>
                <div class="form-group" style="margin-bottom:20px;">
                    <label class="form-label">Email</label>
                    <input type="text" class="form-input" value="${escapeHtml(currentPoliceUser.email||'')}" readonly style="background:var(--bg-hover);cursor:not-allowed;">
                </div>
                <div class="form-group" style="margin-bottom:20px;">
                    <label class="form-label">Role</label>
                    <input type="text" class="form-input" value="Police Officer" readonly style="background:var(--bg-hover);cursor:not-allowed;color:#0057b8;font-weight:700;">
                </div>
                <button class="btn police-btn-primary" onclick="savePoliceProfile()">💾 Save Profile</button>
            </div>

            <div class="complaints-section">
                <div class="section-title police-section-title" style="margin-bottom:16px;">🔒 Account</div>
                <button class="btn btn-secondary" style="width:100%;padding:14px;" onclick="policeLogout()">🔒 Logout from Portal</button>
            </div>
        </div>
    `;
}

function savePoliceProfile() {
    if (!currentPoliceUser || !window.firebaseDB) return;
    const firstName = document.getElementById('policeFirstName')?.value.trim();
    const lastName  = document.getElementById('policeLastName')?.value.trim();
    if (!firstName || !lastName) { showError('Name cannot be empty.'); return; }

    firebaseDB.collection('users').doc(currentPoliceUser.uid).update({ firstName, lastName })
        .then(() => {
            currentPoliceUser.firstName = firstName;
            currentPoliceUser.lastName  = lastName;
            const nameEl = document.getElementById('officerName');
            if (nameEl) nameEl.textContent = `${firstName} ${lastName}`.trim();
            showSuccess('Profile updated successfully!');
        }).catch(err => showError('Failed to update profile: ' + err.message));
}

// =================================================
// INIT  
// =================================================
document.addEventListener('DOMContentLoaded', () => {
    // Setup nav click listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        const tab = item.dataset.tab;
        if (tab) item.addEventListener('click', e => { e.preventDefault(); switchPoliceTab(tab, item); });
    });
    checkPoliceAuth();
});
