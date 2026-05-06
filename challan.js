// challan.js — User-side Vehicle Challan Complaint Logic

// ===============================
// Global State
// ===============================
let challanFrontImageFile = null;
let challanBackImageFile  = null;
let challanRcFile         = null;
let challanAadhaarFile    = null;

const CHALLAN_API_BASE_URL = (() => {
    const override = window.API_BASE_URL || window.__API_BASE_URL__;
    if (override) return override.replace(/\/$/, '');

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:5000';
    }

    return 'https://smart-ai-backend.vercel.app';
})();

// ===============================
// Tab Loader
// ===============================
function loadChallanComplaintTab() {
    // nothing to pre-load; form is static
}

async function loadMyChallanComplaints() {
    const el = document.getElementById('myChallanList');
    if (!el || !window.firebaseDB || !currentUser) {
        if (el) el.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">Please log in to view your challan complaints.</p>';
        return;
    }

    el.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">Loading your challan complaints…</p>';

    try {
        const sources = [
            firebaseDB.collection('complaints').where('authorId', '==', currentUser.uid).get(),
            firebaseDB.collection('challanComplaints').where('authorId', '==', currentUser.uid).get(),
        ];

        const results = await Promise.allSettled(sources);
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

        const docs = Array.from(docsMap.values()).sort((a, b) => {
            const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return tb - ta;
        });

        el.innerHTML = '';
        if (!docs.length) {
            el.innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="font-size:64px;margin-bottom:16px;">🚗</div>
                    <h3 style="color:var(--text-secondary);margin-bottom:8px;">No Challan Complaints Yet</h3>
                    <p style="color:var(--text-secondary);font-size:14px;">Submit a complaint against an incorrect challan using the "Challan Complaint" tab.</p>
                </div>`;
            return;
        }

        docs.forEach(doc => el.appendChild(renderChallanComplaintCard(doc.id, doc)));
    } catch (err) {
        console.error('Error loading challan complaints:', err);
        el.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;">Error loading challan complaints. Please try again.</p>';
    }
}

// ===============================
// Complaint Card (User View)
// ===============================
function renderChallanComplaintCard(id, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'challan-complaint-card';
    wrapper.dataset.status = (data.status || 'Pending').toLowerCase().replace(' ', '-');

    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const status = data.status || 'Pending';
    const statusClass = getChallanStatusClass(status);
    const vehicleTypeIcon = data.vehicleType === 'Two-Wheeler' ? '🛵' : data.vehicleType === 'Four-Wheeler' ? '🚗' : '🚌';

    const adminReplyHTML = data.adminResponse
        ? `<div class="challan-admin-reply">
                <div class="challan-admin-reply-label">🚔 Police Response</div>
                <div class="challan-admin-reply-text">${escapeHtmlChallan(data.adminResponse)}</div>
           </div>`
        : '';

    const rejectionReasonHTML = (data.status || '').toLowerCase() === 'rejected' && data.rejectionReason
        ? `<div class="rejection-reason-banner" style="margin-top:10px;">
                <div class="rejection-reason-label">❌ Rejection Reason</div>
                <div class="rejection-reason-text">${escapeHtmlChallan(data.rejectionReason)}</div>
           </div>`
        : '';

    wrapper.innerHTML = `
        <div class="challan-card-header">
            <div class="challan-card-id-row">
                <span class="challan-id">#CHN-${id.slice(0,6).toUpperCase()}</span>
                <span class="challan-vehicle-type">${vehicleTypeIcon} ${data.vehicleType || 'Vehicle'}</span>
                <span class="challan-status-badge ${statusClass}">${status}</span>
            </div>
            <div class="challan-number-display">Challan / Vehicle No: <strong>${escapeHtmlChallan(data.challanNumber || 'N/A')}</strong></div>
        </div>
        <div class="challan-card-body">
            <div class="challan-desc">${escapeHtmlChallan(data.description || '')}</div>
            <div class="challan-meta">
                <span>🕒 ${timeAgo(ts)}</span>
                <span>📅 ${ts.toLocaleDateString()}</span>
                ${data.vehicleFrontImage ? `<span><a href="${data.vehicleFrontImage}" target="_blank" style="color:var(--primary-light);text-decoration:none;">📷 Front Image</a></span>` : ''}
                ${data.vehicleBackImage  ? `<span><a href="${data.vehicleBackImage}"  target="_blank" style="color:var(--primary-light);text-decoration:none;">📷 Back Image</a></span>`  : ''}
            </div>
            ${adminReplyHTML}
            ${rejectionReasonHTML}
        </div>
    `;
    return wrapper;
}

function getChallanStatusClass(status) {
    switch ((status || '').toLowerCase()) {
        case 'pending':      return 'challan-status-pending';
        case 'under review': return 'challan-status-review';
        case 'approved':     return 'challan-status-approved';
        case 'rejected':     return 'challan-status-rejected';
        case 'resolved':     return 'challan-status-resolved';
        default:             return 'challan-status-pending';
    }
}

function escapeHtmlChallan(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ===============================
// Image / Document Preview Helpers
// ===============================
function setupChallanImageUpload(inputId, previewId, storeKey) {
    const input   = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const maxSize = file.type === 'application/pdf' ? 10 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showError(`File too large. Maximum size is 10 MB.`);
            input.value = '';
            return;
        }

        // Store file reference
        if (storeKey === 'front')   challanFrontImageFile = file;
        if (storeKey === 'back')    challanBackImageFile  = file;
        if (storeKey === 'rc')      challanRcFile         = file;
        if (storeKey === 'aadhaar') challanAadhaarFile    = file;

        // Show preview
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = ev => {
                preview.innerHTML = `
                    <div class="challan-upload-preview-img">
                        <img src="${ev.target.result}" alt="Preview" style="width:100%;height:160px;object-fit:cover;border-radius:10px;border:1px solid var(--border-color);">
                        <div class="challan-preview-filename">${file.name}</div>
                        <button type="button" onclick="clearChallanFile('${inputId}','${previewId}','${storeKey}')" class="challan-clear-btn">✕ Remove</button>
                    </div>`;
            };
            reader.readAsDataURL(file);
        } else {
            // PDF
            preview.innerHTML = `
                <div class="challan-upload-preview-doc">
                    <div style="font-size:40px;margin-bottom:8px;">📄</div>
                    <div class="challan-preview-filename">${file.name}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">PDF Document • ${(file.size/1024).toFixed(1)} KB</div>
                    <button type="button" onclick="clearChallanFile('${inputId}','${previewId}','${storeKey}')" class="challan-clear-btn">✕ Remove</button>
                </div>`;
        }
        preview.style.display = 'block';
    });
}

function clearChallanFile(inputId, previewId, storeKey) {
    const input   = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (input)   input.value = '';
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }

    if (storeKey === 'front')   challanFrontImageFile = null;
    if (storeKey === 'back')    challanBackImageFile  = null;
    if (storeKey === 'rc')      challanRcFile         = null;
    if (storeKey === 'aadhaar') challanAadhaarFile    = null;
}

// ===============================
// Upload File to Cloudinary
// ===============================
async function uploadChallanFile(file) {
    if (!file) return null;
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${CHALLAN_API_BASE_URL}/api/upload`, {
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
// Form Reset
// ===============================
function resetChallanForm() {
    const fields = [
        'challanNumber', 'challanDate', 'challanAuthority', 'challanAmount', 'challanViolation',
        'vehicleRegNumber', 'vehicleOwner', 'vehicleMakeModel', 
        'disputeReason', 'incidentLocation', 'challanDescription',
        'challanFullName', 'challanEmail', 'challanContact', 'challanPriority'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'challanPriority') {
                el.value = 'Medium';
            } else {
                el.value = '';
            }
        }
    });

    // Reset vehicle type & evidence checkboxes
    document.querySelectorAll('input[name="vehicleType"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="evidenceType"]').forEach(cb => cb.checked = false);

    // Reset file uploads
    ['challanFrontInput', 'challanBackInput', 'challanRcInput', 'challanAadhaarInput'].forEach((id, i) => {
        const storeKeys = ['front', 'back', 'rc', 'aadhaar'];
        const previewIds = ['challanFrontPreview', 'challanBackPreview', 'challanRcPreview', 'challanAadhaarPreview'];
        clearChallanFile(id, previewIds[i], storeKeys[i]);
    });
}

// ===============================
// Geolocation
// ===============================
function getChallanLocation() {
    const locInput = document.getElementById('incidentLocation');
    if (!navigator.geolocation) {
        locInput.value = 'Geolocation not supported by browser';
        return;
    }
    locInput.placeholder = 'Fetching location...';
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            locInput.value = `${lat}, ${lng}`;
        },
        error => {
            console.error('Error getting location:', error);
            locInput.value = '';
            locInput.placeholder = 'Location access denied or failed';
        }
    );
}

