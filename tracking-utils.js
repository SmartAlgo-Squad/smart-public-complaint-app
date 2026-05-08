// tracking-utils.js
// Shared functionality for real-time complaint tracking across user, admin, and police dashboards.

function generateTrackingTimeline(data) {
    const timeline = [];
    
    // Check if status history exists and is not empty
    if (data.statusHistory && Array.isArray(data.statusHistory) && data.statusHistory.length > 0) {
        // Sort history entries chronologically
        const sortedHistory = [...data.statusHistory].sort((a, b) => {
            const ta = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : new Date(0));
            const tb = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp ? new Date(b.timestamp) : new Date(0));
            return ta - tb;
        });

        sortedHistory.forEach((entry, index) => {
            const ts = entry.timestamp?.toDate ? entry.timestamp.toDate() : (entry.timestamp ? new Date(entry.timestamp) : new Date());
            const isLatest = index === sortedHistory.length - 1;
            const statusLower = (entry.status || '').toLowerCase();

            // Select an icon matching the status/transition
            let icon = '📝';
            if (statusLower === 'pending') icon = '📄';
            else if (statusLower === 'under review' || statusLower === 'under-review') icon = '🔍';
            else if (statusLower === 'in-progress' || statusLower === 'in progress') icon = '⚙️';
            else if (statusLower === 'approved' || statusLower === 'resolved') icon = '✅';
            else if (statusLower === 'rejected') icon = '❌';

            timeline.push({
                status: entry.title || entry.status || 'Status Update',
                date: ts,
                desc: entry.desc || 'No description provided.',
                icon: icon,
                completed: true,
                current: isLatest
            });
        });

        // Add a future pending step if the latest state is not a terminal state
        const latestStatus = (sortedHistory[sortedHistory.length - 1].status || '').toLowerCase();
        if (latestStatus !== 'resolved' && latestStatus !== 'rejected' && latestStatus !== 'approved') {
            timeline.push({
                status: 'Awaiting Final Resolution',
                date: null,
                desc: 'Awaiting final verification and closure by authority.',
                icon: '⏳',
                completed: false,
                current: false
            });
        }

        return timeline;
    }

    // Fallback: Compute static timeline for older/legacy complaints
    const s = (data.status || 'pending').toLowerCase();
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
    const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : null);

    timeline.push({
        status: 'Submitted',
        date: createdAt,
        desc: 'Complaint has been received and logged.',
        icon: '📄',
        completed: true,
        current: s === 'pending'
    });

    if (s === 'under review') {
        timeline.push({
            status: 'Under Review',
            date: updatedAt,
            desc: 'Awaiting assignment or initial verification.',
            icon: '🔍',
            completed: true,
            current: true
        });
    } else if (s === 'in-progress' || s === 'resolved' || s === 'rejected') {
        timeline.push({
            status: 'Under Review',
            date: null,
            desc: 'Initial verification completed.',
            icon: '🔍',
            completed: true,
            current: false
        });
    }

    if (s === 'in-progress' || s === 'resolved' || s === 'rejected') {
        timeline.push({
            status: 'In Progress',
            date: (s === 'in-progress') ? updatedAt : null,
            desc: `Assigned to: ${data.assigneeTo || data.assignedTo || 'Authority'}. Actions are being taken.`,
            icon: '⚙️',
            completed: s === 'resolved' || s === 'rejected',
            current: s === 'in-progress'
        });
    }

    if (s === 'resolved') {
        timeline.push({
            status: 'Resolved',
            date: updatedAt,
            desc: `Resolution: ${data.adminResponse || 'Issue has been addressed.'}`,
            icon: '✅',
            completed: true,
            current: true
        });
    } else if (s === 'rejected') {
        timeline.push({
            status: 'Rejected',
            date: updatedAt,
            desc: `Reason: ${data.rejectionReason || data.adminResponse || 'Insufficient details.'}`,
            icon: '❌',
            completed: true,
            current: true
        });
    } else {
        timeline.push({
            status: 'Resolved',
            date: null,
            desc: 'Awaiting final resolution...',
            icon: '✅',
            completed: false,
            current: s === 'in-progress'
        });
    }

    return timeline;
}

window._trackingUnsubscribe = null;

function openTrackingModal(id, isChallan = false) {
    if(!window.firebaseDB) return;
    
    if (window._trackingUnsubscribe) {
        window._trackingUnsubscribe();
        window._trackingUnsubscribe = null;
    }

    const collection = isChallan ? 'challanComplaints' : 'complaints';
    
    window._trackingUnsubscribe = firebaseDB.collection(collection).doc(id).onSnapshot(doc => {
        if (!doc.exists && !isChallan) {
            if (window._trackingUnsubscribe) window._trackingUnsubscribe();
            window._trackingUnsubscribe = firebaseDB.collection('challanComplaints').doc(id).onSnapshot(challanDoc => {
                if (challanDoc.exists) {
                    _showTrackingModal(challanDoc.id, challanDoc.data());
                } else {
                    if(!document.getElementById('trackingModal')) showError('Complaint not found.');
                }
            });
            return;
        }
        
        if (doc.exists) {
            _showTrackingModal(doc.id, doc.data());
        } else {
            if(!document.getElementById('trackingModal')) showError('Complaint not found.');
        }
    }, err => {
        console.error(err);
        showError('Failed to load tracking data.');
    });
}

function _showTrackingModal(id, data) {
    const existing = document.getElementById('trackingModal');
    if (existing) existing.remove();

    const timeline = generateTrackingTimeline(data);
    const isChallan = data.complaintType === 'challan' || data.vehicleType;
    const prefix = isChallan ? 'CHN' : 'CMP';

    const modal = document.createElement('div');
    modal.id = 'trackingModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);animation:fadeIn .3s ease;';
    modal.addEventListener('click', e => { 
        if (e.target === modal) {
            modal.remove(); 
            if(window._trackingUnsubscribe){window._trackingUnsubscribe(); window._trackingUnsubscribe=null;}
        } 
    });

    let timelineHTML = '';
    timeline.forEach(step => {
        const classes = ['tracking-step'];
        if (step.completed) classes.push('completed');
        if (step.current) classes.push('current');
        
        timelineHTML += `
            <div class="${classes.join(' ')}">
                <div class="tracking-icon">${step.icon}</div>
                <div class="tracking-info">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                        <div class="tracking-title">${step.status}</div>
                        ${step.date ? `<div class="tracking-date">${step.date.toLocaleString()}</div>` : ''}
                    </div>
                    <div class="tracking-desc">${step.desc}</div>
                </div>
            </div>
        `;
    });

    modal.innerHTML = `
        <div class="tracking-modal-content">
            <div class="tracking-modal-header">
                <button onclick="document.getElementById('trackingModal').remove(); if(window._trackingUnsubscribe){window._trackingUnsubscribe(); window._trackingUnsubscribe=null;}" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,.06);border:1px solid var(--border-color);color:var(--text-primary);font-size:20px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:.3s;">×</button>
                <div style="display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;background:linear-gradient(135deg,#0057b8,#003580);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 16px rgba(0,87,184,.5);">📦</div>
                    <div>
                        <h2 style="font-size:20px;color:var(--primary-light);font-weight:700;margin-bottom:4px;">Track Complaint</h2>
                        <div style="color:var(--text-secondary);font-size:13px;">ID: #${prefix}-${id.slice(0,6).toUpperCase()}</div>
                    </div>
                </div>
            </div>
            <div class="tracking-timeline">
                ${timelineHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
