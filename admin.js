// admin.js - FINAL WORKING ADMIN DASHBOARD LOGIC

// ================= GLOBAL STATE =================
let currentAdminUser = null;

const COMPLAINT_STATUSES = [
    'pending',
    'in-progress',
    'resolved',
    'rejected'
];

// ================= HELPERS =================
function _adminShowToast(msg, type) {
    const existing = document.getElementById('adminToastMsg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'adminToastMsg';
    toast.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:99999;
        background:${type === 'error'
            ? 'linear-gradient(135deg,#d62828,#990000)'
            : 'linear-gradient(135deg,var(--primary),var(--primary-dark))'};
        color:#fff; padding:14px 22px; border-radius:12px; font-weight:600;
        font-size:14px; max-width:420px; box-shadow:0 8px 32px rgba(0,0,0,.5);
        border-left:4px solid ${type === 'error' ? '#ff5c5c' : 'var(--accent)'};
        animation:toastSlide .35s cubic-bezier(0.34,1.56,0.64,1);
        display:flex; align-items:center; gap:10px;`;
    toast.innerHTML = `<span style="font-size:20px">${type === 'error' ? '⚠️' : '✅'}</span><span>${msg}</span>`;
    document.body.appendChild(toast);
    if (!document.getElementById('adminToastKeyframe')) {
        const s = document.createElement('style'); s.id = 'adminToastKeyframe';
        s.textContent = '@keyframes toastSlide{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, type === 'error' ? 5000 : 3000);
}

function showError(msg) { console.error(msg); _adminShowToast(msg, 'error'); }
function showSuccess(msg) { console.log(msg); _adminShowToast(msg, 'success'); }

function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ================= NAVIGATION =================
function switchAdminTab(tabName, navItem) {
    document.querySelectorAll('.tab-content')
        .forEach(t => t.style.display = 'none');

    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';

    document.querySelectorAll('.nav-item')
        .forEach(n => n.classList.remove('active'));

    if (navItem) navItem.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Tab-specific loaders
    if (tabName === 'challan-complaints') {
        window.location.href = 'police-dashboard.html';
        return;
    }
}

function filterAdminComplaints(status, btn) {
    document.querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');

    document.querySelectorAll('.admin-complaint-item').forEach(item => {
        item.style.display =
            status === 'all' || item.dataset.status === status
                ? 'flex'
                : 'none';
    });
}

// ================= LOGOUT =================
function adminLogout() {
    firebaseAuth.signOut().finally(() => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
}

// ================= ADMIN STATS =================
function loadAdminStats() {
    const grid = document.getElementById('adminStatsGrid');
    if (!grid || !window.firebaseDB) return;

    grid.innerHTML =
        '<p style="padding:30px;text-align:center;">Loading statistics…</p>';

    firebaseDB.collection('complaints').onSnapshot(snapshot => {
        let stats = {
            total: 0,
            pending: 0,
            inProgress: 0,
            resolved: 0,
            rejected: 0
        };

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.complaintType === 'challan') return; // Ignore challans in general admin

            stats.total++;
            const s = (data.status || 'pending').toLowerCase();
            if (s === 'resolved') stats.resolved++;
            else if (s === 'in-progress') stats.inProgress++;
            else if (s === 'rejected') stats.rejected++;
            else stats.pending++;
        });

        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">📤 Total</div>
                <div class="stat-value">${stats.total}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">⏳ Pending</div>
                <div class="stat-value">${stats.pending}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">🛠 In Progress</div>
                <div class="stat-value">${stats.inProgress}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">✅ Resolved</div>
                <div class="stat-value">${stats.resolved}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">🚫 Rejected</div>
                <div class="stat-value">${stats.rejected}</div>
            </div>
        `;
    });
}

// ================= SYSTEM ACTIVITY LOG =================
function loadActivityLog() {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer || !window.firebaseDB) return;

    logContainer.innerHTML = '<p style="color:var(--text-secondary); padding:20px;">Loading recent activities...</p>';

    // Load activities from both complaints and activity log
    firebaseDB.collection('complaints')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                logContainer.innerHTML = '<p style="color:var(--text-secondary); padding:20px;">No recent activities</p>';
                return;
            }

            const activities = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.complaintType === 'challan') return; // Ignore challans

                const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                activities.push({
                    type: 'complaint_created',
                    message: `New complaint "${data.title || 'Untitled'}" submitted by ${data.authorEmail || 'Unknown'}`,
                    timestamp: ts,
                    complaintId: doc.id
                });
            });

            // Also check for status updates (if we track them)
            firebaseDB.collection('activityLog')
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get()
                .then(activitySnap => {
                    activitySnap.forEach(doc => {
                        const data = doc.data();
                        activities.push({
                            type: data.type || 'activity',
                            message: data.message || 'System activity',
                            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
                            complaintId: data.complaintId
                        });
                    });

                    // Sort by timestamp and display
                    activities.sort((a, b) => b.timestamp - a.timestamp);
                    activities.splice(10); // Keep only 10 most recent

                    displayActivityLog(activities, logContainer);
                })
                .catch(() => {
                    // If activityLog collection doesn't exist, just show complaint activities
                    displayActivityLog(activities, logContainer);
                });
        })
        .catch(err => {
            console.error('Error loading activity log:', err);
            logContainer.innerHTML = '<p style="color:var(--danger); padding:20px;">Error loading activities</p>';
        });
}