// ===============================
// Submit Handler
// ===============================
async function handleChallanSubmit() {
    if (!currentUser) {
        showError('Please log in to submit a complaint.');
        return;
    }

    const challanNumber = (document.getElementById('challanNumber')?.value || '').trim();
    const challanDate = (document.getElementById('challanDate')?.value || '').trim();
    const challanAuthority = (document.getElementById('challanAuthority')?.value || '').trim();
    const challanAmount = (document.getElementById('challanAmount')?.value || '').trim();
    const challanViolation = (document.getElementById('challanViolation')?.value || '').trim();

    const vehicleRegNumber = (document.getElementById('vehicleRegNumber')?.value || '').trim();
    const vehicleOwner = (document.getElementById('vehicleOwner')?.value || '').trim();
    const vehicleMakeModel = (document.getElementById('vehicleMakeModel')?.value || '').trim();

    const vehicleTypeEl = document.querySelector('input[name="vehicleType"]:checked');
    const vehicleType   = vehicleTypeEl ? vehicleTypeEl.value : '';

    const disputeReason = (document.getElementById('disputeReason')?.value || '').trim();
    const incidentLocation = (document.getElementById('incidentLocation')?.value || '').trim();
    const description   = (document.getElementById('challanDescription')?.value || '').trim();

    const evidenceTypeEls = document.querySelectorAll('input[name="evidenceType"]:checked');
    const evidenceTypes = Array.from(evidenceTypeEls).map(el => el.value);

    const challanFullName = (document.getElementById('challanFullName')?.value || '').trim();
    const challanEmail = (document.getElementById('challanEmail')?.value || '').trim();
    const challanContact = (document.getElementById('challanContact')?.value || '').trim();
    const challanPriority = (document.getElementById('challanPriority')?.value || 'Medium');

    // Validation
    if (!challanNumber) { showError('Please enter the Challan Number.'); return; }
    if (!vehicleRegNumber) { showError('Please enter the Registration Number.'); return; }
    if (!vehicleType)   { showError('Please select a Vehicle Type.'); return; }
    if (!disputeReason) { showError('Please select a Dispute Reason.'); return; }
    if (!challanFullName) { showError('Please enter your Full Name.'); return; }
    if (!challanContact) { showError('Please enter your Contact Number.'); return; }
    if (!challanFrontImageFile) { showError('Please upload the Front Image of your vehicle.'); return; }
    if (!challanBackImageFile)  { showError('Please upload the Back Image of your vehicle.'); return; }
    if (!description || description.length < 20) { showError('Please describe your complaint (at least 20 characters).'); return; }

    const btn = document.getElementById('challanSubmitBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Uploading files…';

    try {
        const uid     = currentUser.uid;
        const docId   = firebaseDB.collection('challanComplaints').doc().id;

        // Upload files to Cloudinary
        btn.textContent = '⏳ Uploading images…';
        const [frontUrl, backUrl, rcUrl, aadhaarUrl] = await Promise.all([
            uploadChallanFile(challanFrontImageFile),
            uploadChallanFile(challanBackImageFile),
            challanRcFile      ? uploadChallanFile(challanRcFile)      : Promise.resolve(null),
            challanAadhaarFile ? uploadChallanFile(challanAadhaarFile) : Promise.resolve(null),
        ]);

        // Get author name
        btn.textContent = '⏳ Saving complaint…';
        let authorName = challanFullName || currentUser.displayName || '';

        const payload = {
            complaintType: 'challan',
            challanNumber,
            challanDate,
            challanAuthority,
            challanAmount,
            challanViolation,
            vehicleRegNumber,
            vehicleOwner,
            vehicleMakeModel,
            vehicleType,
            disputeReason,
            incidentLocation,
            description,
            evidenceTypes,
            priority: challanPriority,
            vehicleFrontImage: frontUrl,
            vehicleBackImage:  backUrl,
            rcDocumentUrl:     rcUrl,
            aadhaarDocumentUrl: aadhaarUrl,
            status:        'Pending',
            adminResponse: '',
            routedTo:      'police-dashboard',
            department:    'police',
            authorId:      uid,
            authorEmail:   challanEmail || currentUser.email || '',
            authorContact: challanContact,
            authorName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        // Primary write (used by user/admin/police views)
        await firebaseDB.collection('challanComplaints').doc(docId).set(payload);

        // Best-effort mirror write for legacy paths; don't block user flow on permission mismatch.
        firebaseDB.collection('complaints').doc(docId).set(payload).catch(err => {
            console.warn('Optional complaints mirror write failed:', err?.message || err);
        });

        // Success
        showChallanSuccess(docId);
        resetChallanForm();

    } catch (err) {
        console.error('Challan submit error:', err);
        showError('Failed to submit complaint: ' + err.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = '✅ Submit Challan Complaint';
    }
}

function showChallanSuccess(docId) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);
        z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;
        backdrop-filter:blur(6px);animation:fadeIn 0.3s ease;`;
    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,var(--bg-card),rgba(0,212,255,0.07));border:1px solid rgba(0,212,255,0.4);border-radius:20px;max-width:480px;width:100%;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="font-size:72px;margin-bottom:16px;animation:float 2s ease-in-out infinite;">✅</div>
            <h2 style="color:var(--primary-light);font-size:24px;margin-bottom:12px;">Complaint Submitted!</h2>
            <p style="color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">Your challan complaint has been filed successfully and routed to the police portal for review.</p>
            <div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:16px;margin-bottom:24px;">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Complaint ID</div>
                <div style="font-size:20px;font-weight:700;color:var(--primary-light);">#CHN-${docId.slice(0,6).toUpperCase()}</div>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                <button onclick="this.closest('div[style*=fixed]').remove(); switchTab('my-challan-complaints', document.querySelector('[data-tab=my-challan-complaints]'))" class="btn btn-primary">📋 View My Complaints</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn-secondary">Close</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ===============================
// Init (called once DOM is ready)
// ===============================
function initChallanUploads() {
    setupChallanImageUpload('challanFrontInput',   'challanFrontPreview',   'front');
    setupChallanImageUpload('challanBackInput',    'challanBackPreview',    'back');
    setupChallanImageUpload('challanRcInput',      'challanRcPreview',      'rc');
    setupChallanImageUpload('challanAadhaarInput', 'challanAadhaarPreview', 'aadhaar');
}