function displayActivityLog(activities, container) {
    if (activities.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary); padding:20px;">No recent activities</p>';
        return;
    }

    container.innerHTML = activities.map(activity => {
        const icon = activity.type === 'complaint_created' ? '📋' :
            activity.type === 'status_updated' ? '🔄' :
                activity.type === 'complaint_resolved' ? '✅' :
                    activity.type === 'complaint_rejected' ? '❌' : '📝';

        return `
            <div class="activity-item" style="padding:16px; border-bottom:1px solid var(--border-color); display:flex; gap:12px; align-items:flex-start;">
                <div style="font-size:20px;">${icon}</div>
                <div style="flex:1;">
                    <div style="color:var(--text-primary); margin-bottom:4px;">${activity.message}</div>
                    <div style="color:var(--text-secondary); font-size:12px;">${timeAgo(activity.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function logActivity(type, message, complaintId = null) {
    if (!window.firebaseDB || !currentAdminUser) return;

    firebaseDB.collection('activityLog').add({
        type,
        message,
        complaintId,
        adminId: currentAdminUser.uid,
        adminEmail: currentAdminUser.email,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('Error logging activity:', err));
}

// ================= COMPLAINT UI =================
function createAdminComplaintElement(id, data) {
    const el = document.createElement('div');
    el.className = 'admin-complaint-item complaint-item clickable-complaint';
    el.dataset.status = (data.status || 'pending').toLowerCase();
    el.dataset.complaintId = id;
    el.onclick = () => openComplaintModal(id, data);

    const ts = data.createdAt?.toDate
        ? data.createdAt.toDate()
        : new Date();

    const assignedTo = data.assignedTo || 'Unassigned';
    const priority = data.priority || 'Medium';
    const priorityColor = priority === 'Critical' ? '#d62828' :
        priority === 'High' ? '#fb5607' :
            priority === 'Medium' ? '#3a86ff' : '#00d4ff';

    el.innerHTML = `
        <div class="admin-complaint-details" style="flex:1;">
            <div class="complaint-meta-row" style="display:flex; gap:12px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
                <span class="meta-id" style="color:var(--primary-light); font-weight:600;">#${id.slice(0, 6).toUpperCase()}</span>
                <span class="meta-category" style="background:rgba(0,212,255,.15); padding:4px 10px; border-radius:12px; font-size:12px;">${data.category || 'General'}</span>
                ${data.subCategory ? `<span class="meta-subcategory" style="background:rgba(131,56,236,.15); padding:4px 10px; border-radius:12px; font-size:11px; color:#8338ec;">${data.subCategory}</span>` : ''}
                <span style="background:${priorityColor}20; color:${priorityColor}; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600;">${priority}</span>
            </div>

            <div class="complaint-title" style="font-size:16px; font-weight:600; margin-bottom:6px; cursor:pointer;">
                ${data.title || 'No title'}
            </div>

            <div class="complaint-desc" style="color:var(--text-secondary); font-size:13px; margin-bottom:8px; max-height:60px; overflow:hidden;">
                ${data.description || ''}
            </div>

            <div class="complaint-footer" style="display:flex; gap:16px; font-size:12px; color:var(--text-secondary); flex-wrap:wrap;">
                <span>👤 ${data.authorEmail || 'Unknown'}</span>
                <span>📍 ${data.location || 'N/A'}</span>
                <span>🕒 ${timeAgo(ts)}</span>
                <span>👨‍💼 Assigned: ${assignedTo}</span>
            </div>
        </div>

        <div class="admin-actions" style="display:flex; flex-direction:column; gap:8px; min-width:140px;">
            <select
                class="status-dropdown"
                onclick="event.stopPropagation();"
                onchange="updateComplaintStatus('${id}', this.value)">
                ${COMPLAINT_STATUSES.map(s => `
                    <option value="${s}"
                        ${s === el.dataset.status ? 'selected' : ''}>
                        ${s.replace('-', ' ').toUpperCase()}
                    </option>
                `).join('')}
            </select>
            <button class="btn btn-primary" style="padding:8px 12px; font-size:12px;" onclick="event.stopPropagation(); openComplaintModal('${id}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
                View Details
            </button>
            <button class="btn tracking-btn" style="padding:8px 12px; font-size:12px; background:rgba(0, 212, 255, 0.1); border:1px solid rgba(0, 212, 255, 0.3); color:var(--primary-light); cursor:pointer;" onclick="event.stopPropagation(); openTrackingModal('${id}')">
                📦 View Timeline
            </button>
        </div>
    `;
    return el;
}

// ================= COMPLAINT MODAL =================
function openComplaintModal(id, data) {
    // Close any existing modal
    const existingModal = document.getElementById('complaintModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'complaintModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        backdrop-filter: blur(4px);
    `;
    modal.onclick = (e) => {
        if (e.target === modal) closeComplaintModal();
    };

    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const updatedTs = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;
    const priority = data.priority || 'Medium';
    const priorityColor = priority === 'Critical' ? '#d62828' :
        priority === 'High' ? '#fb5607' :
            priority === 'Medium' ? '#3a86ff' : '#00d4ff';
    const status = (data.status || 'pending').toLowerCase();
    const statusColor = status === 'resolved' ? '#3a86ff' :
        status === 'rejected' ? '#d62828' :
            status === 'in-progress' ? '#fb5607' : '#00d4ff';

    // Format media display
    let mediaHTML = '';
    if (data.media && Array.isArray(data.media) && data.media.length > 0) {
        mediaHTML = `
            <div style="margin-top:24px;">
                <h3 style="font-size:14px; color:var(--text-secondary); margin-bottom:12px; font-weight:600;">📸 Attached Media (${data.media.length})</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px;">
                    ${data.media.map((media, idx) => {
            if (media.type === 'image') {
                return `<div style="position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border-color);">
                                <img src="${media.url}" alt="${media.name || 'Image'}" style="width:100%; height:150px; object-fit:cover; cursor:pointer;" onclick="window.open('${media.url}', '_blank')">
                            </div>`;
            } else if (media.type === 'video') {
                return `<div style="position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border-color);">
                                <video src="${media.url}" controls style="width:100%; height:150px; object-fit:cover;"></video>
                            </div>`;
            }
            return '';
        }).join('')}
                </div>
            </div>
        `;
    }

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--bg-card), rgba(0,212,255,0.05)); border:1px solid var(--border-color); border-radius:20px; max-width:900px; width:100%; max-height:90vh; overflow-y:auto; padding:0; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <!-- Header -->
            <div style="background:linear-gradient(135deg, rgba(0,212,255,0.1), rgba(131,56,236,0.1)); border-bottom:1px solid var(--border-color); padding:24px 32px; border-radius:20px 20px 0 0; position:sticky; top:0; z-index:10;">
                <button onclick="closeComplaintModal()" style="position:absolute; top:20px; right:20px; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); color:var(--text-primary); font-size:20px; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:all 0.3s ease;" onmouseover="this.style.background='rgba(214,40,40,0.3)'; this.style.borderColor='#d62828'" onmouseout="this.style.background='rgba(0,0,0,0.3)'; this.style.borderColor='var(--border-color)'">×</button>
                
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                    <div style="width:48px; height:48px; background:linear-gradient(135deg, var(--primary), var(--accent)); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 12px rgba(0,212,255,0.3);">📋</div>
                    <div style="flex:1;">
                        <h2 style="font-size:26px; margin-bottom:4px; color:var(--primary-light); font-weight:700;">${escapeHtml(data.title || 'Untitled Complaint')}</h2>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                            <span style="background:rgba(0,212,255,.2); color:var(--primary-light); padding:6px 14px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid rgba(0,212,255,0.3);">${escapeHtml(data.category || 'General')}</span>
                            ${data.subCategory ? `<span style="background:rgba(131,56,236,.2); color:#8338ec; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid rgba(131,56,236,0.3);">${escapeHtml(data.subCategory)}</span>` : ''}
                            <span style="background:rgba(131,56,236,.2); color:#8338ec; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid rgba(131,56,236,0.3);">#${id.slice(0, 6).toUpperCase()}</span>
                            <span style="background:${statusColor}20; color:${statusColor}; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid ${statusColor}40; text-transform:uppercase;">${status.replace('-', ' ')}</span>
                            <span style="background:${priorityColor}20; color:${priorityColor}; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:600; border:1px solid ${priorityColor}40;">${priority} Priority</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div style="padding:32px;">
                <!-- Description -->
                <div style="margin-bottom:28px;">
                    <h3 style="font-size:16px; color:var(--primary-light); margin-bottom:12px; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <span>📝</span> Description
                    </h3>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px; color:var(--text-primary); line-height:1.7; white-space:pre-wrap;">${escapeHtml(data.description || 'No description provided')}</div>
                </div>

                ${mediaHTML}

                <!-- Details Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px; margin-bottom:28px;">
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">📂 Category</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${escapeHtml(data.category || 'General')}</div>
                        ${data.subCategory ? `<div style="color:var(--primary-light); font-size:13px; margin-top:4px; font-weight:500;">→ ${escapeHtml(data.subCategory)}</div>` : ''}
                    </div>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">👤 Author</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${escapeHtml(data.authorEmail || 'Unknown')}</div>
                    </div>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">📍 Location</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${escapeHtml(data.location || 'N/A')}</div>
                    </div>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">⚡ Priority</div>
                        <div style="color:${priorityColor}; font-weight:700; font-size:15px;">${priority}</div>
                    </div>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">🕒 Created</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${timeAgo(ts)}</div>
                        <div style="color:var(--text-secondary); font-size:11px; margin-top:4px;">${ts.toLocaleString()}</div>
                    </div>
                    <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">👨‍💼 Assigned To</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${escapeHtml(data.assignedTo || 'Unassigned')}</div>
                    </div>
                    ${updatedTs ? `<div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">🔄 Last Updated</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:15px;">${timeAgo(updatedTs)}</div>
                        <div style="color:var(--text-secondary); font-size:11px; margin-top:4px;">${updatedTs.toLocaleString()}</div>
                    </div>` : ''}
                    ${data.geolocation ? `<div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">🌐 Coordinates</div>
                        <div style="color:var(--text-primary); font-weight:600; font-size:13px;">${data.geolocation.latitude.toFixed(6)}, ${data.geolocation.longitude.toFixed(6)}</div>
                        <a href="https://www.google.com/maps?q=${data.geolocation.latitude},${data.geolocation.longitude}" target="_blank" style="color:var(--primary-light); font-size:11px; text-decoration:none; margin-top:4px; display:inline-block;">View on Map →</a>
                    </div>` : ''}
                </div>

                <!-- Actions -->
                <div style="border-top:2px solid var(--border-color); padding-top:24px; display:flex; gap:12px; flex-wrap:wrap;">
                    <button onclick="assignComplaint('${id}')" class="btn btn-primary" style="flex:1; min-width:140px; padding:14px 20px; font-weight:700;">
                        👤 Assign
                    </button>
                    <button onclick="acceptComplaint('${id}')" class="btn" style="flex:1; min-width:140px; background:rgba(58,134,255,0.2); color:#3a86ff; border:2px solid #3a86ff; padding:14px 20px; font-weight:700;">
                        ✅ Accept
                    </button>
                    <button onclick="rejectComplaint('${id}')" class="btn" style="flex:1; min-width:140px; background:rgba(251,86,7,0.2); color:#fb5607; border:2px solid #fb5607; padding:14px 20px; font-weight:700;">
                        ❌ Reject
                    </button>
                    <button onclick="deleteComplaint('${id}')" class="btn" style="flex:1; min-width:140px; background:rgba(214,40,40,0.2); color:#d62828; border:2px solid #d62828; padding:14px 20px; font-weight:700;">
                        🗑 Delete
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeComplaintModal() {
    const modal = document.getElementById('complaintModal');
    if (modal) modal.remove();
}

function assignComplaint(id) {
    const email = prompt('Enter admin email to assign this complaint:');
    if (!email) return;

    firebaseDB.collection('complaints').doc(id).update({
        assignedTo: email,
        assigneeTo: email,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        statusHistory: firebase.firestore.FieldValue.arrayUnion({
            status: 'under review',
            title: 'Complaint Assigned',
            desc: `Complaint has been assigned to: ${email}`,
            timestamp: new Date(),
            updatedBy: currentAdminUser?.email || 'Admin'
        })
    }).then(() => {
        logActivity('complaint_assigned', `Complaint assigned to ${email}`, id);
        showSuccess('Complaint assigned successfully');
        closeComplaintModal();
        loadAllComplaints();
    }).catch(err => showError(err.message));
}

function acceptComplaint(id) {
    if (!confirm('Accept this complaint and mark as in-progress?')) return;

    firebaseDB.collection('complaints').doc(id).update({
        status: 'in-progress',
        assignedTo: currentAdminUser?.email || 'admin',
        assigneeTo: currentAdminUser?.email || 'admin',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        statusHistory: firebase.firestore.FieldValue.arrayUnion({
            status: 'in-progress',
            title: 'Complaint Accepted',
            desc: `Complaint accepted and marked in-progress by ${currentAdminUser?.email || 'Admin'}.`,
            timestamp: new Date(),
            updatedBy: currentAdminUser?.email || 'Admin'
        })
    }).then(() => {
        logActivity('complaint_accepted', 'Complaint accepted and set to in-progress', id);
        showSuccess('Complaint accepted');
        closeComplaintModal();
        loadAllComplaints();
        loadActivityLog();
    }).catch(err => showError(err.message));
}

function deleteComplaint(id) {
    if (!confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) return;

    firebaseDB.collection('complaints').doc(id).delete()
        .then(() => {
            logActivity('complaint_deleted', 'Complaint deleted by admin', id);
            showSuccess('Complaint deleted');
            closeComplaintModal();
            loadAllComplaints();
            loadActivityLog();
        }).catch(err => showError(err.message));
}

function rejectComplaint(id) {
    const reason = prompt('Enter rejection reason (optional):');

    firebaseDB.collection('complaints').doc(id).update({
        status: 'rejected',
        rejectionReason: reason || 'No reason provided',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        statusHistory: firebase.firestore.FieldValue.arrayUnion({
            status: 'rejected',
            title: 'Complaint Rejected',
            desc: `Rejected: ${reason || 'No reason provided'}`,
            timestamp: new Date(),
            updatedBy: currentAdminUser?.email || 'Admin'
        })
    }).then(() => {
        logActivity('complaint_rejected', `Complaint rejected${reason ? ': ' + reason : ''}`, id);
        showSuccess('Complaint rejected');
        closeComplaintModal();
        loadAllComplaints();
        loadActivityLog();
    }).catch(err => showError(err.message));
}

// ================= LOAD ALL COMPLAINTS =================
let allComplaintsData = [];

function loadAllComplaints() {
    const list = document.getElementById('allComplaintsList');
    if (!list || !window.firebaseDB) return;

    list.innerHTML =
        '<p style="padding:30px;text-align:center;">Loading complaints…</p>';

    firebaseDB.collection('complaints')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            list.innerHTML = '';
            allComplaintsData = [];

            if (snapshot.empty) {
                list.innerHTML =
                    '<p style="text-align:center;">No complaints found</p>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.complaintType === 'challan') return; // Ignore challans

                const complaintData = { id: doc.id, ...data };
                allComplaintsData.push(complaintData);
                list.appendChild(
                    createAdminComplaintElement(doc.id, data)
                );
            });
        });
}

function searchComplaints(query) {
    const list = document.getElementById('allComplaintsList');
    if (!list) return;

    if (!query.trim()) {
        // Show all if search is empty
        list.innerHTML = '';
        allComplaintsData.forEach(complaint => {
            list.appendChild(
                createAdminComplaintElement(complaint.id, complaint)
            );
        });
        return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = allComplaintsData.filter(complaint => {
        const title = (complaint.title || '').toLowerCase();
        const description = (complaint.description || '').toLowerCase();
        const category = (complaint.category || '').toLowerCase();
        const location = (complaint.location || '').toLowerCase();
        const email = (complaint.authorEmail || '').toLowerCase();
        const status = (complaint.status || '').toLowerCase();

        return title.includes(lowerQuery) ||
            description.includes(lowerQuery) ||
            category.includes(lowerQuery) ||
            location.includes(lowerQuery) ||
            email.includes(lowerQuery) ||
            status.includes(lowerQuery);
    });

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-secondary);">No complaints found matching your search</p>';
        return;
    }

    filtered.forEach(complaint => {
        list.appendChild(
            createAdminComplaintElement(complaint.id, complaint)
        );
    });
}

// ================= UPDATE STATUS =================
function updateComplaintStatus(id, status) {
    firebaseDB.collection('complaints')
        .doc(id)
        .update({
            status,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            statusHistory: firebase.firestore.FieldValue.arrayUnion({
                status: status,
                title: `Status Updated`,
                desc: `Status updated to "${status}" by Admin.`,
                timestamp: new Date(),
                updatedBy: currentAdminUser?.email || 'Admin'
            })
        })
        .then(() => {
            logActivity('status_updated', `Complaint status updated to ${status}`, id);
            loadActivityLog();
        })
        .catch(err => {
            console.error(err);
            showError('Failed to update status');
        });
}

// ================= AUTH GUARD =================
function checkAdminAuth() {
    firebaseAuth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        const snap = await firebaseDB
            .collection('users')
            .doc(user.uid)
            .get();

        if (!snap.exists || snap.data().role !== 'admin') {
            alert('Access denied. Admin only.');
            window.location.href = 'dashboard.html';
            return;
        }

        currentAdminUser = user;

        loadAdminStats();
        loadAllComplaints();
        loadActivityLog();
        loadPerformanceMetrics();
        switchAdminTab('overview',
            document.querySelector('[data-tab="overview"]')
        );
    });
}

// ================= PERFORMANCE METRICS =================
function loadPerformanceMetrics() {
    const container = document.getElementById('performanceMetrics');
    if (!container || !window.firebaseDB) return;

    container.innerHTML = '<p style="color:var(--text-secondary);">Loading metrics...</p>';

    firebaseDB.collection('complaints').get().then(snapshot => {
        const complaints = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.complaintType !== 'challan') {
                complaints.push(data);
            }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thisWeek = new Date(today);
        thisWeek.setDate(today.getDate() - 7);
        const thisMonth = new Date(today);
        thisMonth.setMonth(today.getMonth() - 1);

        let todayCount = 0;
        let weekCount = 0;
        let monthCount = 0;
        let resolvedToday = 0;
        let avgResponseTime = 0;
        const responseTimes = [];

        complaints.forEach(comp => {
            const created = comp.createdAt?.toDate ? comp.createdAt.toDate() : new Date();
            const updated = comp.updatedAt?.toDate ? comp.updatedAt.toDate() : null;

            if (created >= today) todayCount++;
            if (created >= thisWeek) weekCount++;
            if (created >= thisMonth) monthCount++;

            if (comp.status === 'resolved' && updated && created >= today) {
                resolvedToday++;
            }

            if (comp.status === 'resolved' && updated) {
                const hours = (updated - created) / (1000 * 60 * 60);
                responseTimes.push(hours);
            }
        });

        avgResponseTime = responseTimes.length > 0
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : 0;

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:12px;">
                <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px; padding:16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:var(--primary-light);">${todayCount}</div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">Today</div>
                </div>
                <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px; padding:16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#3a86ff;">${weekCount}</div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">This Week</div>
                </div>
                <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px; padding:16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#fb5607;">${monthCount}</div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">This Month</div>
                </div>
                <div style="background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px; padding:16px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:#51cf66;">${resolvedToday}</div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">Resolved Today</div>
                </div>
            </div>
            <div style="margin-top:16px; padding:12px; background:var(--bg-dark); border:1px solid var(--border-color); border-radius:8px;">
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">⏱️ Average Response Time</div>
                <div style="font-size:18px; font-weight:700; color:var(--primary-light);">${avgResponseTime}h</div>
            </div>
        `;
    }).catch(err => {
        console.error('Error loading metrics:', err);
        container.innerHTML = '<p style="color:var(--danger);">Error loading metrics</p>';
    });
}

function exportAllComplaints() {
    if (allComplaintsData.length === 0) {
        showError('No complaints to export');
        return;
    }

    const csv = [
        ['ID', 'Title', 'Category', 'Status', 'Priority', 'Location', 'Author', 'Created', 'Description'].join(','),
        ...allComplaintsData.map(c => {
            const created = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : 'N/A';
            return [
                c.id.slice(0, 6),
                `"${(c.title || '').replace(/"/g, '""')}"`,
                c.category || 'N/A',
                c.status || 'pending',
                c.priority || 'Medium',
                `"${(c.location || '').replace(/"/g, '""')}"`,
                c.authorEmail || 'Unknown',
                created,
                `"${(c.description || '').replace(/"/g, '""').substring(0, 100)}"`
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `complaints_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Complaints exported successfully!');
}

function refreshDashboard() {
    loadAdminStats();
    loadAllComplaints();
    loadActivityLog();
    loadPerformanceMetrics();
    showSuccess('Dashboard refreshed!');
}

// ================= REPORTS PAGE =================
function loadReports() {
    const content = document.getElementById('reportsContent');
    if (!content || !window.firebaseDB) return;

    content.innerHTML = '<p style="text-align:center; padding:40px;">Loading reports...</p>';

    firebaseDB.collection('complaints').get().then(snapshot => {
        const complaints = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.complaintType !== 'challan') {
                complaints.push({ id: doc.id, ...data });
            }
        });

        const stats = calculateReportStats(complaints);
        displayReports(stats, complaints, content);
    }).catch(err => {
        console.error('Error loading reports:', err);
        content.innerHTML = '<p style="color:var(--danger); padding:20px;">Error loading reports</p>';
    });
}

function calculateReportStats(complaints) {
    const stats = {
        total: complaints.length,
        byStatus: { pending: 0, 'in-progress': 0, resolved: 0, rejected: 0 },
        byCategory: {},
        byPriority: { Low: 0, Medium: 0, High: 0, Critical: 0 },
        byMonth: {},
        resolutionTime: [],
        avgResolutionTime: 0,
        topCategories: [],
        topLocations: {}
    };

    complaints.forEach(comp => {
        const status = (comp.status || 'pending').toLowerCase();
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        const category = comp.category || 'General';
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

        const priority = comp.priority || 'Medium';
        stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

        const location = comp.location || 'Unknown';
        stats.topLocations[location] = (stats.topLocations[location] || 0) + 1;

        const created = comp.createdAt?.toDate ? comp.createdAt.toDate() : new Date();
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;

        if (status === 'resolved' && comp.updatedAt) {
            const updated = comp.updatedAt.toDate ? comp.updatedAt.toDate() : new Date();
            const days = Math.ceil((updated - created) / (1000 * 60 * 60 * 24));
            stats.resolutionTime.push(days);
        }
    });

    stats.avgResolutionTime = stats.resolutionTime.length > 0
        ? Math.round(stats.resolutionTime.reduce((a, b) => a + b, 0) / stats.resolutionTime.length)
        : 0;

    stats.topCategories = Object.entries(stats.byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, count]) => ({ category: cat, count }));

    return stats;
}

function displayReports(stats, complaints, container) {
    const resolutionRate = stats.total > 0 ? Math.round((stats.byStatus.resolved / stats.total) * 100) : 0;
    const rejectedRate = stats.total > 0 ? Math.round((stats.byStatus.rejected / stats.total) * 100) : 0;
    const progressRate = stats.total > 0 ? Math.round((stats.byStatus['in-progress'] / stats.total) * 100) : 0;
    const pendingRate = stats.total > 0 ? Math.round((stats.byStatus.pending / stats.total) * 100) : 0;

    container.style.padding = '28px';

    // Category bars
    const catColors = ['#00d4ff', '#8338ec', '#ff006e', '#fb5607', '#3a86ff'];
    const catMax = stats.topCategories.length ? stats.topCategories[0].count : 1;
    const catBarsHTML = stats.topCategories.map((item, i) => {
        const pct = Math.round((item.count / catMax) * 100);
        return `<div class="report-status-row">
            <div class="report-status-dot" style="background:${catColors[i % catColors.length]};"></div>
            <div class="report-status-label">${item.category}</div>
            <div class="report-status-bar-wrap"><div class="report-status-bar" style="width:${pct}%;background:${catColors[i % catColors.length]};"></div></div>
            <div class="report-status-count" style="color:${catColors[i % catColors.length]};">${item.count}</div>
        </div>`;
    }).join('');

    // Status bars
    const statusCfg = [
        { key: 'pending', label: 'Pending', color: '#00d4ff', count: stats.byStatus.pending },
        { key: 'in-progress', label: 'In Progress', color: '#fb5607', count: stats.byStatus['in-progress'] },
        { key: 'resolved', label: 'Resolved', color: '#51cf66', count: stats.byStatus.resolved },
        { key: 'rejected', label: 'Rejected', color: '#d62828', count: stats.byStatus.rejected },
    ];
    const statusBarsHTML = statusCfg.map(s => {
        const pct = stats.total > 0 ? Math.round((s.count / stats.total) * 100) : 0;
        return `<div class="report-status-row">
            <div class="report-status-dot" style="background:${s.color};"></div>
            <div class="report-status-label">${s.label}</div>
            <div class="report-status-bar-wrap"><div class="report-status-bar" style="width:${pct}%;background:${s.color};"></div></div>
            <div class="report-status-count" style="color:${s.color};">${s.count} <small style="color:var(--text-secondary);font-weight:400;">(${pct}%)</small></div>
        </div>`;
    }).join('');

    // Monthly bars
    const monthEntries = Object.entries(stats.byMonth).sort().slice(-6);
    const monthMax = monthEntries.length ? Math.max(...monthEntries.map(e => e[1]), 1) : 1;
    const monthGrads = ['linear-gradient(180deg,#00d4ff,#3a86ff)', 'linear-gradient(180deg,#8338ec,#00d4ff)', 'linear-gradient(180deg,#ff006e,#8338ec)', 'linear-gradient(180deg,#fb5607,#ff006e)', 'linear-gradient(180deg,#3a86ff,#51cf66)', 'linear-gradient(180deg,#51cf66,#3a86ff)'];
    const monthBarsHTML = monthEntries.map(([mk, cnt], i) => {
        const hPct = Math.round((cnt / monthMax) * 100);
        const label = new Date(mk + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;">
            <span style="font-size:12px;font-weight:700;color:var(--text-primary);">${cnt}</span>
            <div style="width:100%;background:${monthGrads[i % monthGrads.length]};height:${hPct}%;border-radius:6px 6px 0 0;box-shadow:0 4px 12px rgba(0,212,255,0.25);min-height:4px;"></div>
            <span style="font-size:10px;color:var(--text-secondary);text-align:center;">${label}</span>
        </div>`;
    }).join('');

    // Locations
    const locHTML = renderTopLocations(stats.topLocations);

    container.innerHTML = `
        <!-- KPI Cards -->
        <div class="report-kpi-grid">
            <div class="report-kpi-card kpi-total">
                <div class="report-kpi-icon">📊</div>
                <div class="report-kpi-value" style="color:var(--primary-light);">${stats.total}</div>
                <div class="report-kpi-label">Total Complaints</div>
                <div class="report-kpi-sub">All categories</div>
            </div>
            <div class="report-kpi-card kpi-resolved">
                <div class="report-kpi-icon">✅</div>
                <div class="report-kpi-value" style="color:#51cf66;">${resolutionRate}%</div>
                <div class="report-kpi-label">Resolution Rate</div>
                <div class="report-kpi-sub">${stats.byStatus.resolved} resolved</div>
            </div>
            <div class="report-kpi-card kpi-pending">
                <div class="report-kpi-icon">⏳</div>
                <div class="report-kpi-value" style="color:#ffd60a;">${stats.byStatus.pending}</div>
                <div class="report-kpi-label">Pending</div>
                <div class="report-kpi-sub">${pendingRate}% of total</div>
            </div>
            <div class="report-kpi-card kpi-progress">
                <div class="report-kpi-icon">🛠️</div>
                <div class="report-kpi-value" style="color:#fb5607;">${stats.byStatus['in-progress']}</div>
                <div class="report-kpi-label">In Progress</div>
                <div class="report-kpi-sub">${progressRate}% of total</div>
            </div>
            <div class="report-kpi-card kpi-rejected">
                <div class="report-kpi-icon">🚫</div>
                <div class="report-kpi-value" style="color:#d62828;">${stats.byStatus.rejected}</div>
                <div class="report-kpi-label">Rejected</div>
                <div class="report-kpi-sub">${rejectedRate}% of total</div>
            </div>
            <div class="report-kpi-card kpi-time">
                <div class="report-kpi-icon">⏱️</div>
                <div class="report-kpi-value" style="color:#8338ec;">${stats.avgResolutionTime}d</div>
                <div class="report-kpi-label">Avg Resolution</div>
                <div class="report-kpi-sub">${stats.resolutionTime.length} resolved cases</div>
            </div>
        </div>

        <!-- Charts Grid -->
        <div class="report-chart-grid">
            <div class="report-chart-panel">
                <div class="report-chart-panel-title">📊 Status Distribution</div>
                ${statusBarsHTML}
            </div>
            <div class="report-chart-panel">
                <div class="report-chart-panel-title">📂 Top Categories</div>
                ${catBarsHTML || '<p style="color:var(--text-secondary);">No category data</p>'}
            </div>
        </div>

        <!-- Monthly Trend -->
        <div class="report-chart-panel" style="margin-bottom:20px;">
            <div class="report-chart-panel-title">📅 Monthly Complaint Trend (Last 6 Months)</div>
            <div style="display:flex;align-items:flex-end;gap:12px;height:160px;margin-top:8px;">
                ${monthBarsHTML || '<p style="color:var(--text-secondary);">No monthly data</p>'}
            </div>
        </div>

        <!-- Top Locations -->
        <div class="report-chart-panel">
            <div class="report-chart-panel-title">📍 Top Complaint Locations</div>
            <div style="margin-top:4px;">${locHTML}</div>
        </div>
    `;
}



function renderStatusChart(byStatus) {
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    if (total === 0) return '<p style="color:var(--text-secondary);">No data available</p>';

    const colors = {
        pending: '#00d4ff',
        'in-progress': '#fb5607',
        resolved: '#3a86ff',
        rejected: '#d62828'
    };

    return Object.entries(byStatus).map(([status, count]) => {
        const percent = Math.round((count / total) * 100);
        const color = colors[status] || '#666';
        return `
            <div style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="text-transform:uppercase; font-weight:600;">${status.replace('-', ' ')}</span>
                    <span style="color:var(--text-secondary);">${count} (${percent}%)</span>
                </div>
                <div style="width:100%; height:24px; background:var(--bg-dark); border-radius:12px; overflow:hidden;">
                    <div style="width:${percent}%; height:100%; background:${color}; transition:width 0.5s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCategoryChart(topCategories) {
    if (topCategories.length === 0) return '<p style="color:var(--text-secondary);">No data available</p>';

    const max = Math.max(...topCategories.map(c => c.count));

    return topCategories.map((item, index) => {
        const percent = max > 0 ? Math.round((item.count / max) * 100) : 0;
        const colors = ['#00d4ff', '#8338ec', '#ff006e', '#fb5607', '#3a86ff'];
        return `
            <div style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-weight:600;">${item.category}</span>
                    <span style="color:var(--text-secondary);">${item.count}</span>
                </div>
                <div style="width:100%; height:20px; background:var(--bg-dark); border-radius:10px; overflow:hidden;">
                    <div style="width:${percent}%; height:100%; background:${colors[index % colors.length]}; transition:width 0.5s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPriorityChart(byPriority) {
    const total = Object.values(byPriority).reduce((a, b) => a + b, 0);
    if (total === 0) return '<p style="color:var(--text-secondary);">No data available</p>';

    const colors = { Critical: '#d62828', High: '#fb5607', Medium: '#3a86ff', Low: '#00d4ff' };

    return Object.entries(byPriority).map(([priority, count]) => {
        const percent = Math.round((count / total) * 100);
        return `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                <div style="width:60px; text-align:right; font-weight:600;">${priority}</div>
                <div style="flex:1; height:32px; background:var(--bg-dark); border-radius:16px; overflow:hidden; position:relative;">
                    <div style="width:${percent}%; height:100%; background:${colors[priority]}; transition:width 0.5s ease;"></div>
                    <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:600;">${count}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderMonthlyChart(byMonth) {
    const entries = Object.entries(byMonth).sort().slice(-6);
    if (entries.length === 0) return '<p style="color:var(--text-secondary);">No data available</p>';

    const max = Math.max(...entries.map(e => e[1]), 1);
    const colors = ['#00d4ff', '#8338ec', '#ff006e', '#fb5607', '#3a86ff', '#51cf66'];

    return `
        <div style="display:flex; align-items:flex-end; gap:12px; height:200px; padding:20px 0;">
            ${entries.map(([month, count], index) => {
        const height = Math.round((count / max) * 100);
        const color = colors[index % colors.length];
        const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return `
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <div style="width:100%; background:var(--bg-dark); border-radius:8px 8px 0 0; height:180px; display:flex; align-items:flex-end; position:relative;">
                            <div style="width:100%; background:${color}; height:${height}%; border-radius:8px 8px 0 0; transition:height 0.5s ease; box-shadow:0 4px 12px ${color}40;"></div>
                            <span style="position:absolute; top:-24px; left:50%; transform:translateX(-50%); font-weight:600; font-size:14px; color:var(--text-primary);">${count}</span>
                        </div>
                        <span style="font-size:11px; color:var(--text-secondary); text-align:center; font-weight:600;">${monthName}</span>
                    </div>
                `;
    }).join('')}
        </div>
        <div style="margin-top:16px; padding:12px; background:var(--bg-dark); border-radius:8px; border:1px solid var(--border-color);">
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; font-weight:600;">Legend:</div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                ${entries.map(([month, count], index) => {
        const color = colors[index % colors.length];
        const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' });
        return `<div style="display:flex; align-items:center; gap:6px;">
                        <div style="width:16px; height:16px; background:${color}; border-radius:4px;"></div>
                        <span style="font-size:11px; color:var(--text-secondary);">${monthName}</span>
                    </div>`;
    }).join('')}
            </div>
        </div>
    `;
}

function renderTopLocations(topLocations) {
    const sorted = Object.entries(topLocations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (sorted.length === 0) return '<p style="color:var(--text-secondary);">No location data available</p>';

    return sorted.map(([location, count], index) => `
        <div style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-dark); border-radius:8px; margin-bottom:8px;">
            <span style="width:24px; text-align:center; font-weight:700; color:var(--primary-light);">#${index + 1}</span>
            <span style="flex:1; font-weight:600;">${location}</span>
            <span style="background:rgba(0,212,255,.15); padding:4px 12px; border-radius:12px; font-weight:600;">${count}</span>
        </div>
    `).join('');
}

function exportReport() {
    showSuccess('Report export functionality coming soon!');
}

// ================= SETTINGS PAGE =================
function loadSettings() {
    const content = document.getElementById('settingsContent');
    if (!content || !currentAdminUser || !window.firebaseDB) return;

    content.innerHTML = '<p style="text-align:center; padding:40px;">Loading settings...</p>';

    firebaseDB.collection('users').doc(currentAdminUser.uid).get()
        .then(doc => {
            const userData = doc.exists ? doc.data() : {};
            displaySettings(userData, content);
        })
        .catch(err => {
            console.error('Error loading settings:', err);
            content.innerHTML = '<p style="color:var(--danger); padding:20px;">Error loading settings</p>';
        });
}

function displaySettings(userData, container) {
    container.innerHTML = `
        <div class="settings-section">
            <div class="settings-section-title">👤 Admin Profile</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input type="text" id="adminFirstName" class="form-input" value="${userData.firstName || ''}" placeholder="First Name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input type="text" id="adminLastName" class="form-input" value="${userData.lastName || ''}" placeholder="Last Name">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input type="email" id="adminEmail" class="form-input" value="${currentAdminUser.email || ''}" disabled>
                        <div class="ai-suggestion">📧 Email cannot be changed</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Phone</label>
                        <input type="tel" id="adminPhone" class="form-input" value="${userData.phone || ''}" placeholder="Phone Number">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Admin ID</label>
                        <input type="text" class="form-input" value="${currentAdminUser.uid}" disabled>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Role</label>
                        <input type="text" class="form-input" value="${userData.role || 'admin'}" disabled>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Department</label>
                        <input type="text" id="adminDepartment" class="form-input" value="${userData.department || ''}" placeholder="Department">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Position</label>
                        <input type="text" id="adminPosition" class="form-input" value="${userData.position || ''}" placeholder="Position">
                    </div>
                </div>

                <button class="btn btn-primary" onclick="saveAdminProfile()">💾 Save Profile</button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🔐 Security Settings</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Current Password</label>
                        <input type="password" id="currentPassword" class="form-input" placeholder="Enter current password">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">New Password</label>
                        <input type="password" id="newPassword" class="form-input" placeholder="Enter new password">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Confirm New Password</label>
                        <input type="password" id="confirmNewPassword" class="form-input" placeholder="Confirm new password">
                    </div>
                </div>

                <button class="btn btn-primary" onclick="updateAdminPassword()">🔒 Update Password</button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">⚙ System Configuration</div>
            <div class="settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Auto-assign complaints</label>
                        <select id="autoAssign" class="form-select">
                            <option value="enabled">Enabled</option>
                            <option value="disabled" selected>Disabled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Default priority for new complaints</label>
                        <select id="defaultPriority" class="form-select">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Email notifications</label>
                        <select id="emailNotifications" class="form-select">
                            <option value="enabled" selected>Enabled</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Activity log retention (days)</label>
                        <input type="number" id="logRetention" class="form-input" value="30" min="7" max="365">
                    </div>
                </div>

                <button class="btn btn-primary" onclick="saveSystemConfig()">💾 Save Configuration</button>
            </div>
        </div>
    `;
}

function saveAdminProfile() {
    const firstName = document.getElementById('adminFirstName').value.trim();
    const lastName = document.getElementById('adminLastName').value.trim();
    const phone = document.getElementById('adminPhone').value.trim();
    const department = document.getElementById('adminDepartment').value.trim();
    const position = document.getElementById('adminPosition').value.trim();

    firebaseDB.collection('users').doc(currentAdminUser.uid).update({
        firstName,
        lastName,
        phone,
        department,
        position,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showSuccess('Profile updated successfully!');
    }).catch(err => {
        showError(err.message);
    });
}

function updateAdminPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

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
        currentAdminUser.email,
        currentPassword
    );

    currentAdminUser.reauthenticateWithCredential(credential)
        .then(() => currentAdminUser.updatePassword(newPassword))
        .then(() => {
            showSuccess('Password updated successfully!');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        })
        .catch(err => showError(err.message));
}

function saveSystemConfig() {
    const config = {
        autoAssign: document.getElementById('autoAssign').value,
        defaultPriority: document.getElementById('defaultPriority').value,
        emailNotifications: document.getElementById('emailNotifications').value,
        logRetention: parseInt(document.getElementById('logRetention').value) || 30,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentAdminUser.uid
    };

    firebaseDB.collection('systemConfig').doc('main').set(config, { merge: true })
        .then(() => {
            showSuccess('System configuration saved successfully!');
        })
        .catch(err => {
            showError(err.message);
        });
}

// ================= TAB SWITCHING ENHANCEMENT =================
// Enhance switchAdminTab to load tab content
const originalSwitchAdminTabFunction = switchAdminTab;
switchAdminTab = function (tabName, navItem) {
    originalSwitchAdminTabFunction(tabName, navItem);

    // Load content when switching to specific tabs
    if (tabName === 'reports') {
        setTimeout(() => loadReports(), 100);
    } else if (tabName === 'settings') {
        setTimeout(() => loadSettings(), 100);
    } else if (tabName === 'overview') {
        setTimeout(() => {
            loadActivityLog();
            loadPerformanceMetrics();
        }, 100);
    }
};

// ================= INIT =================
document.addEventListener('DOMContentLoaded', checkAdminAuth);

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
        if (!existing) {
            const ov = document.createElement('div');
            ov.id = overlayId;
            ov.className = 'mobile-overlay visible';
            ov.onclick = () => toggleSidebar();
            document.body.appendChild(ov);
        } else {
            existing.classList.add('visible');
        }
        document.body.style.overflow = 'hidden';
    } else {
        if (existing) existing.classList.remove('visible');
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

// =================================================================
// CHALLAN COMPLAINTS ADMIN — FULL IMPLEMENTATION
// =================================================================

let allChallanData = []; // cache for search/filter
let challanUnsubscribe = null; // Firestore listener handle

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

// ---- Load all challan complaints ----
async function loadChallanComplaints() {
    const list = document.getElementById('challanComplaintsList');
    if (!list || !window.firebaseDB) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">Loading challan complaints…</p>';

    try {
        allChallanData = await fetchMergedChallanDocs();
        list.innerHTML = '';

        if (!allChallanData.length) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px;">No challan complaints found.</p>';
            loadChallanStats([]);
            return;
        }

        loadChallanStats(allChallanData);
        allChallanData.forEach(d => list.appendChild(createChallanComplaintElement(d.id, d)));
    } catch (err) {
        console.error('Challan load error:', err);
        list.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">Error loading challan complaints.</p>';
    }
}

// ---- Challan Stats ----
function loadChallanStats(docs) {
    const grid = document.getElementById('challanStatsGrid');
    if (!grid) return;

    const counts = { total: docs.length, pending: 0, review: 0, approved: 0, rejected: 0, resolved: 0 };
    docs.forEach(d => {
        const s = (d.status || 'Pending').toLowerCase();
        if (s === 'pending') counts.pending++;
        else if (s === 'under review') counts.review++;
        else if (s === 'approved') counts.approved++;
        else if (s === 'rejected') counts.rejected++;
        else if (s === 'resolved') counts.resolved++;
    });

    grid.innerHTML = `
        <div class="stat-card"><div class="stat-label">📋 Total</div><div class="stat-value">${counts.total}</div></div>
        <div class="stat-card"><div class="stat-label">⏳ Pending</div><div class="stat-value" style="color:#fb5607;">${counts.pending}</div></div>
        <div class="stat-card"><div class="stat-label">🔍 Under Review</div><div class="stat-value" style="color:#ffd60a;">${counts.review}</div></div>
        <div class="stat-card"><div class="stat-label">✅ Approved</div><div class="stat-value" style="color:#51cf66;">${counts.approved}</div></div>
        <div class="stat-card"><div class="stat-label">❌ Rejected</div><div class="stat-value" style="color:#d62828;">${counts.rejected}</div></div>
        <div class="stat-card"><div class="stat-label">🏁 Resolved</div><div class="stat-value" style="color:#3a86ff;">${counts.resolved}</div></div>
    `;
}

// ---- Complaint Row Card ----
function createChallanComplaintElement(id, data) {
    const el = document.createElement('div');
    el.className = 'challan-admin-item complaint-item clickable-complaint';
    el.dataset.status = (data.status || 'Pending').toLowerCase().replace(' ', '-');
    el.dataset.challanId = id;
    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const vehicleIcon = data.vehicleType === 'Two-Wheeler' ? '🛵' : data.vehicleType === 'Four-Wheeler' ? '🚗' : '🚌';

    const statusCfg = getChallanStatusConfig(data.status || 'Pending');

    el.innerHTML = `
        <div style="flex:1;">
            <div style="display:flex;gap:10px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">
                <span style="color:var(--primary-light);font-weight:700;font-size:15px;">#CHN-${id.slice(0, 6).toUpperCase()}</span>
                <span style="background:rgba(0,212,255,.15);padding:4px 10px;border-radius:12px;font-size:12px;">${vehicleIcon} ${data.vehicleType || 'Vehicle'}</span>
                <span style="background:${statusCfg.bg};color:${statusCfg.color};padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid ${statusCfg.border};">${data.status || 'Pending'}</span>
            </div>
            <div style="font-weight:600;font-size:15px;margin-bottom:4px;font-family:monospace;letter-spacing:1px;color:var(--primary-light);">${escapeHtml(data.challanNumber || 'N/A')}</div>
            <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px;max-height:48px;overflow:hidden;">${escapeHtml((data.description || '').substring(0, 140))}${(data.description || '').length > 140 ? '…' : ''}</div>
            <div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap;">
                <span>👤 ${escapeHtml(data.authorEmail || 'Unknown')}</span>
                <span>🕒 ${timeAgo(ts)}</span>
                <span>📅 ${ts.toLocaleDateString()}</span>
                ${data.vehicleFrontImage ? '<span style="color:var(--primary-light);">📷 Images attached</span>' : ''}
                ${data.rcDocumentUrl ? '<span style="color:var(--primary-light);">📋 RC attached</span>' : ''}
                ${data.aadhaarDocumentUrl ? '<span style="color:var(--primary-light);">🪪 Aadhaar attached</span>' : ''}
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:160px;">
            <select class="status-dropdown" onclick="event.stopPropagation();"
                onchange="updateChallanStatus('${id}', this.value)">
                ${CHALLAN_STATUSES.map(s => `<option value="${s}" ${s === (data.status || 'Pending') ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <button class="btn btn-primary" style="padding:8px 12px;font-size:12px;"
                onclick="event.stopPropagation(); openChallanModal('${id}')">
                🔍 View Details
            </button>
        </div>
    `;
    el.addEventListener('click', () => openChallanModal(id));
    return el;
}

function getChallanStatusConfig(status) {
    switch ((status || '').toLowerCase()) {
        case 'pending': return { color: '#fb8500', bg: 'rgba(251,133,0,0.15)', border: 'rgba(251,133,0,0.4)' };
        case 'under review': return { color: '#ffd60a', bg: 'rgba(255,214,10,0.15)', border: 'rgba(255,214,10,0.4)' };
        case 'approved': return { color: '#51cf66', bg: 'rgba(81,207,102,0.15)', border: 'rgba(81,207,102,0.4)' };
        case 'rejected': return { color: '#d62828', bg: 'rgba(214,40,40,0.15)', border: 'rgba(214,40,40,0.4)' };
        case 'resolved': return { color: '#3a86ff', bg: 'rgba(58,134,255,0.15)', border: 'rgba(58,134,255,0.4)' };
        default: return { color: '#fb8500', bg: 'rgba(251,133,0,0.15)', border: 'rgba(251,133,0,0.4)' };
    }
}

// ---- Detail Modal ----
function openChallanModal(id) {
    const data = allChallanData.find(d => d.id === id);
    if (!data) return;

    const existingModal = document.getElementById('challanModal');
    if (existingModal) existingModal.remove();

    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const updatedTs = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;
    const statusCfg = getChallanStatusConfig(data.status || 'Pending');
    const vehicleIcon = data.vehicleType === 'Two-Wheeler' ? '🛵' : data.vehicleType === 'Four-Wheeler' ? '🚗' : '🚌';

    const imgBlock = (url, label) => url
        ? `<div>
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;font-weight:600;">${label}</div>
              <a href="${url}" target="_blank">
                <img src="${url}" alt="${label}" style="width:100%;height:160px;object-fit:cover;border-radius:10px;border:1px solid var(--border-color);cursor:pointer;transition:opacity .2s;" onmouseover="this.style.opacity=.8" onmouseout="this.style.opacity=1">
              </a>
           </div>`
        : `<div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:10px;height:100px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;">${label} — Not uploaded</div>`;

    const docBlock = (url, label, icon) => url
        ? `<a href="${url}" target="_blank" style="display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px solid rgba(0,212,255,.3);border-radius:10px;padding:14px 18px;text-decoration:none;color:var(--primary-light);transition:all .2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='rgba(0,212,255,.3)'">
            <span style="font-size:28px;">${icon}</span>
            <div><div style="font-weight:600;font-size:14px;">${label}</div><div style="font-size:11px;color:var(--text-secondary);">Click to view / download</div></div>
           </a>`
        : `<div style="display:flex;align-items:center;gap:10px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:10px;padding:14px 18px;color:var(--text-secondary);">
            <span style="font-size:28px;">${icon}</span>
            <div>${label} — Not uploaded</div>
           </div>`;

    const modal = document.createElement('div');
    modal.id = 'challanModal';
    modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px);animation:fadeIn .3s ease;`;
    modal.addEventListener('click', e => { if (e.target === modal) closeChallanModal(); });

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,var(--bg-card),rgba(0,212,255,.04));border:1px solid var(--border-color);border-radius:20px;max-width:960px;width:100%;max-height:92vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.6);">

            <!-- Modal Header -->
            <div style="background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(131,56,236,.08));border-bottom:1px solid var(--border-color);padding:28px 32px;border-radius:20px 20px 0 0;position:sticky;top:0;z-index:10;">
                <button onclick="closeChallanModal()" style="position:absolute;top:20px;right:20px;background:rgba(0,0,0,.3);border:1px solid var(--border-color);color:var(--text-primary);font-size:20px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all .3s;" onmouseover="this.style.background='rgba(214,40,40,.35)'" onmouseout="this.style.background='rgba(0,0,0,.3)'">×</button>
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <div style="width:52px;height:52px;background:linear-gradient(135deg,var(--primary),var(--accent));border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 4px 16px rgba(0,212,255,.35);">🚔</div>
                    <div style="flex:1;">
                        <h2 style="font-size:22px;color:var(--primary-light);font-weight:700;margin-bottom:8px;">Challan Complaint — #CHN-${id.slice(0, 6).toUpperCase()}</h2>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <span style="background:rgba(0,212,255,.2);color:var(--primary-light);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid rgba(0,212,255,.3);">${vehicleIcon} ${data.vehicleType || 'Vehicle'}</span>
                            <span style="background:${statusCfg.bg};color:${statusCfg.color};padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid ${statusCfg.border};">${data.status || 'Pending'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Body -->
            <div style="padding:32px;">

                <!-- Vehicle & User Info Grid -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
                    <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:18px;">
                        <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🔢 Challan / Vehicle No.</div>
                        <div style="font-size:18px;font-weight:700;color:var(--primary-light);letter-spacing:2px;font-family:monospace;">${escapeHtml(data.challanNumber || 'N/A')}</div>
                    </div>
                    <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:18px;">
                        <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">👤 Complainant</div>
                        <div style="font-size:14px;font-weight:600;">${escapeHtml(data.authorName || '')}</div>
                        <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(data.authorEmail || 'Unknown')}</div>
                    </div>
                    <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:18px;">
                        <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🕒 Submitted</div>
                        <div style="font-size:14px;font-weight:600;">${timeAgo(ts)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">${ts.toLocaleString()}</div>
                    </div>
                    ${updatedTs ? `<div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:18px;">
                        <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🔄 Last Updated</div>
                        <div style="font-size:14px;font-weight:600;">${timeAgo(updatedTs)}</div>
                        <div style="font-size:12px;color:var(--text-secondary);">${updatedTs.toLocaleString()}</div>
                    </div>` : ''}
                </div>

                <!-- Complaint Description -->
                <div style="margin-bottom:28px;">
                    <h3 style="font-size:15px;color:var(--primary-light);font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">📝 Complaint Description</h3>
                    <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:20px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(data.description || 'No description provided.')}</div>
                </div>

                <!-- Vehicle Photos -->
                <div style="margin-bottom:28px;">
                    <h3 style="font-size:15px;color:var(--primary-light);font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">📷 Vehicle Images</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                        ${imgBlock(data.vehicleFrontImage, '📷 Front Image')}
                        ${imgBlock(data.vehicleBackImage, '📷 Back Image')}
                    </div>
                </div>

                <!-- Supporting Documents -->
                <div style="margin-bottom:28px;">
                    <h3 style="font-size:15px;color:var(--primary-light);font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">📄 Supporting Documents</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        ${docBlock(data.rcDocumentUrl, 'RC Certificate', '📋')}
                        ${docBlock(data.aadhaarDocumentUrl, 'Aadhaar Card', '🪪')}
                    </div>
                </div>

                <!-- Admin Response (read current) -->
                ${data.adminResponse ? `
                <div style="margin-bottom:24px;">
                    <h3 style="font-size:15px;color:var(--primary-light);font-weight:700;margin-bottom:12px;">🚔 Current Police Response</h3>
                    <div style="background:rgba(58,134,255,.1);border:1px solid rgba(58,134,255,.4);border-radius:12px;padding:18px;line-height:1.6;color:var(--text-primary);">${escapeHtml(data.adminResponse)}</div>
                </div>` : ''}

                <!-- Actions: Status + Response -->
                <div style="border-top:2px solid var(--border-color);padding-top:24px;">
                    <h3 style="font-size:15px;color:var(--primary-light);font-weight:700;margin-bottom:16px;">⚙️ Update Status & Send Response</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                        <div>
                            <label class="form-label" style="margin-bottom:8px;">Update Status</label>
                            <select id="challanModalStatus" class="status-dropdown" style="width:100%;padding:12px;">
                                ${CHALLAN_STATUSES.map(s => `<option value="${s}" ${s === (data.status || 'Pending') ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:flex;align-items:flex-end;">
                            <button class="btn btn-primary" style="width:100%;padding:12px;" onclick="applyChallanStatusUpdate('${id}')">
                                💾 Update Status
                            </button>
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label class="form-label" style="margin-bottom:8px;">Police Response / Remarks</label>
                        <textarea id="challanModalResponse" class="form-textarea"
                            placeholder="e.g. Your challan has been cancelled after verification. / Proof is not sufficient, please provide…" rows="4"
                            style="width:100%;min-height:100px;">${escapeHtml(data.adminResponse || '')}</textarea>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <button class="btn btn-primary" style="flex:1;min-width:180px;" onclick="sendChallanResponse('${id}')">
                            📤 Send Response to User
                        </button>
                        <button class="btn btn-secondary" onclick="closeChallanModal()">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeChallanModal() {
    const m = document.getElementById('challanModal');
    if (m) m.remove();
}

// ---- Update Status ----
function updateChallanStatus(id, status) {
    updateMergedChallanDoc(id, {
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        logActivity('challan_status_updated', `Challan complaint status updated to ${status}`, id);
    }).catch(err => {
        console.error(err);
        showError('Failed to update challan status: ' + err.message);
    });
}

function applyChallanStatusUpdate(id) {
    const sel = document.getElementById('challanModalStatus');
    if (!sel) return;
    updateChallanStatus(id, sel.value);
    showSuccess(`Status updated to "${sel.value}"`);
}

// ---- Send Admin Response ----
function sendChallanResponse(id) {
    const ta = document.getElementById('challanModalResponse');
    if (!ta) return;
    const msg = ta.value.trim();
    if (!msg) { showError('Please enter a response message before sending.'); return; }

    updateMergedChallanDoc(id, {
        adminResponse: msg,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        logActivity('challan_response_sent', `Police response sent for challan complaint ${id.slice(0, 6).toUpperCase()}`, id);
        showSuccess('Response sent to user successfully!');
        closeChallanModal();
    }).catch(err => {
        console.error(err);
        showError('Failed to send response: ' + err.message);
    });
}

// ---- Filter (status) ----
function filterChallanComplaints(status, btn) {
    document.querySelectorAll('#challanFilterBtns .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.challan-admin-item').forEach(item => {
        const ds = item.dataset.status || '';
        const show = status === 'all' || ds === status || ds === status.replace(' ', '-');
        item.style.display = show ? 'flex' : 'none';
    });
}

// ---- Search ----
function searchChallanComplaints(query) {
    const list = document.getElementById('challanComplaintsList');
    if (!list) return;

    if (!query.trim()) {
        list.innerHTML = '';
        allChallanData.forEach(d => list.appendChild(createChallanComplaintElement(d.id, d)));
        return;
    }

    const q = query.toLowerCase();
    const filtered = allChallanData.filter(d =>
        (d.challanNumber || '').toLowerCase().includes(q) ||
        (d.authorEmail || '').toLowerCase().includes(q) ||
        (d.authorName || '').toLowerCase().includes(q) ||
        (d.vehicleType || '').toLowerCase().includes(q) ||
        (d.status || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    );

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">No matching challan complaints found.</p>';
        return;
    }
    filtered.forEach(d => list.appendChild(createChallanComplaintElement(d.id, d)));
}

// ---- Date Range Filter ----
function filterChallanByDate() {
    const from = document.getElementById('challanDateFrom')?.value;
    const to = document.getElementById('challanDateTo')?.value;
    if (!from && !to) {
        const list = document.getElementById('challanComplaintsList');
        list.innerHTML = '';
        allChallanData.forEach(d => list.appendChild(createChallanComplaintElement(d.id, d)));
        return;
    }

    const fromDate = from ? new Date(from + 'T00:00:00') : null;
    const toDate = to ? new Date(to + 'T23:59:59') : null;

    const filtered = allChallanData.filter(d => {
        const ts = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
        if (fromDate && ts < fromDate) return false;
        if (toDate && ts > toDate) return false;
        return true;
    });

    const list = document.getElementById('challanComplaintsList');
    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">No complaints in selected date range.</p>';
        return;
    }
    filtered.forEach(d => list.appendChild(createChallanComplaintElement(d.id, d)));
}

// ---- Export CSV ----
function exportChallanComplaints() {
    if (allChallanData.length === 0) { showError('No challan complaints to export.'); return; }

    const headers = ['Complaint ID', 'Challan/Vehicle No.', 'Vehicle Type', 'Author Name', 'Author Email', 'Status', 'Submitted', 'Description', 'Admin Response'];
    const rows = allChallanData.map(d => {
        const ts = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : 'N/A';
        return [
            `#CHN-${d.id.slice(0, 6).toUpperCase()}`,
            `"${(d.challanNumber || '').replace(/"/g, '""')}"`,
            d.vehicleType || 'N/A',
            `"${(d.authorName || '').replace(/"/g, '""')}"`,
            d.authorEmail || 'N/A',
            d.status || 'Pending',
            ts,
            `"${(d.description || '').replace(/"/g, '""').substring(0, 200)}"`,
            `"${(d.adminResponse || '').replace(/"/g, '""')}"`
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `challan_complaints_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Challan complaints exported successfully!');
}

