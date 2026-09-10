// ============================================================================
// BAITUL HIKMAH — Frontend Application Logic
// Plain vanilla JS. No frameworks, no build step.
// ============================================================================

// STATE (With instant localStorage caching)
let currentUser = JSON.parse(localStorage.getItem('bh_user') || 'null');
let allBooks = JSON.parse(localStorage.getItem('bh_cached_books') || '[]');
let allMembers = JSON.parse(localStorage.getItem('bh_cached_members') || '[]');
let allFeaturedPosts = JSON.parse(localStorage.getItem('bh_cached_reviews') || '[]');
let profileData = JSON.parse(localStorage.getItem('bh_cached_profile') || 'null');
let lastMembersData = allMembers.length ? { members: allMembers } : null;
let lastLiveUpdateData = JSON.parse(localStorage.getItem('bh_cached_liveupdates') || 'null');
let booksLoadedOnce = allBooks.length > 0;
let membersLoadedOnce = allMembers.length > 0;
let featuredLoadedOnce = allFeaturedPosts.length > 0;
let currentExploreFilter = 'all';
let singleBookId = null;
let activeModalBook = null;
let editMetaContext = null;
let pendingBookFiles = [];
let selectedFeaturedBook = null;
let pendingFeaturedImageB64 = '';
let selectedReviewBookFilter = null;

const PAGES = ['auth', 'profile', 'explore', 'members', 'liveupdate', 'reviews', 'featured', 'addbooks'];

// HELPERS
function $(id) { return document.getElementById(id); }

function sortBooksNewestFirst(books) {
  if (!Array.isArray(books)) return [];
  return books.slice().sort((a, b) => {
    const idNumA = parseInt(String(a.bookId || '').replace(/\D/g, ''), 10) || 0;
    const idNumB = parseInt(String(b.bookId || '').replace(/\D/g, ''), 10) || 0;
    if (idNumA !== idNumB) return idNumB - idNumA;
    if (a.createdAt && b.createdAt) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return 0;
  });
}

function driveImg(fileId, fallback) {
  if (!fileId) return fallback || 'https://placehold.co/300x400?text=No+Image';
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = getOrdinalSuffix(dt.getDate());
  const month = dt.toLocaleString('en-US', { month: 'long' });
  const year = dt.getFullYear();
  return `${day} ${month} ${year}`;
}

function timeAgo(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h';
  if (diffSec < 604800) return Math.floor(diffSec / 86400) + 'd';
  return dt.toLocaleDateString();
}

function pickEventIcon(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('level up') || t.includes('reached level')) return '🎉';
  if (t.includes('salam')) return '👋';
  if (t.includes('return')) return '↩️';
  if (t.includes('borrow') && t.includes('sent')) return '📨';
  if (t.includes('borrow') || t.includes('ready')) return '🤝';
  if (t.includes('declined') || t.includes('rejected') || t.includes('cancel')) return '❌';
  if (t.includes('approved')) return '✅';
  if (t.includes('added') || t.includes('library')) return '📚';
  if (t.includes('joined')) return '🌟';
  if (t.includes('hadith')) return '🕌';
  if (t.includes('featured') || t.includes('review')) return '📖';
  return '🔔';
}

// SKELETON LOADERS
function getBookSkeletons() {
  return Array(6).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
}

function getMemberSkeletons() {
  return Array(6).fill(0).map(() => `
    <div class="skeleton-member-card">
      <div class="skeleton-dp"></div>
      <div style="flex:1;">
        <div class="skeleton-line medium" style="margin-bottom:8px;"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
}

function getReviewSkeletons() {
  return Array(6).fill(0).map(() => `
    <div class="skeleton-story-card">
      <div class="skeleton-story-header">
        <div class="skeleton-story-dp"></div>
        <div class="skeleton-line short" style="flex:1;"></div>
      </div>
      <div class="skeleton-line medium"></div>
    </div>
  `).join('');
}

// HIGH PRIORITY NOTIFICATION ALARM SOUND & VIBRATION SYNTHESIZER
let audioCtx = null;
function playNotificationAlarmSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx || audioCtx.state === 'suspended') {
      audioCtx = new AudioContextClass();
    }
    const ctx = audioCtx;
    const now = ctx.currentTime;

    // High urgency multi-stage harmonic alert siren/chime
    const tones = [
      { freq: 880, start: 0, dur: 0.15 },
      { freq: 1320, start: 0.16, dur: 0.18 },
      { freq: 1760, start: 0.36, dur: 0.35 },
      { freq: 1320, start: 0.75, dur: 0.15 },
      { freq: 1760, start: 0.92, dur: 0.45 }
    ];

    tones.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      gain.gain.setValueAtTime(0.001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.85, now + t.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur);
    });
  } catch (err) {
    console.warn('Audio alarm could not play:', err);
  }

  // Intense phone vibration pattern
  if (navigator.vibrate) {
    try {
      navigator.vibrate([350, 100, 450, 100, 500, 100, 500]);
    } catch (e) {}
  }
}

// HEADS-UP NOTIFICATION BANNER LOGIC
let headsUpTimer = null;
function showHeadsUpNotification(title, body, bookId) {
  const banner = $('headsUpNotif');
  if (!banner) return;
  const titleEl = $('headsUpTitle');
  const bodyEl = $('headsUpBody');
  const viewBtn = $('headsUpViewBtn');
  const dismissBtn = $('headsUpDismissBtn');

  if (titleEl) titleEl.textContent = title || 'Baitul Hikmah';
  if (bodyEl) bodyEl.textContent = body || 'You have a new update.';

  banner.classList.remove('hidden');

  if (viewBtn) {
    viewBtn.onclick = () => {
      banner.classList.add('hidden');
      if (bookId) {
        singleBookId = bookId;
        goPage('explore');
      } else {
        $('notifBellBtn').click();
      }
    };
  }

  if (dismissBtn) {
    dismissBtn.onclick = () => {
      banner.classList.add('hidden');
    };
  }

  clearTimeout(headsUpTimer);
  headsUpTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 7000);
}

// DOUBLE-TAP GUARD
const busyKeys = new Set();
async function guardedAction(key, btnEl, fn) {
  if (busyKeys.has(key)) return;
  busyKeys.add(key);
  if (btnEl) { btnEl.classList.add('is-busy'); btnEl.disabled = true; }
  try {
    await fn();
  } catch (err) {
    showToast(err.message || 'Something went wrong.');
  } finally {
    busyKeys.delete(key);
    if (btnEl) { btnEl.classList.remove('is-busy'); btnEl.disabled = false; }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(file, maxKB) {
  maxKB = maxKB || 100;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.85;
        let scale = 0.9;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        function attempt(triesLeft) {
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Could not process image.')); return; }
            const kb = blob.size / 1024;
            if (kb <= maxKB || triesLeft <= 0) {
              const fr = new FileReader();
              fr.onload = () => resolve(fr.result);
              fr.readAsDataURL(blob);
            } else {
              if (quality > 0.3) quality -= 0.15; else scale = Math.max(0.15, scale - 0.15);
              attempt(triesLeft - 1);
            }
          }, 'image/jpeg', quality);
        }
        attempt(14);
      };
      img.onerror = () => reject(new Error('Could not read image.'));
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// API CALL
async function api(action, payload) {
  if (!API_URL || API_URL.indexOf('PASTE_YOUR') !== -1) {
    showToast('Please set your Apps Script URL in config.js');
    throw new Error('API_URL not configured in config.js');
  }
  const body = Object.assign({ action: action }, payload || {});
  if (currentUser) {
    body.userId = body.userId || currentUser.id;
    body.token = currentUser.token;
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function saveSession(user) {
  currentUser = user;
  localStorage.setItem('bh_user', JSON.stringify(user));
  if (typeof startNotificationPolling === 'function') startNotificationPolling();
  if (typeof initPushNotifications === 'function') initPushNotifications();
}
function clearSession() {
  currentUser = null;
  localStorage.removeItem('bh_user');
  if (notifPollInterval) {
    clearInterval(notifPollInterval);
    notifPollInterval = null;
  }
}

function hideBootLoader() {
  $('bootLoader').classList.add('hidden');
}

// ROUTER
function goPage(name) {
  if (location.hash.slice(1) !== name) location.hash = name;
  else renderPage(name);
}

window.addEventListener('hashchange', () => {
  const name = (location.hash || '#profile').slice(1) || 'profile';
  if (PAGES.includes(name)) renderPage(name);
});

function renderPage(name) {
  if (!currentUser && name !== 'auth') name = 'auth';

  PAGES.forEach(p => {
    const el = $('page-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
  });

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });

  const loggedIn = !!currentUser;
  $('topbar').classList.toggle('hidden', !loggedIn);
  $('bottomNav').classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    $('topRightAvatar').src = driveImg(currentUser.dpFileId);
    $('topRightBtn').onclick = () => goPage('profile');
    $('staffPanelBtn').classList.toggle('hidden', !(currentUser && currentUser.isAdmin));
    checkNotifRedDot();
  }

  if (name === 'profile') refreshProfile();
  if (name === 'explore') refreshBooks();
  if (name === 'members') {
    refreshMembers();
    refreshFullLiveUpdates();
  }
  if (name === 'reviews' || name === 'featured') {
    refreshFeaturedPosts();
    if ($('reviewsRedDot')) $('reviewsRedDot').classList.add('hidden');
    if ($('featuredRedDot')) $('featuredRedDot').classList.add('hidden');
    if (allFeaturedPosts.length > 0) {
      localStorage.setItem('bh_seen_featured_id', allFeaturedPosts[0].id);
      localStorage.setItem('bh_seen_review_id', allFeaturedPosts[0].id);
    }
  }

  window.scrollTo(0, 0);
}

// AUTH
function showAuthTab(which) {
  ['loginForm', 'signupForm', 'forgotForm'].forEach(id => $(id).classList.add('hidden'));
  $(which).classList.remove('hidden');
}

$('gotoSignup').onclick = e => { e.preventDefault(); showAuthTab('signupForm'); };
$('gotoLoginFromSignup').onclick = e => { e.preventDefault(); showAuthTab('loginForm'); };
$('gotoForgot').onclick = e => { e.preventDefault(); showAuthTab('forgotForm'); };
$('gotoLoginFromForgot').onclick = e => { e.preventDefault(); showAuthTab('loginForm'); };

$('signupDp').onchange = async () => {
  const f = $('signupDp').files[0];
  if (!f) return;
  try {
    const b64 = await compressImage(f, 100);
    $('signupDpPreview').src = b64;
    $('signupDpPreview').classList.remove('hidden');
  } catch (err) { showToast('Image compression error: ' + err.message); }
};

$('loginForm').onsubmit = (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  guardedAction('login', btn, async () => {
    $('loginError').textContent = '';
    const data = await api('login', {
      identifier: $('loginIdentifier').value.trim(),
      password: $('loginPassword').value
    }).catch(err => { $('loginError').textContent = err.message; throw err; });
    saveSession(data.user);
    goPage('profile');
  });
};

$('sendSignupCodeBtn').onclick = (e) => {
  guardedAction('sendSignupCode', e.target, async () => {
    $('signupError').textContent = '';
    $('signupSuccess').textContent = '';
    const email = $('signupEmail').value.trim();
    if (!email) { $('signupError').textContent = 'Please enter your email address first.'; return; }
    await api('sendSignupCode', { email }).catch(err => { $('signupError').textContent = err.message; throw err; });
    $('signupSuccess').textContent = 'Verification code sent to ' + email + '! Check your inbox.';
  });
};

$('signupForm').onsubmit = (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  guardedAction('signup', btn, async () => {
    $('signupError').textContent = '';
    $('signupSuccess').textContent = '';
    let dpBase64 = '';
    const f = $('signupDp').files[0];
    if (f) dpBase64 = await compressImage(f, 100);

    const data = await api('signup', {
      displayName: $('signupName').value.trim(),
      whatsapp: $('signupWhatsapp').value.trim(),
      email: $('signupEmail').value.trim(),
      verificationCode: $('signupVerificationCode').value.trim(),
      city: $('signupCity').value.trim(),
      area: $('signupArea').value.trim(),
      password: $('signupPassword').value,
      reference: $('signupReference').value.trim(),
      dpBase64: dpBase64
    }).catch(err => { $('signupError').textContent = err.message; throw err; });

    saveSession(data.user);
    goPage('profile');
    if (data.greetingText) {
      $('greetingPopupText').textContent = data.greetingText;
      $('greetingPopupModal').classList.remove('hidden');
    } else {
      showToast('Welcome! Account created.');
    }
  });
};

$('sendResetCodeBtn').onclick = (e) => {
  guardedAction('sendReset', e.target, async () => {
    $('forgotError').textContent = '';
    $('forgotSuccess').textContent = '';
    const email = $('forgotEmail').value.trim();
    if (!email) { $('forgotError').textContent = 'Enter your email first.'; return; }
    await api('forgotPasswordRequest', { email }).catch(err => { $('forgotError').textContent = err.message; throw err; });
    $('forgotSuccess').textContent = 'Code sent! Check your inbox (and spam folder).';
    $('resetStep2').classList.remove('hidden');
  });
};

$('confirmResetBtn').onclick = (e) => {
  guardedAction('confirmReset', e.target, async () => {
    $('forgotError').textContent = '';
    const code = $('resetCode').value.trim();
    const newPassword = $('resetNewPassword').value;
    if (!code || !newPassword) { $('forgotError').textContent = 'Enter the code and a new password.'; return; }
    await api('forgotPasswordReset', {
      email: $('forgotEmail').value.trim(),
      code: code,
      newPassword: newPassword
    }).catch(err => { $('forgotError').textContent = err.message; throw err; });
    showToast('Password reset. Please sign in.');
    showAuthTab('loginForm');
  });
};

$('signOutBtn').onclick = () => {
  clearSession();
  showAuthTab('loginForm');
  goPage('auth');
};

// PROFILE PAGE
function renderProfileView(data) {
  if (!data || !data.profile) return;
  const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const setSrc = (id, val) => { const el = $(id); if (el) el.src = val; };

  setTxt('profileIdNum', data.profile.id || '');
  setTxt('profileDisplayName', data.profile.displayName || '');
  setSrc('profileDpImg', driveImg(data.profile.dpFileId));
  setTxt('profileLevelBadge', 'Lv ' + (data.profile.level != null ? data.profile.level : -1));

  const bioEl = $('profileBioLine');
  if (bioEl) {
    bioEl.textContent = data.profile.bio || 'BIO........';
    bioEl.classList.toggle('hidden', false);
  }

  setTxt('totalSuccessfulBorrows', data.totalSuccessfulBorrows || 0);
  setTxt('totalSuccessfulReturns', data.totalSuccessfulReturns || 0);
  setTxt('hadithStripText', data.todayHadith || '');

  const hadithEl = $('hadithStrip');
  if (hadithEl) hadithEl.classList.toggle('hidden', !data.todayHadith);

  setTxt('myBooksCount', data.profile.myBooksCount || 0);
  setTxt('borrowedCount', data.profile.borrowedCount || 0);
  setTxt('lentOutCount', data.profile.lentOutCount || 0);
  setTxt('cubeBookCount', data.totalBooksCount || (allBooks ? allBooks.length : 0));
  setTxt('cubeMemberCount', data.totalMembersCount || (allMembers ? allMembers.length : 0));

  renderRequestFeed('incomingRequestsList', data.incomingRequests, 'incoming');
  renderRequestFeed('outgoingRequestsList', data.outgoingRequests, 'outgoing');
  renderRequestFeed('borrowedList', data.borrowedBooks, 'borrowed');
  renderRequestFeed('lentOutList', data.lentOutBooks, 'lentout');
  renderRequestFeed('returnRequestsList', data.returnRequests, 'return');
}

async function refreshProfile() {
  if (!currentUser) return;

  // 1. Instantly render from local cache if available (0ms delay)
  if (profileData) {
    renderProfileView(profileData);
  } else {
    // If no cache, populate initial preview from currentUser
    const initialProfile = {
      profile: {
        id: currentUser.id || '',
        displayName: currentUser.displayName || '',
        dpFileId: currentUser.dpFileId || '',
        level: currentUser.level != null ? currentUser.level : 1,
        bio: currentUser.bio || '',
        myBooksCount: 0,
        borrowedCount: 0,
        lentOutCount: 0,
      },
      totalSuccessfulBorrows: 0,
      totalSuccessfulReturns: 0,
      todayHadith: '',
      totalBooksCount: allBooks ? allBooks.length : 0,
      totalMembersCount: allMembers ? allMembers.length : 0,
      incomingRequests: [],
      outgoingRequests: [],
      borrowedBooks: [],
      lentOutBooks: [],
      returnRequests: []
    };
    renderProfileView(initialProfile);
  }

  // 2. Add pulsing visual shimmer effect to show background sync is running
  const profileCard = document.querySelector('.profile-header-card');
  const totalsStrip = $('totalsStrip');
  if (profileCard) profileCard.classList.add('profile-updating-pulse');
  if (totalsStrip) totalsStrip.classList.add('profile-updating-pulse');

  try {
    const data = await api('getProfile', {});
    profileData = data;
    localStorage.setItem('bh_cached_profile', JSON.stringify(data));
    renderProfileView(data);
  } catch (err) {
    showToast(err.message);
  } finally {
    if (profileCard) profileCard.classList.remove('profile-updating-pulse');
    if (totalsStrip) totalsStrip.classList.remove('profile-updating-pulse');
  }
}

function renderRequestFeed(containerId, items, kind) {
  const el = $(containerId);
  const sectionMap = {
    incoming: 'incomingRequestsSection', outgoing: 'outgoingRequestsSection',
    borrowed: 'borrowedSection', lentout: 'lentOutSection', return: 'returnRequestsSection'
  };
  const section = $(sectionMap[kind]);

  if (!items || !items.length) {
    if (section) section.classList.add('hidden');
    return;
  }
  if (section) section.classList.remove('hidden');

  el.classList.remove('empty-hint');
  el.innerHTML = items.map(r => {
    let actions = '';
    if (kind === 'incoming') {
      actions = `<div class="req-card-actions">
        <button class="req-approve" onclick="event.stopPropagation(); approveRequest(this,'${r.requestId}')">Approve</button>
        <button class="req-cancel" onclick="event.stopPropagation(); rejectRequest(this,'${r.requestId}')">Cancel</button>
      </div>`;
    } else if (kind === 'outgoing') {
      actions = `<div class="req-card-actions">
        <button class="req-cancel" onclick="event.stopPropagation(); cancelMyRequest(this,'${r.requestId}')">Cancel req</button>
      </div>`;
    } else if (kind === 'borrowed') {
      const label = r.status === 'return_pending' ? 'Return requested' : 'Give back now';
      actions = `<div class="req-card-actions">
        <button class="req-cancel" ${r.status === 'return_pending' ? 'disabled' : ''} onclick="event.stopPropagation(); requestReturn(this,'${r.requestId}')">${label}</button>
      </div>`;
    } else if (kind === 'return') {
      actions = `<div class="req-card-actions">
        <button class="req-approve" onclick="event.stopPropagation(); confirmReturn(this,'${r.requestId}')">Confirm returned</button>
      </div>`;
    }
    const dateOrBlank = (label, d) => formatDate(d) ? ` · ${label} ${formatDate(d)}` : '';
    const personLine = kind === 'incoming'
      ? `From ${r.requesterName || 'Unknown'} · asked for ${r.durationDays} days${dateOrBlank('requested', r.requestDate)}`
      : kind === 'outgoing'
      ? `Owner: ${r.ownerName || 'Unknown'} · asked for ${r.durationDays} days${dateOrBlank('requested', r.requestDate)}`
      : kind === 'return'
      ? `Borrower: ${r.requesterName || 'Unknown'}${dateOrBlank('asked to return', r.returnRequestedDate)}`
      : kind === 'lentout'
      ? `Borrower: ${r.requesterName || 'Unknown'}${dateOrBlank('since', r.approvedDate)}${dateOrBlank('due', r.dueDate)}`
      : `Owner: ${r.ownerName || 'Unknown'}${dateOrBlank('since', r.approvedDate)}${r.daysLeft != null ? ' · ' + r.daysLeft + ' days left' : ''}`;
    return `<div class="req-card" onclick="viewBookFromProfile('${r.bookId}')">
      <img src="${driveImg(r.imageFileId)}" alt="">
      <div class="req-card-body">
        <div class="name">${escapeHtml(r.bookName || 'Untitled book')}</div>
        <div class="meta">${escapeHtml(personLine)}</div>
      </div>
      ${actions}
    </div>`;
  }).join('');
}

window.viewBookFromProfile = (bookId) => {
  singleBookId = bookId;
  goPage('explore');
};

window.approveRequest = (btn, id) => guardedAction('approve-' + id, btn, async () => {
  btn.closest('.req-card').remove();
  await api('approveRequest', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Request approved.');
  refreshProfile();
});
window.rejectRequest = (btn, id) => guardedAction('reject-' + id, btn, async () => {
  btn.closest('.req-card').remove();
  await api('rejectRequest', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Request cancelled.');
  refreshProfile();
});
window.cancelMyRequest = (btn, id) => guardedAction('cancelreq-' + id, btn, async () => {
  btn.closest('.req-card').remove();
  await api('cancelMyRequest', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Request withdrawn.');
  refreshProfile();
});
window.requestReturn = (btn, id) => guardedAction('return-' + id, btn, async () => {
  btn.textContent = 'Return requested';
  btn.disabled = true;
  await api('requestReturn', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Return requested — waiting for owner to confirm.');
  refreshProfile();
});
window.confirmReturn = (btn, id) => guardedAction('confirmreturn-' + id, btn, async () => {
  btn.closest('.req-card').remove();
  await api('confirmReturn', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Return confirmed — book is available again.');
  refreshProfile();
});

if ($('exploreCube')) $('exploreCube').onclick = () => { currentExploreFilter = 'all'; singleBookId = null; goPage('explore'); };
if ($('membersCube')) $('membersCube').onclick = () => goPage('members');
if ($('addBookCta')) $('addBookCta').onclick = () => goPage('addbooks');

document.querySelectorAll('#detailSquares .square-btn').forEach(btn => {
  btn.onclick = () => {
    singleBookId = null;
    currentExploreFilter = btn.dataset.filter === 'mine' ? 'mine'
      : btn.dataset.filter === 'borrowed' ? 'borrowed' : 'lent';
    goPage('explore');
  };
});

// EXPLORE PAGE
async function refreshBooks() {
  const isFirstLoad = !booksLoadedOnce;
  if (isFirstLoad) $('bookGrid').innerHTML = getBookSkeletons();
  else renderBookGrid();

  try {
    const data = await api('listBooks', {});
    allBooks = sortBooksNewestFirst(data.books || []);
    booksLoadedOnce = true;
    localStorage.setItem('bh_cached_books', JSON.stringify(allBooks));

    const totalEl = $('exploreTotalCount');
    if (totalEl) totalEl.textContent = allBooks.length;

    if (singleBookId) {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    } else {
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === currentExploreFilter));
    }
    renderBookGrid();

    if (singleBookId) {
      const b = allBooks.find(x => x.bookId === singleBookId);
      if (b) openBookModal(singleBookId);
    }
  } catch (err) {
    if (isFirstLoad) { showToast(err.message); $('bookGrid').innerHTML = ''; }
  }
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.onclick = () => {
    singleBookId = null;
    currentExploreFilter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderBookGrid();
  };
});

$('bookSearch').oninput = () => { singleBookId = null; renderBookGrid(); };
$('filterBtn').onclick = () => $('filterChips').scrollIntoView({ behavior: 'smooth' });

function renderBookGrid() {
  const q = $('bookSearch').value.trim().toLowerCase();
  let list = allBooks.slice();

  if (singleBookId) {
    list = list.filter(b => b.bookId === singleBookId);
  } else {
    if (currentExploreFilter === 'mine') {
      list = list.filter(b => b.isMine);
    } else if (currentExploreFilter === 'lent') {
      const lentOutIds = (profileData && profileData.lentOutBooks || []).map(r => r.bookId);
      list = list.filter(b => b.isMine && (b.status === 'borrowed' || (b.status !== 'available' && !b.isPdf) || !!b.borrowerName || lentOutIds.includes(b.bookId)));
    } else if (currentExploreFilter === 'requesting') {
      const outgoingIds = (profileData && profileData.outgoingRequests || []).map(r => r.bookId);
      list = list.filter(b => !!b.myPendingRequestId || outgoingIds.includes(b.bookId));
    } else if (currentExploreFilter === 'requested') {
      const incomingIds = (profileData && profileData.incomingRequests || []).map(r => r.bookId);
      list = list.filter(b => b.isMine && incomingIds.includes(b.bookId));
    } else if (currentExploreFilter === 'borrowed') {
      const borrowedIds = (profileData && profileData.borrowedBooks || []).map(r => r.bookId);
      list = list.filter(b => borrowedIds.includes(b.bookId));
    }
    if (q) list = list.filter(b =>
      String(b.bookName || '').toLowerCase().includes(q) ||
      String(b.writer || '').toLowerCase().includes(q) ||
      String(b.publisher || '').toLowerCase().includes(q) ||
      String(b.ownerName || '').toLowerCase().includes(q)
    );
  }

  const grid = $('bookGrid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-hint">No books match your criteria.</p>';
    return;
  }
  grid.innerHTML = list.map(b => {
    const isPdf = b.isPdf || (b.downloadLink && b.downloadLink.length > 5);
    const pdfBadge = isPdf ? `<span class="pdf-badge">PDF</span>` : '';
    const statusText = isPdf
      ? 'PDF Book'
      : (b.status === 'available'
          ? 'Available'
          : 'Unavailable till ' + formatDate(b.dueDate) + (b.borrowerName ? ' · with ' + escapeHtml(b.borrowerName) : ''));
    const statusClass = isPdf ? 'available' : (b.status === 'available' ? 'available' : 'unavailable');
    const pageBadge = b.pageCount ? `<div class="page-count-badge">${escapeHtml(String(b.pageCount))}p</div>` : '';

    return `<div class="book-card" onclick="openBookModal('${b.bookId}')">
      <div class="book-cover-wrap" style="position:relative;">
        <img src="${driveImg(b.imageFileId)}" alt="">
        <div class="book-cover-badges">
          ${pageBadge}
          ${pdfBadge}
        </div>
      </div>
      <div class="book-card-body">
        <div class="name">${escapeHtml(b.bookName || 'Untitled')}</div>
        <div class="sub">${escapeHtml(b.writer || '')}</div>
        <div class="sub">Owner: ${escapeHtml(b.ownerName || '')}</div>
        <div class="book-status ${statusClass}">${statusText}</div>
      </div>
    </div>`;
  }).join('');
}

// BOOK DETAIL MODAL
window.openBookModal = (bookId) => {
  const b = allBooks.find(x => x.bookId === bookId);
  if (!b) return;
  activeModalBook = b;
  $('bookModal').classList.remove('hidden');

  try {
    $('modalImage').src = driveImg(b.imageFileId);
    $('modalBookName').textContent = b.bookName || 'Untitled book';
    $('modalWriter').textContent = 'Writer: ' + (b.writer || '—');
    $('modalPublisher').textContent = 'Publisher: ' + (b.publisher || '—') + (b.pageCount ? ' · ' + b.pageCount + ' pages' : '');
    $('modalOwner').textContent = 'Owner: ' + (b.ownerName || '');

    const locationText = [b.ownerCity, b.ownerArea].filter(Boolean).join(', ');
    const locEl = $('modalOwnerLocation');
    if (locEl) {
      locEl.textContent = locationText ? 'Location: ' + locationText : '';
      locEl.classList.toggle('hidden', !locationText);
    }

    const isPdfBook = b.isPdf || (b.downloadLink && b.downloadLink.length > 5);
    const pdfBtn = $('modalDownloadPdfBtn');
    if (pdfBtn) {
      pdfBtn.classList.toggle('hidden', !isPdfBook);
      if (isPdfBook) {
        pdfBtn.href = b.downloadLink || '#';
        pdfBtn.onclick = () => {
          if (b.downloadLink) {
            api('logPdfDownload', { bookId: b.bookId }).catch(() => {});
          } else {
            showToast('PDF download link not provided by owner.');
          }
        };
      }
    }

    // Review actions on Book Detail Modal (#3)
    const matchingReviews = allFeaturedPosts.filter(p =>
      (p.bookId && String(p.bookId) === String(b.bookId)) ||
      (p.bookName && b.bookName && String(p.bookName).trim().toLowerCase() === String(b.bookName).trim().toLowerCase())
    );

    const seeReviewsBtn = $('modalSeeReviewsBtn');
    const reviewsBadge = $('modalReviewsCountBadge');
    const addReviewBtn = $('modalAddReviewBtn');

    if (seeReviewsBtn && reviewsBadge) {
      if (matchingReviews.length > 0) {
        seeReviewsBtn.classList.remove('hidden');
        reviewsBadge.textContent = matchingReviews.length;
        seeReviewsBtn.onclick = () => {
          $('bookModal').classList.add('hidden');
          selectedReviewBookFilter = b;
          goPage('reviews');
        };
      } else {
        seeReviewsBtn.classList.add('hidden');
      }
    }

    if (addReviewBtn) {
      addReviewBtn.onclick = () => {
        $('bookModal').classList.add('hidden');
        goPage('reviews');
        setTimeout(() => {
          openAddReviewForBook(b);
        }, 50);
      };
    }

    renderModalStatusArea(b);
  } catch (err) {
    showToast('Could not load full details.');
  }
};

function renderModalStatusArea(b) {
  const statusEl = $('modalStatus');
  const borrowArea = $('modalBorrowArea');
  const cancelBtn = $('modalCancelReqBtn');
  const deleteBtn = $('modalDeleteBtn');
  const editIcon = $('modalEditIconBtn');
  const waBtn = $('modalWhatsappBtn');

  borrowArea.classList.add('hidden');
  cancelBtn.classList.add('hidden');
  deleteBtn.classList.add('hidden');
  editIcon.classList.add('hidden');
  waBtn.classList.add('disabled');
  waBtn.removeAttribute('href');

  const isPdfBook = b.isPdf || (b.downloadLink && String(b.downloadLink).trim().length > 5);

  if (isPdfBook) {
    waBtn.classList.add('hidden');
  } else {
    waBtn.classList.remove('hidden');
  }

  if (b.isMine) {
    editIcon.classList.remove('hidden');
    statusEl.textContent = isPdfBook
      ? 'This is your PDF book.'
      : (b.status === 'available'
          ? 'This is your book — available.'
          : 'Currently lent out' + (b.borrowerName ? ' to ' + b.borrowerName : '') + ' — due ' + formatDate(b.dueDate));
    deleteBtn.classList.remove('hidden');
  } else if (isPdfBook) {
    statusEl.textContent = 'Digital PDF edition available for instant download.';
  } else if (b.status !== 'available') {
    statusEl.textContent = 'Unavailable till ' + formatDate(b.dueDate) + (b.borrowerName ? ' · with ' + b.borrowerName : '');
  } else if (b.myPendingRequestId) {
    statusEl.textContent = 'You already requested this book.';
    cancelBtn.classList.remove('hidden');
    if (b.ownerWhatsapp) waBtn.classList.remove('disabled');
  } else {
    statusEl.textContent = 'Available to borrow.';
    borrowArea.classList.remove('hidden');
  }
}

if ($('closeModalBtn')) $('closeModalBtn').onclick = () => $('bookModal').classList.add('hidden');
if ($('bookModal') && $('bookModal').querySelector('.modal-backdrop')) {
  $('bookModal').querySelector('.modal-backdrop').onclick = () => $('bookModal').classList.add('hidden');
}

if ($('modalWhatsappBtn')) {
  $('modalWhatsappBtn').onclick = (e) => {
    e.preventDefault();
    if ($('modalWhatsappBtn').classList.contains('disabled')) return;
    $('waConfirmPassword').value = '';
    $('waConfirmError').textContent = '';
    $('waConfirmModal').classList.remove('hidden');
    $('waConfirmPassword').focus();
  };
}

if ($('closeWaConfirmBtn')) $('closeWaConfirmBtn').onclick = () => $('waConfirmModal').classList.add('hidden');
if ($('waConfirmModal') && $('waConfirmModal').querySelector('.modal-backdrop')) {
  $('waConfirmModal').querySelector('.modal-backdrop').onclick = () => $('waConfirmModal').classList.add('hidden');
}

$('waConfirmSubmitBtn').onclick = (e) => guardedAction('waconfirm', e.target, async () => {
  $('waConfirmError').textContent = '';
  const password = $('waConfirmPassword').value;
  if (!password) { $('waConfirmError').textContent = 'Enter your password.'; return; }
  if (!activeModalBook) return;

  let data;
  try {
    data = await api('confirmWhatsappAccess', { bookId: activeModalBook.bookId, password });
  } catch (err) {
    $('waConfirmError').textContent = err.message;
    return;
  }
  $('waConfirmModal').classList.add('hidden');
  $('bookModal').classList.add('hidden');
  const wa = String(data.whatsapp || '').replace(/[^0-9]/g, '');
  if (wa) window.open('https://wa.me/' + wa, '_blank', 'noopener');
});

$('modalRequestBtn').onclick = (e) => guardedAction('borrow-' + activeModalBook.bookId, e.target, async () => {
  const book = activeModalBook;
  const duration = parseInt($('modalDuration').value, 10) || 7;

  book.myPendingRequestId = 'pending-optimistic';
  renderModalStatusArea(book);
  showToast('Borrow request sent!');

  try {
    const data = await api('requestBorrow', { bookId: book.bookId, durationDays: duration });
    book.myPendingRequestId = data.requestId || book.myPendingRequestId;
    refreshBooks();
  } catch (err) {
    book.myPendingRequestId = null;
    if (activeModalBook === book) renderModalStatusArea(book);
    showToast(err.message);
  }
});

$('modalCancelReqBtn').onclick = (e) => guardedAction('cancelbook-' + activeModalBook.bookId, e.target, async () => {
  const reqId = activeModalBook.myPendingRequestId;
  if (!reqId) return;
  $('bookModal').classList.add('hidden');
  await api('cancelMyRequest', { requestId: reqId }).catch(err => { refreshBooks(); throw err; });
  showToast('Request cancelled.');
  refreshBooks();
});

$('modalDeleteBtn').onclick = (e) => guardedAction('delbook-' + activeModalBook.bookId, e.target, async () => {
  if (!confirm('Delete "' + (activeModalBook.bookName || 'this book') + '" from library?')) return;
  const bookId = activeModalBook.bookId;
  $('bookModal').classList.add('hidden');
  await api('deleteBook', { bookId }).catch(err => { refreshBooks(); throw err; });
  showToast('Book deleted.');
  refreshBooks();
});

$('modalEditIconBtn').onclick = () => {
  editMetaContext = { mode: 'existing', bookId: activeModalBook.bookId };
  $('editMetaName').value = activeModalBook.bookName || '';
  $('editMetaWriter').value = activeModalBook.writer || '';
  $('editMetaPublisher').value = activeModalBook.publisher || '';
  $('editMetaPageCount').value = activeModalBook.pageCount || '';

  const downloadWrap = $('editMetaDownloadLinkWrap');
  if (downloadWrap) {
    if (activeModalBook.isPdf) {
      downloadWrap.classList.remove('hidden');
      if ($('editMetaDownloadLink')) $('editMetaDownloadLink').value = activeModalBook.downloadLink || '';
    } else {
      downloadWrap.classList.add('hidden');
      if ($('editMetaDownloadLink')) $('editMetaDownloadLink').value = '';
    }
  }
  $('editMetaModal').classList.remove('hidden');
};

// MEMBERS PAGE
if ($('membersTabBtn')) {
  $('membersTabBtn').onclick = () => {
    $('membersTabBtn').classList.add('active');
    $('liveUpdateTabBtn').classList.remove('active');
    $('membersMainSection').classList.remove('hidden');
    $('liveUpdateMainSection').classList.add('hidden');
  };
}
if ($('liveUpdateTabBtn')) {
  $('liveUpdateTabBtn').onclick = () => {
    $('liveUpdateTabBtn').classList.add('active');
    $('membersTabBtn').classList.remove('active');
    $('liveUpdateMainSection').classList.remove('hidden');
    $('membersMainSection').classList.add('hidden');
    if ($('liveUpdateRedDot')) $('liveUpdateRedDot').classList.add('hidden');
    refreshFullLiveUpdates();
  };
}

function renderMembersUI(data) {
  allMembers = data.members || [];

  const totalEl = $('membersTotalCount');
  if (totalEl) totalEl.textContent = (data.totalMembersCount || allMembers.length);

  const lb = data.leaderboard || {};
  const lbParts = [];
  if (lb.topOwner) lbParts.push(`<div class="lb-item">📚 <b>${escapeHtml(lb.topOwner.name)}</b> — top book owner (${lb.topOwner.count} books)</div>`);
  if (lb.topBorrower) lbParts.push(`<div class="lb-item">🤝 <b>${escapeHtml(lb.topBorrower.name)}</b> — top borrower (${lb.topBorrower.count} books)</div>`);
  if (lb.topRequester) lbParts.push(`<div class="lb-item">🙋 <b>${escapeHtml(lb.topRequester.name)}</b> — most active requester (${lb.topRequester.count})</div>`);
  const lbEl = $('membersLeaderboard');
  if (lbParts.length) { lbEl.classList.remove('hidden'); lbEl.innerHTML = lbParts.join(''); }
  else { lbEl.classList.add('hidden'); }

  $('membersList').innerHTML = allMembers.map(m => {
    const isSelf = currentUser && String(m.id) === String(currentUser.id);
    const statsText = (m.ownedBooks != null) ? `Owns ${m.ownedBooks} · Lent ${m.lentOut} · Borrowed ${m.borrowed}` : `Role: ${m.role || 'Member'}`;

    return `
    <div class="member-card" onclick="openMemberDetailModal('${m.id}')" style="cursor:pointer;">
      <div class="dp-wrap">
        <img src="${driveImg(m.dpFileId)}" alt="">
        <span class="level-badge" title="Level ${m.level}">Lv ${m.level || 1}</span>
      </div>
      <div class="member-body">
        <div class="name">${escapeHtml(m.displayName || m.name)}</div>
        ${m.bio ? `<div class="bio">${escapeHtml(m.bio)}</div>` : ''}
        <div class="stats">${statsText}</div>
      </div>
      ${isSelf ? '' : `<button class="salam-btn" onclick="event.stopPropagation(); sendSalam(this,'${m.id}')">Send Salam!</button>`}
    </div>`;
  }).join('');
}

window.openMemberDetailModal = (memberId) => {
  const m = allMembers.find(x => x.id === memberId);
  if (!m) return;
  const content = $('memberDetailContent');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align:center; margin-bottom:12px;">
      <img src="${driveImg(m.dpFileId)}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:2px solid var(--accent); margin:0 auto;">
      <h4 style="margin:8px 0 2px;">${escapeHtml(m.displayName || m.name)}</h4>
      <p style="color:var(--text-dim); font-size:0.8rem; margin:0;">ID: ${escapeHtml(m.id)}</p>
    </div>
    <div class="member-detail-row"><span class="member-detail-label">City:</span><span class="member-detail-val">${escapeHtml(m.city || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Near Area:</span><span class="member-detail-val">${escapeHtml(m.area || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Bio:</span><span class="member-detail-val">${escapeHtml(m.bio || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Joined:</span><span class="member-detail-val">${formatDate(m.joinedAt) || '—'}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Level:</span><span class="member-detail-val">Lv ${m.level || 1}</span></div>
  `;
  if ($('memberDetailModal')) $('memberDetailModal').classList.remove('hidden');
};

if ($('closeMemberDetailBtn')) $('closeMemberDetailBtn').onclick = () => $('memberDetailModal').classList.add('hidden');
if ($('memberDetailModal') && $('memberDetailModal').querySelector('.modal-backdrop')) {
  $('memberDetailModal').querySelector('.modal-backdrop').onclick = () => $('memberDetailModal').classList.add('hidden');
}

async function refreshMembers() {
  const isFirstLoad = !membersLoadedOnce;
  if (isFirstLoad) $('membersList').innerHTML = getMemberSkeletons();
  else if (lastMembersData) renderMembersUI(lastMembersData);

  try {
    const data = await api('listMembers', {});
    lastMembersData = data;
    membersLoadedOnce = true;
    localStorage.setItem('bh_cached_members', JSON.stringify(data.members || []));
    renderMembersUI(data);
  } catch (err) {
    if (isFirstLoad) { showToast(err.message); $('membersList').innerHTML = ''; }
  }
}

window.sendSalam = (btn, targetId) => guardedAction('salam-' + targetId, btn, async () => {
  btn.classList.add('pop-active');
  await api('sendSalam', { targetId }).catch(err => { btn.classList.remove('pop-active'); throw err; });
  showToast('Salam sent! 👋');
  setTimeout(() => { btn.classList.remove('pop-active'); }, 600);
});

// FULL LIVE UPDATE PAGE (#15)
let liveUpdateDrawerExpanded = false;
let liveUpdateRotateInterval = null;
let liveUpdateCurrentIndex = 0;

function startLiveUpdateRotation() {
  stopLiveUpdateRotation();
  if (!lastLiveUpdateData || !lastLiveUpdateData.updates || lastLiveUpdateData.updates.length <= 1) return;
  liveUpdateRotateInterval = setInterval(() => {
    if (liveUpdateDrawerExpanded) return;
    const updates = lastLiveUpdateData.updates;
    liveUpdateCurrentIndex = (liveUpdateCurrentIndex + 1) % updates.length;
    renderFullLiveUpdateList(lastLiveUpdateData);
  }, 4000);
}

function stopLiveUpdateRotation() {
  if (liveUpdateRotateInterval) {
    clearInterval(liveUpdateRotateInterval);
    liveUpdateRotateInterval = null;
  }
}

window.toggleLiveUpdateDrawer = function() {
  liveUpdateDrawerExpanded = !liveUpdateDrawerExpanded;
  const btn = $('liveUpdateToggleBtn');
  if (btn) {
    btn.textContent = liveUpdateDrawerExpanded ? 'Show less ▴' : 'Show top updates ▾';
  }
  if (lastLiveUpdateData) {
    renderFullLiveUpdateList(lastLiveUpdateData);
  }
  if (liveUpdateDrawerExpanded) {
    stopLiveUpdateRotation();
  } else {
    startLiveUpdateRotation();
  }
};

function renderFullLiveUpdateList(data) {
  const container = $('fullLiveUpdateList');
  if (!container) return;
  const updates = (data && data.updates) || [];

  if (!updates.length) {
    container.classList.add('empty-hint');
    container.textContent = 'No updates yet — stay tuned!';
    return;
  }
  container.classList.remove('empty-hint');

  if (!liveUpdateDrawerExpanded) {
    // Show only 1 item auto-rotating
    if (liveUpdateCurrentIndex >= updates.length) liveUpdateCurrentIndex = 0;
    const u = updates[liveUpdateCurrentIndex];
    container.innerHTML = `
      <div class="fb-item single-rotating-update">
        ${u.imageFileId ? `<img class="fb-thumb" src="${driveImg(u.imageFileId)}" alt="">` : `<div class="fb-icon">${pickEventIcon(u.text)}</div>`}
        <div class="fb-body">
          <div class="fb-text">${escapeHtml(u.text)}</div>
          <div class="fb-time">${timeAgo(u.createdAt)}</div>
        </div>
      </div>`;
  } else {
    // Drawer open: show top 15 updates
    const list = updates.slice(0, 15);
    container.innerHTML = list.map(u => `
      <div class="fb-item">
        ${u.imageFileId ? `<img class="fb-thumb" src="${driveImg(u.imageFileId)}" alt="">` : `<div class="fb-icon">${pickEventIcon(u.text)}</div>`}
        <div class="fb-body">
          <div class="fb-text">${escapeHtml(u.text)}</div>
          <div class="fb-time">${timeAgo(u.createdAt)}</div>
        </div>
      </div>`).join('');
  }
}

async function refreshFullLiveUpdates() {
  if (lastLiveUpdateData) renderFullLiveUpdateList(lastLiveUpdateData);
  else { $('fullLiveUpdateList').classList.add('empty-hint'); $('fullLiveUpdateList').textContent = 'Loading updates…'; }

  try {
    const data = await api('getLiveUpdates', {});
    lastLiveUpdateData = data;
    renderFullLiveUpdateList(data);
    if (!liveUpdateDrawerExpanded) {
      startLiveUpdateRotation();
    }
  } catch (err) {
    if (!lastLiveUpdateData) $('fullLiveUpdateList').textContent = err.message;
  }
}

// REVIEWS / FEATURED BOOK PAGES (#16 & #18)
async function refreshFeaturedPosts() {
  const container = $('reviewsGallery') || $('featuredGallery');
  if (!container) return;

  if (!featuredLoadedOnce) {
    container.innerHTML = getReviewSkeletons();
  } else {
    renderFeaturedGallery();
  }

  try {
    const data = await api('getFeaturedPosts', {});
    allFeaturedPosts = data.posts || [];
    featuredLoadedOnce = true;
    localStorage.setItem('bh_cached_reviews', JSON.stringify(allFeaturedPosts));

    // Check for unread review posts for dot indicator
    const lastSeenId = localStorage.getItem('bh_seen_review_id') || localStorage.getItem('bh_seen_featured_id');
    if (allFeaturedPosts.length > 0 && allFeaturedPosts[0].id !== lastSeenId) {
      if (location.hash !== '#reviews' && location.hash !== '#featured') {
        if ($('reviewsRedDot')) $('reviewsRedDot').classList.remove('hidden');
        if ($('featuredRedDot')) $('featuredRedDot').classList.remove('hidden');
      }
    }

    renderFeaturedGallery();
  } catch (err) {
    if (!featuredLoadedOnce) container.innerHTML = '<p class="empty-hint">No reviews yet.</p>';
  }
}

if ($('reviewsSearch')) $('reviewsSearch').oninput = () => renderFeaturedGallery();
if ($('featuredSearch')) $('featuredSearch').oninput = () => renderFeaturedGallery();
if ($('reviewsSort')) $('reviewsSort').onchange = () => renderFeaturedGallery();
if ($('featuredSort')) $('featuredSort').onchange = () => renderFeaturedGallery();

if ($('clearReviewBookFilterBtn')) {
  $('clearReviewBookFilterBtn').onclick = () => {
    selectedReviewBookFilter = null;
    if ($('reviewBookFilterBanner')) $('reviewBookFilterBanner').classList.add('hidden');
    renderFeaturedGallery();
  };
}

window.toggleCardCaption = (btn, postId) => {
  const p = allFeaturedPosts.find(x => x.id === postId);
  if (!p || !p.caption) return;
  const box = btn.parentElement;
  const textSpan = box.querySelector('.caption-text');
  if (btn.textContent === 'See more') {
    textSpan.textContent = p.caption;
    btn.textContent = 'See less';
  } else {
    textSpan.textContent = p.caption.slice(0, 80) + '...';
    btn.textContent = 'See more';
  }
};

function renderFeaturedGallery() {
  const searchInput = $('reviewsSearch') || $('featuredSearch');
  const sortSelect = $('reviewsSort') || $('featuredSort');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const sort = sortSelect ? sortSelect.value : 'newest';

  let list = allFeaturedPosts.slice();

  // Filter by specific book if navigated from Book Detail Modal (#3)
  if (selectedReviewBookFilter) {
    const filterBanner = $('reviewBookFilterBanner');
    const filterName = $('reviewFilterBookName');
    if (filterBanner && filterName) {
      filterName.textContent = selectedReviewBookFilter.bookName || 'Selected Book';
      filterBanner.classList.remove('hidden');
    }
    list = list.filter(p =>
      (p.bookId && String(p.bookId) === String(selectedReviewBookFilter.bookId)) ||
      (p.bookName && selectedReviewBookFilter.bookName && String(p.bookName).trim().toLowerCase() === String(selectedReviewBookFilter.bookName).trim().toLowerCase())
    );
  } else {
    if ($('reviewBookFilterBanner')) $('reviewBookFilterBanner').classList.add('hidden');
  }

  if (q) {
    list = list.filter(p =>
      String(p.bookName || '').toLowerCase().includes(q) ||
      String(p.writer || '').toLowerCase().includes(q) ||
      String(p.memberName || '').toLowerCase().includes(q) ||
      String(p.caption || '').toLowerCase().includes(q)
    );
  }

  if (sort === 'oldest') {
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === 'members') {
    list.sort((a, b) => String(a.memberName || '').localeCompare(String(b.memberName || '')));
  } else {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if ($('reviewsTotalCount')) $('reviewsTotalCount').textContent = list.length;

  const gallery = $('reviewsGallery') || $('featuredGallery');
  if (!gallery) return;

  if (!list.length) {
    gallery.innerHTML = selectedReviewBookFilter
      ? `<p class="empty-hint">No reviews found for "${escapeHtml(selectedReviewBookFilter.bookName)}".</p>`
      : '<p class="empty-hint">No reviews found. Be the first to share one!</p>';
    return;
  }

  gallery.innerHTML = list.map(p => {
    const posterDp = driveImg(p.posterDpFileId);
    const hasPhoto = !!(p.imageFileId && String(p.imageFileId).trim().length > 0);
    const mainImg = hasPhoto ? driveImg(p.imageFileId) : '';
    const coverFileId = p.bookCoverFileId || (allBooks.find(b => b.bookId === p.bookId) || {}).imageFileId;
    const coverThumb = coverFileId ? driveImg(coverFileId) : '';
    const captionVal = (p.caption || p.Caption || '').trim();
    const viewsCount = parseInt(p.views, 10) || 0;

    const viewsBadge = `
      <div class="story-card-views-badge" title="${viewsCount} views">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span>${viewsCount}</span>
      </div>`;

    if (hasPhoto) {
      return `
      <div class="story-card" onclick="openFeaturedZoomModal('${p.id}')">
        <img class="story-card-img" src="${mainImg}" alt="">
        <div class="story-card-overlay">
          <div class="story-card-header">
            <img class="story-card-dp" src="${posterDp}" alt="">
            <div class="story-card-user-info">
              <span class="story-card-name">${escapeHtml(p.memberName || 'Member')}</span>
              <span class="story-card-time">${timeAgo(p.createdAt)}</span>
            </div>
            ${viewsBadge}
          </div>
          <div class="story-card-footer">
            ${coverThumb ? `<img class="story-card-book-cover" src="${coverThumb}" alt="" title="${escapeHtml(p.bookName || '')}">` : ''}
            <div class="story-card-title">${escapeHtml(p.bookName || 'Review')}</div>
          </div>
        </div>
      </div>
      `;
    }

    // Text-only review card without page photo (#2)
    return `
    <div class="story-card story-card-text-only" onclick="openFeaturedZoomModal('${p.id}')">
      <div class="story-card-overlay">
        <div class="story-card-header">
          <img class="story-card-dp" src="${posterDp}" alt="">
          <div class="story-card-user-info">
            <span class="story-card-name">${escapeHtml(p.memberName || 'Member')}</span>
            <span class="story-card-time">${timeAgo(p.createdAt)}</span>
          </div>
          ${viewsBadge}
        </div>
        <div class="story-card-text-preview">
          <div class="story-card-quote-icon">“</div>
          <div class="story-card-quote-text">${escapeHtml(captionVal || 'Review & Thoughts on this book.')}</div>
        </div>
        <div class="story-card-footer">
          ${coverThumb ? `<img class="story-card-book-cover" src="${coverThumb}" alt="" title="${escapeHtml(p.bookName || '')}">` : ''}
          <div class="story-card-title">${escapeHtml(p.bookName || 'Review')}</div>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

window.openFeaturedZoomModal = (postId) => {
  const p = allFeaturedPosts.find(x => x.id === postId);
  if (!p) return;

  // Track & increment view counts
  p.views = (parseInt(p.views, 10) || 0) + 1;
  const viewsEl = $('storyZoomViewsCount');
  if (viewsEl) viewsEl.textContent = p.views;
  localStorage.setItem('bh_cached_reviews', JSON.stringify(allFeaturedPosts));
  api('incrementFeaturedView', { postId: p.id }).catch(() => {});

  const posterDp = driveImg(p.posterDpFileId);
  const hasPhoto = !!(p.imageFileId && String(p.imageFileId).trim().length > 0);
  const mainImg = hasPhoto ? driveImg(p.imageFileId) : '';
  const coverFileId = p.bookCoverFileId || (allBooks.find(b => b.bookId === p.bookId) || {}).imageFileId;
  const coverThumb = coverFileId ? driveImg(coverFileId) : '';

  const dpEl = $('storyPosterDp');
  if (dpEl) dpEl.src = posterDp;

  const nameEl = $('storyPosterName');
  if (nameEl) nameEl.textContent = p.memberName || 'Member';

  const timeEl = $('storyPostTime');
  if (timeEl) timeEl.textContent = timeAgo(p.createdAt);

  const bookEl = $('storyBookName');
  if (bookEl) bookEl.textContent = 'Book: ' + (p.bookName || 'Untitled') + (p.writer ? ' (' + p.writer + ')' : '');

  const imgEl = $('zoomModalImg') || $('storyZoomImg');
  const textCard = $('zoomModalTextCard');
  const textCover = $('zoomModalCoverImg');
  const textBody = $('zoomModalTextBody');

  let captionVal = String(p.caption || p.Caption || '').trim();
  if (!captionVal) {
    for (let k in p) {
      if (k && (k.toLowerCase().includes('caption') || k === 'undefined' || k === '')) {
        if (p[k] && String(p[k]).trim().length > 0 && String(p[k]).trim() !== 'undefined') {
          captionVal = String(p[k]).trim();
          break;
        }
      }
    }
  }

  if (hasPhoto) {
    if (imgEl) {
      imgEl.src = mainImg;
      imgEl.classList.remove('hidden');
    }
    if (textCard) textCard.classList.add('hidden');
  } else {
    if (imgEl) imgEl.classList.add('hidden');
    if (textCard) {
      textCard.classList.remove('hidden');
      if (textCover) {
        if (coverThumb) {
          textCover.src = coverThumb;
          textCover.classList.remove('hidden');
        } else {
          textCover.classList.add('hidden');
        }
      }
      if (textBody) {
        textBody.textContent = captionVal ? `"${captionVal}"` : 'Book review by ' + (p.memberName || 'a member') + '.';
      }
    }
  }

  // Render Caption below photo in Zoom Modal
  const captionWrap = $('storyCaptionWrap');
  const captionText = $('storyCaptionText');
  const captionToggle = $('storyCaptionToggleBtn');

  if (captionWrap && captionText) {
    if (hasPhoto && captionVal) {
      captionWrap.classList.remove('hidden');
      captionText.textContent = captionVal;
      captionText.className = 'story-caption-text clamp-2';

      if (captionToggle) {
        if (captionVal.length > 30) {
          captionToggle.classList.remove('hidden');
          captionToggle.textContent = 'See more';
          captionToggle.onclick = (e) => {
            e.stopPropagation();
            const isClamped = captionText.classList.contains('clamp-2');
            if (isClamped) {
              captionText.classList.remove('clamp-2');
              captionToggle.textContent = 'See less';
            } else {
              captionText.classList.add('clamp-2');
              captionToggle.textContent = 'See more';
            }
          };
        } else {
          captionToggle.classList.add('hidden');
        }
      }
    } else {
      captionWrap.classList.add('hidden');
    }
  }

  const deleteBtn = $('storyDeleteBtn');
  if (deleteBtn) {
    const isOwner = !!(currentUser && (
      (p.memberId && currentUser.id && String(p.memberId) === String(currentUser.id)) ||
      (p.memberName && currentUser.displayName && String(p.memberName).toLowerCase() === String(currentUser.displayName).toLowerCase()) ||
      currentUser.isAdmin
    ));
    deleteBtn.classList.toggle('hidden', !isOwner);
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (!confirm('Delete this review?')) return;
      guardedAction('delfeature-' + p.id, deleteBtn, async () => {
        const modal = $('reviewZoomModal') || $('featuredZoomModal');
        if (modal) modal.classList.add('hidden');
        await api('deleteFeaturedPost', { postId: p.id }).catch(err => { refreshFeaturedPosts(); throw err; });
        showToast('Review deleted.');
        refreshFeaturedPosts();
      });
    };
  }

  const borrowBtn = $('storyBorrowBtn');
  if (borrowBtn) {
    borrowBtn.textContent = p.isPdf ? 'Download PDF' : 'View / Borrow Book';
    borrowBtn.onclick = (e) => {
      e.stopPropagation();
      const modal = $('reviewZoomModal') || $('featuredZoomModal');
      if (modal) modal.classList.add('hidden');
      if (p.bookId) viewBookFromProfile(p.bookId);
      else goPage('explore');
    };
  }

  const zoomModal = $('reviewZoomModal') || $('featuredZoomModal');
  if (zoomModal) zoomModal.classList.remove('hidden');
};

const closeZoomBtn = $('closeReviewZoomBtn') || $('closeFeaturedZoomBtn');
if (closeZoomBtn) closeZoomBtn.onclick = () => {
  const modal = $('reviewZoomModal') || $('featuredZoomModal');
  if (modal) modal.classList.add('hidden');
};

const closeZoomBackdrop = $('closeReviewZoomBackdrop') || $('closeFeaturedZoomBackdrop');
if (closeZoomBackdrop) closeZoomBackdrop.onclick = () => {
  const modal = $('reviewZoomModal') || $('featuredZoomModal');
  if (modal) modal.classList.add('hidden');
};

// POST REVIEW / FEATURED MODAL
function resetPostReviewForm() {
  selectedFeaturedBook = null;
  pendingFeaturedImageB64 = '';
  const imgInput = $('reviewImageInput') || $('featuredImageInput');
  if (imgInput) imgInput.value = '';
  const previewWrap = $('reviewImgPreviewWrap') || $('featuredImgPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const bookIdInput = $('selectedReviewBookId') || $('selectedFeaturedBookId');
  if (bookIdInput) bookIdInput.value = '';
  const bookLabel = $('selectedReviewBookLabel') || $('selectedFeaturedBookLabel');
  if (bookLabel) bookLabel.textContent = '';
  const searchInput = $('reviewBookSearch') || $('featuredBookSearch');
  if (searchInput) searchInput.value = '';
  const captionInput = $('reviewCaptionInput') || $('featuredCaptionInput');
  if (captionInput) captionInput.value = '';
  const resultsEl = $('reviewBookSearchResults') || $('featuredBookSearchResults');
  if (resultsEl) resultsEl.innerHTML = '';
  const errorEl = $('postReviewError') || $('postFeaturedError');
  if (errorEl) errorEl.textContent = '';
  validateFeaturedPostForm();
}

function openPostReviewModal() {
  resetPostReviewForm();
  const modal = $('postReviewModal') || $('postFeaturedModal');
  if (modal) modal.classList.remove('hidden');
}

const openPostBtn = $('openPostReviewBtn') || $('openPostFeaturedBtn');
if (openPostBtn) {
  openPostBtn.onclick = () => openPostReviewModal();
}

const closePostReviewBtn = $('closePostReviewBtn') || $('closePostFeaturedBtn');
if (closePostReviewBtn) closePostReviewBtn.onclick = () => {
  const modal = $('postReviewModal') || $('postFeaturedModal');
  if (modal) modal.classList.add('hidden');
};

const postModalEl = $('postReviewModal') || $('postFeaturedModal');
if (postModalEl && postModalEl.querySelector('.modal-backdrop')) {
  postModalEl.querySelector('.modal-backdrop').onclick = () => postModalEl.classList.add('hidden');
}

// Remove photo button inside post review modal
if ($('clearReviewImgBtn')) {
  $('clearReviewImgBtn').onclick = () => {
    pendingFeaturedImageB64 = '';
    const imgInput = $('reviewImageInput') || $('featuredImageInput');
    if (imgInput) imgInput.value = '';
    const previewWrap = $('reviewImgPreviewWrap') || $('featuredImgPreviewWrap');
    if (previewWrap) previewWrap.classList.add('hidden');
    validateFeaturedPostForm();
  };
}

const postImgInput = $('reviewImageInput') || $('featuredImageInput');
if (postImgInput) {
  postImgInput.onchange = async () => {
    const file = postImgInput.files[0];
    if (!file) return;
    const statusEl = $('reviewCompressStatus') || $('featuredCompressStatus');
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.textContent = 'Compressing image under 100KB…';
    }

    try {
      pendingFeaturedImageB64 = await compressImage(file, 100);
      const previewImg = $('reviewImgPreview') || $('featuredImgPreview');
      if (previewImg) previewImg.src = pendingFeaturedImageB64;
      const previewWrap = $('reviewImgPreviewWrap') || $('featuredImgPreviewWrap');
      if (previewWrap) previewWrap.classList.remove('hidden');
      if (statusEl) {
        statusEl.textContent = 'Image compressed successfully.';
        setTimeout(() => statusEl.classList.add('hidden'), 1500);
      }
      validateFeaturedPostForm();
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error compressing image: ' + err.message;
    }
  };
}

const postBookSearch = $('reviewBookSearch') || $('featuredBookSearch');
if (postBookSearch) {
  postBookSearch.oninput = () => {
    const q = postBookSearch.value.trim().toLowerCase();
    const resultsEl = $('reviewBookSearchResults') || $('featuredBookSearchResults');
    if (!resultsEl) return;
    if (!q) { resultsEl.innerHTML = ''; return; }

    const matches = allBooks.filter(b =>
      String(b.bookName || '').toLowerCase().includes(q) ||
      String(b.writer || '').toLowerCase().includes(q)
    ).slice(0, 5);

    if (!matches.length) {
      resultsEl.innerHTML = '<p class="empty-hint" style="padding:8px 0; margin:0;">No matching book found in library.</p>';
      return;
    }

    resultsEl.innerHTML = matches.map(b => `
      <div class="req-card" style="cursor:pointer;" onclick="selectBookForFeatured('${b.bookId}')">
        <img src="${driveImg(b.imageFileId)}" alt="">
        <div class="req-card-body">
          <div class="name">${escapeHtml(b.bookName || 'Untitled')}</div>
          <div class="meta">${escapeHtml(b.writer || '')}</div>
        </div>
      </div>
    `).join('');
  };
}

window.selectBookForFeatured = (bookId) => {
  const b = allBooks.find(x => x.bookId === bookId);
  if (!b) return;
  selectedFeaturedBook = b;

  // Auto-populate the search input with full book name (#4)
  const searchInput = $('reviewBookSearch') || $('featuredBookSearch');
  if (searchInput) searchInput.value = b.bookName || '';

  const idInput = $('selectedReviewBookId') || $('selectedFeaturedBookId');
  if (idInput) idInput.value = b.bookId;

  const label = $('selectedReviewBookLabel') || $('selectedFeaturedBookLabel');
  if (label) label.textContent = '✓ Mentioned: ' + b.bookName + (b.writer ? ' (' + b.writer + ')' : '');

  const resultsEl = $('reviewBookSearchResults') || $('featuredBookSearchResults');
  if (resultsEl) resultsEl.innerHTML = '';

  validateFeaturedPostForm();
};

// Open Add Review Modal directly for a specific book (#3)
function openAddReviewForBook(b) {
  openPostReviewModal();
  selectBookForFeatured(b.bookId);
}

function validateFeaturedPostForm() {
  // Mentioning a book is mandatory, photo and writings are optional (#2)
  const ok = !!selectedFeaturedBook;
  const btn = $('confirmPostReviewBtn') || $('confirmPostFeaturedBtn');
  if (btn) btn.disabled = !ok;
}

const confirmPostBtn = $('confirmPostReviewBtn') || $('confirmPostFeaturedBtn');
if (confirmPostBtn) {
  confirmPostBtn.onclick = (e) => guardedAction('postreview', e.target, async () => {
    if (!selectedFeaturedBook) {
      const errEl = $('postReviewError') || $('postFeaturedError');
      if (errEl) errEl.textContent = 'Please search and mention a book first.';
      return;
    }

    const errEl = $('postReviewError') || $('postFeaturedError');
    if (errEl) errEl.textContent = '';

    const captionInput = $('reviewCaptionInput') || $('featuredCaptionInput');
    const caption = captionInput ? captionInput.value.trim() : '';

    await api('addFeaturedPost', {
      imageBase64: pendingFeaturedImageB64 || '',
      bookId: selectedFeaturedBook.bookId,
      bookName: selectedFeaturedBook.bookName,
      writer: selectedFeaturedBook.writer,
      caption: caption
    }).catch(err => {
      if (errEl) errEl.textContent = err.message;
      throw err;
    });

    const modal = $('postReviewModal') || $('postFeaturedModal');
    if (modal) modal.classList.add('hidden');
    showToast('Review posted successfully!');
    refreshFeaturedPosts();
    refreshFullLiveUpdates();
  });
}

// ADD BOOKS PAGE
let addBooksIsPdf = false;

$('typePhysicalBtn').onclick = () => {
  addBooksIsPdf = false;
  $('typePhysicalBtn').classList.add('active');
  $('typePdfBtn').classList.remove('active');
  const hintEl = $('uploadHintText');
  if (hintEl) hintEl.textContent = 'Pick photo(s) of book covers from your device. Each image is automatically compressed.';
};

$('typePdfBtn').onclick = () => {
  addBooksIsPdf = true;
  $('typePdfBtn').classList.add('active');
  $('typePhysicalBtn').classList.remove('active');
  const hintEl = $('uploadHintText');
  if (hintEl) hintEl.textContent = 'Pick cover photo(s) for your PDF book(s). Tap the pencil icon on preview to add the PDF download link.';
};

$('bookFilesInput').onchange = async () => {
  const files = Array.from($('bookFilesInput').files);
  if (!files.length) return;
  pendingBookFiles = [];
  const statusEl = $('compressStatus');
  statusEl.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    statusEl.textContent = 'Compressing photo ' + (i + 1) + ' of ' + files.length + '…';
    try {
      const base64 = await compressImage(files[i], 100);
      pendingBookFiles.push({ base64, bookName: '', writer: '', publisher: '', pageCount: '', downloadLink: '' });
    } catch (err) {
      showToast('Skipped photo: ' + err.message);
    }
    renderAddPreview();
  }
  statusEl.textContent = pendingBookFiles.length + ' photo(s) ready (<100KB each).';
  setTimeout(() => statusEl.classList.add('hidden'), 2000);
};

function renderAddPreview() {
  const el = $('addBooksPreview');
  $('addBooksError').textContent = '';
  $('addBooksSuccess').textContent = '';
  if (!pendingBookFiles.length) { el.innerHTML = ''; $('uploadBooksBtn').disabled = true; return; }

  el.innerHTML = pendingBookFiles.map((pf, i) => `
    <div class="add-preview-item" onclick="openEditMetaForPending(${i})">
      <img src="${pf.base64}" alt="">
      <div class="pen">
        <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="label">${escapeHtml(pf.bookName) || 'Tap to name'}</div>
    </div>`).join('');

  $('uploadBooksBtn').disabled = false;
}

window.openEditMetaForPending = (index) => {
  editMetaContext = { mode: 'pending', index };
  const pf = pendingBookFiles[index];
  $('editMetaName').value = pf.bookName || '';
  $('editMetaWriter').value = pf.writer || '';
  $('editMetaPublisher').value = pf.publisher || '';
  $('editMetaPageCount').value = pf.pageCount || '';

  const downloadWrap = $('editMetaDownloadLinkWrap');
  if (downloadWrap) {
    if (addBooksIsPdf) {
      downloadWrap.classList.remove('hidden');
      if ($('editMetaDownloadLink')) $('editMetaDownloadLink').value = pf.downloadLink || '';
    } else {
      downloadWrap.classList.add('hidden');
      if ($('editMetaDownloadLink')) $('editMetaDownloadLink').value = '';
    }
  }
  $('editMetaModal').classList.remove('hidden');
};

$('closeEditMetaBtn').onclick = () => $('editMetaModal').classList.add('hidden');
$('editMetaModal').querySelector('.modal-backdrop').onclick = () => $('editMetaModal').classList.add('hidden');

$('editMetaSaveBtn').onclick = (e) => guardedAction('editmeta', e.target, async () => {
  if (!editMetaContext) return;
  const bookName = $('editMetaName').value.trim();
  const writer = $('editMetaWriter').value.trim();
  const publisher = $('editMetaPublisher').value.trim();
  const pageCount = $('editMetaPageCount').value.trim();
  const downloadLink = $('editMetaDownloadLink') ? $('editMetaDownloadLink').value.trim() : '';

  if (editMetaContext.mode === 'pending') {
    const pf = pendingBookFiles[editMetaContext.index];
    if (pf) {
      pf.bookName = bookName;
      pf.writer = writer;
      pf.publisher = publisher;
      pf.pageCount = pageCount;
      pf.downloadLink = downloadLink;
    }
    $('editMetaModal').classList.add('hidden');
    renderAddPreview();
    return;
  }

  const bookId = editMetaContext.bookId;
  $('editMetaModal').classList.add('hidden');
  const isPdf = activeModalBook ? activeModalBook.isPdf : false;
  await api('editBook', { bookId, bookName, writer, publisher, pageCount, downloadLink, isPdf });
  showToast('Book details updated.');
  if (activeModalBook && activeModalBook.bookId === bookId) {
    activeModalBook.bookName = bookName;
    activeModalBook.writer = writer;
    activeModalBook.publisher = publisher;
    activeModalBook.pageCount = pageCount;
    activeModalBook.downloadLink = downloadLink;
    openBookModal(bookId);
  }
  refreshBooks();
});

$('uploadBooksBtn').onclick = (e) => guardedAction('uploadbooks', e.target, async () => {
  if (!pendingBookFiles.length) return;
  $('addBooksError').textContent = '';
  $('addBooksSuccess').textContent = '';

  const filesToSend = pendingBookFiles.map(pf => ({
    base64: pf.base64,
    bookName: pf.bookName || '',
    writer: pf.writer || '',
    publisher: pf.publisher || '',
    pageCount: pf.pageCount || '',
    downloadLink: pf.downloadLink || '',
    isPdf: addBooksIsPdf
  }));

  const data = await api('addBooks', { files: filesToSend })
    .catch(err => { $('addBooksError').textContent = err.message; throw err; });

  $('addBooksSuccess').textContent = data.added.length + ' book(s) added to library.';
  pendingBookFiles = [];
  $('bookFilesInput').value = '';
  $('addBooksPreview').innerHTML = '';
  $('uploadBooksBtn').disabled = true;
  showToast('Books uploaded!');
  if (data.leveledUp) showToast('🎉 Level up! You reached Level ' + data.newLevel + '!');
});

// GREETING POPUP
$('greetingPopupOkBtn').onclick = () => $('greetingPopupModal').classList.add('hidden');

// HADIYA (FREE GIFTS) (#12)
$('hadiyaBtn').onclick = () => {
  $('hadiyaModal').classList.remove('hidden');
  $('hadiyaRedDot').classList.add('hidden');
};
$('closeHadiyaBtn').onclick = () => $('hadiyaModal').classList.add('hidden');
$('hadiyaModal').querySelector('.modal-backdrop').onclick = () => $('hadiyaModal').classList.add('hidden');
$('hadiyaDownloadBtn').onclick = () => {
  $('hadiyaRedDot').classList.add('hidden');
  showToast('Downloading gift book...');
};

// NOTIFICATIONS
let lastNotifData = null;
let knownNotifIds = null;
let notifPollInterval = null;

function renderNotifList(data) {
  if (!data.notifications || !data.notifications.length) {
    $('notifList').classList.add('empty-hint');
    $('notifList').textContent = 'No notifications yet.';
    return;
  }
  $('notifList').classList.remove('empty-hint');
  $('notifList').innerHTML = data.notifications.map(n => `
    <div class="fb-item ${n.read ? '' : 'unread'}">
      <div class="fb-icon">${pickEventIcon(n.title + ' ' + n.body)}</div>
      <div class="fb-body">
        <div class="fb-text"><b>${escapeHtml(n.title)}</b> — ${escapeHtml(n.body)}</div>
        <div class="fb-time">${timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join('');
}

// SYSTEM NOTIFICATION DISPATCHER (Phone Notification Shade & Lockscreen)
async function showSystemNotification(title, body, bookId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        return reg.showNotification(title || 'Baitul Hikmah', {
          body: body || 'You have a new update.',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          requireInteraction: true,
          renotify: true,
          tag: 'bh-alert-' + Date.now(),
          vibrate: [350, 100, 450, 100, 500, 100, 500],
          data: { url: './#profile', bookId: bookId || '' }
        });
      }
    }
    new Notification(title || 'Baitul Hikmah', {
      body: body || 'You have a new update.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png'
    });
  } catch (err) {
    console.warn('System notification display:', err);
  }
}

// LIVE NOTIFICATION WATCHER WITH ALARM & HEADS-UP DISPATCH
async function checkNotifRedDot() {
  if (!currentUser) return;
  try {
    const data = await api('listNotifications', {});
    const prevData = lastNotifData;
    lastNotifData = data;
    $('notifRedDot').classList.toggle('hidden', data.unreadCount === 0);

    // Initialize known IDs from storage/memory
    if (knownNotifIds === null) {
      try {
        const stored = JSON.parse(localStorage.getItem('bh_known_notifs_' + currentUser.id) || '[]');
        knownNotifIds = new Set(stored);
      } catch (e) {
        knownNotifIds = new Set();
      }
    }

    if (data.notifications && data.notifications.length) {
      const currentIds = data.notifications.map(n => n.id);
      
      // If we already had a baseline, detect newly arrived unread notifications
      if (prevData !== null) {
        const newUnread = data.notifications.filter(n => !n.read && !knownNotifIds.has(n.id));
        if (newUnread.length > 0) {
          // Play loud alarm melody and phone vibration
          playNotificationAlarmSound();

          // Show heads-up banner for top new notification
          const topNotif = newUnread[0];
          showHeadsUpNotification(topNotif.title, topNotif.body, topNotif.bookId);

          // Dispatch real system notification to phone
          showSystemNotification(topNotif.title, topNotif.body, topNotif.bookId);
        }
      }

      // Mark all current notifications as seen in local registry
      currentIds.forEach(id => knownNotifIds.add(id));
      try {
        localStorage.setItem('bh_known_notifs_' + currentUser.id, JSON.stringify(Array.from(knownNotifIds).slice(-100)));
      } catch (e) {}
    }
  } catch (err) { }
}

function startNotificationPolling() {
  if (notifPollInterval) clearInterval(notifPollInterval);
  checkNotifRedDot();
  notifPollInterval = setInterval(checkNotifRedDot, 15000);
}

$('notifBellBtn').onclick = async () => {
  $('notifModal').classList.remove('hidden');

  if (lastNotifData) renderNotifList(lastNotifData);
  else { $('notifList').classList.add('empty-hint'); $('notifList').textContent = 'Loading…'; }

  try {
    const data = await api('listNotifications', {});
    lastNotifData = data;
    renderNotifList(data);
    if (data.unreadCount > 0) {
      api('markNotificationsRead', {}).then(() => $('notifRedDot').classList.add('hidden')).catch(() => {});
    } else {
      $('notifRedDot').classList.add('hidden');
    }
  } catch (err) {
    if (!lastNotifData) $('notifList').textContent = err.message;
  }
};
$('closeNotifBtn').onclick = () => $('notifModal').classList.add('hidden');
$('notifModal').querySelector('.modal-backdrop').onclick = () => $('notifModal').classList.add('hidden');

// Test Notification button with high-priority alarm sound and vibration
const testNotifBtn = $('testNotifBtn');
if (testNotifBtn) {
  testNotifBtn.onclick = (e) => guardedAction('testnotif', e.target, async () => {
    playNotificationAlarmSound();
    showHeadsUpNotification('Test Notification Alarm 🔔', 'Alarm sound, phone vibration & high-priority alert test successful!');
    showSystemNotification('Baitul Hikmah 🔔', 'High-priority sound, phone vibration & system notification working!');
    
    if (!('Notification' in window)) {
      showToast('Notifications are not supported in this browser mode.');
      return;
    }
    if (Notification.permission !== 'granted') {
      showToast('Notification permission not granted yet. Opening setup guide...');
      openNotificationSetupGuide(false);
      return;
    }

    showToast('Syncing push token & sending push to phone...');
    try {
      if (typeof initPushNotifications === 'function') {
        await initPushNotifications(true);
      }
      const res = await api('testNotification', {});
      if (res && res.ok) {
        showToast('✅ Live push notification dispatched to your phone lockscreen!');
      } else {
        showToast('Push test response: ' + (res.error || 'Check Google Sheet PushTokens tab.'));
      }
    } catch (err) {
      showToast('Push error: ' + err.message);
    }
  });
}

// NOTIFICATION & PHONE SETTINGS SETUP GUIDE
function detectUserDevice() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function selectNotifDeviceTab(device) {
  const tabs = document.querySelectorAll('.notif-device-tab');
  tabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-device') === device);
  });

  $('notifPanelAndroid').classList.toggle('hidden', device !== 'android');
  $('notifPanelIos').classList.toggle('hidden', device !== 'ios');
  $('notifPanelDesktop').classList.toggle('hidden', device !== 'desktop');
}

function updateNotifSetupUI() {
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const card1 = $('notifStep1Card');
  const badge1 = $('notifStep1Badge');
  const status1 = $('notifStep1Status');
  const actionWrap1 = $('notifStep1ActionWrap');
  const blockedGuide1 = $('notifStep1BlockedGuide');

  if (perm === 'granted') {
    if (card1) {
      card1.className = 'notif-step-card done';
      badge1.textContent = '✓';
      status1.textContent = '✅ Notifications are allowed on this device.';
    }
    if (actionWrap1) actionWrap1.classList.add('hidden');
    if (blockedGuide1) blockedGuide1.classList.add('hidden');

    const iosBtn = $('notifIosEnableBtn');
    if (iosBtn) {
      iosBtn.textContent = '✅ Notifications Enabled';
      iosBtn.disabled = true;
    }
    const pcBtn = $('notifDesktopEnableBtn');
    if (pcBtn) {
      pcBtn.textContent = '✅ Notifications Enabled';
      pcBtn.disabled = true;
    }
  } else if (perm === 'denied') {
    if (card1) {
      card1.className = 'notif-step-card active';
      badge1.textContent = '✕';
      status1.textContent = '❌ Notifications are blocked in browser settings.';
    }
    if (actionWrap1) actionWrap1.classList.add('hidden');
    if (blockedGuide1) blockedGuide1.classList.remove('hidden');
  } else {
    if (card1) {
      card1.className = 'notif-step-card active';
      badge1.textContent = '1';
      status1.textContent = '⚠️ Browser permission needed to send alarms and alerts.';
    }
    if (actionWrap1) actionWrap1.classList.remove('hidden');
    if (blockedGuide1) blockedGuide1.classList.add('hidden');
  }
}

function openNotificationSetupGuide(isAutoPrompt = false) {
  if (isAutoPrompt) {
    if (localStorage.getItem('bh_notif_guide_never') === 'true') return;
    if ('Notification' in window && Notification.permission === 'granted') return;

    let promptCount = parseInt(localStorage.getItem('bh_notif_guide_prompt_count') || '0', 10);
    promptCount += 1;
    localStorage.setItem('bh_notif_guide_prompt_count', String(promptCount));

    // Show "Don't show these again" button on 2nd and subsequent prompts
    if (promptCount >= 2) {
      const neverWrap = $('notifSetupNeverWrap');
      if (neverWrap) neverWrap.classList.remove('hidden');
    }
  }

  // Auto select detected device
  const detected = detectUserDevice();
  selectNotifDeviceTab(detected);

  updateNotifSetupUI();
  const modal = $('notifSetupModal');
  if (modal) modal.classList.remove('hidden');
}

// Hook up Device Tab switcher
document.querySelectorAll('.notif-device-tab').forEach(tab => {
  tab.onclick = () => {
    const dev = tab.getAttribute('data-device');
    selectNotifDeviceTab(dev);
  };
});

// Hook up Setup Guide modal controls
const openGuideBtn = $('openNotifSetupGuideBtn');
if (openGuideBtn) {
  openGuideBtn.onclick = () => {
    $('notifModal').classList.add('hidden');
    openNotificationSetupGuide(false);
  };
}

$('closeNotifSetupBtn').onclick = () => $('notifSetupModal').classList.add('hidden');
$('notifSetupModal').querySelector('.modal-backdrop').onclick = () => $('notifSetupModal').classList.add('hidden');

$('notifSetupDoneBtn').onclick = () => {
  $('notifSetupModal').classList.add('hidden');
};

const neverBtn = $('notifSetupNeverBtn');
if (neverBtn) {
  neverBtn.onclick = () => {
    localStorage.setItem('bh_notif_guide_never', 'true');
    $('notifSetupModal').classList.add('hidden');
    showToast('Setup dismissed. You can reopen this anytime from Notifications ⚙️');
  };
}

async function requestNotificationPermissionFlow() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported in this browser mode.');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    updateNotifSetupUI();
    if (perm === 'granted') {
      playNotificationAlarmSound();
      showToast('✅ Notifications enabled! Syncing device token...');
      initPushNotifications();
      showSystemNotification('Baitul Hikmah 🔔', 'Phone notifications are now connected!');
    } else if (perm === 'denied') {
      showToast('Notifications blocked. Follow the steps above to unblock.');
    }
  } catch (err) {
    showToast('Permission error: ' + err.message);
  }
}

$('notifGrantPermissionBtn').onclick = requestNotificationPermissionFlow;

const iosEnableBtn = $('notifIosEnableBtn');
if (iosEnableBtn) iosEnableBtn.onclick = requestNotificationPermissionFlow;

const desktopEnableBtn = $('notifDesktopEnableBtn');
if (desktopEnableBtn) desktopEnableBtn.onclick = requestNotificationPermissionFlow;

$('notifTestSoundInGuideBtn').onclick = async () => {
  playNotificationAlarmSound();
  showHeadsUpNotification('Test Notification Sound 🔔', 'Loud alarm sound, vibration & alert banner working smoothly!');
  showSystemNotification('Baitul Hikmah 🔔', 'Test alarm & phone alert working!');
  showToast('Sound & vibration alarm tested!');
  try {
    if (currentUser) {
      if (typeof initPushNotifications === 'function') await initPushNotifications();
      await api('testNotification', {});
    }
  } catch (e) {}
};

// PUSH NOTIFICATIONS & FOREGROUND FCM DISPATCH
async function initPushNotifications(forcePrompt = false) {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    if (typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') === -1) {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      const messaging = firebase.messaging();

      // Foreground message received -> trigger high priority sound, vibration & heads up
      messaging.onMessage((payload) => {
        const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Baitul Hikmah';
        const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'You have a new notification!';
        const bookId = payload.data && payload.data.bookId;

        playNotificationAlarmSound();
        showHeadsUpNotification(title, body, bookId);
        showSystemNotification(title, body, bookId);
        checkNotifRedDot();
      });

      if (currentUser && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          return await syncPushToken(messaging, reg, forcePrompt);
        } else if (Notification.permission === 'default' && !forcePrompt) {
          // Auto trigger friendly setup wizard on app open
          setTimeout(() => openNotificationSetupGuide(true), 1200);
        }
      }
    } else {
      if (currentUser && 'Notification' in window && Notification.permission === 'default' && !forcePrompt) {
        setTimeout(() => openNotificationSetupGuide(true), 1200);
      }
    }
  } catch (err) {
    console.warn('SW/Firebase init:', err);
  }
  return null;
}

async function syncPushToken(messaging, serviceWorkerRegistration, forcePrompt = false) {
  if (!currentUser) return null;
  try {
    const vapidKey = typeof FIREBASE_VAPID_KEY !== 'undefined' ? FIREBASE_VAPID_KEY : undefined;
    
    // Ensure service worker registration is active
    let swReg = serviceWorkerRegistration;
    if (!swReg && 'serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.ready.catch(() => null);
    }

    const tokenOptions = { vapidKey };
    if (swReg) {
      tokenOptions.serviceWorkerRegistration = swReg;
    }

    const token = await messaging.getToken(tokenOptions);
    if (token) {
      const userKey = 'bh_push_token_u_' + currentUser.id;
      const lastToken = localStorage.getItem(userKey);
      if (lastToken !== token || forcePrompt) {
        const res = await api('savePushToken', { pushToken: token }).catch((err) => {
          console.warn('savePushToken api call error:', err);
          return null;
        });
        if (res && res.ok) {
          localStorage.setItem(userKey, token);
          localStorage.setItem('bh_push_token', token);
          if (forcePrompt) {
            showToast('✅ Device push token synced to backend!');
          }
        } else if (forcePrompt && res && res.error) {
          showToast('Failed to save token: ' + res.error);
        }
      }
      return token;
    } else {
      if (forcePrompt) showToast('No push token returned from Firebase.');
      return null;
    }
  } catch (err) {
    console.warn('Could not sync push token:', err);
    if (forcePrompt) {
      showToast('Push token error: ' + (err.message || err));
    }
    return null;
  }
}

// EDIT PROFILE
let editProfilePendingDp = null;

$('openEditProfileBtn').onclick = () => {
  editProfilePendingDp = null;
  $('editProfileName').value = currentUser.displayName || '';
  if ($('editProfileWhatsapp')) $('editProfileWhatsapp').value = currentUser.whatsapp || '';
  if ($('editProfileCity')) $('editProfileCity').value = currentUser.city || '';
  if ($('editProfileArea')) $('editProfileArea').value = currentUser.area || '';
  $('editProfileBio').value = currentUser.bio || '';
  $('editProfileDpPreview').src = driveImg(currentUser.dpFileId);
  $('editProfileModal').classList.remove('hidden');
};
$('closeEditProfileBtn').onclick = () => $('editProfileModal').classList.add('hidden');
$('editProfileModal').querySelector('.modal-backdrop').onclick = () => $('editProfileModal').classList.add('hidden');

$('editProfileDpInput').onchange = async () => {
  const file = $('editProfileDpInput').files[0];
  if (!file) return;
  try {
    editProfilePendingDp = await compressImage(file, 100);
    $('editProfileDpPreview').src = editProfilePendingDp;
  } catch (err) {
    showToast('Could not use image: ' + err.message);
  }
};

$('editProfileSaveBtn').onclick = (e) => guardedAction('editprofile', e.target, async () => {
  const displayName = $('editProfileName').value.trim();
  const whatsapp = $('editProfileWhatsapp') ? $('editProfileWhatsapp').value.trim() : '';
  const city = $('editProfileCity') ? $('editProfileCity').value.trim() : '';
  const area = $('editProfileArea') ? $('editProfileArea').value.trim() : '';
  const bio = $('editProfileBio').value.trim();
  if (!displayName) { showToast('Name cannot be empty.'); return; }

  const payload = { displayName, whatsapp, city, area, bio };
  if (editProfilePendingDp) payload.dpBase64 = editProfilePendingDp;

  const data = await api('editProfile', payload);
  saveSession(data.user);
  $('editProfileModal').classList.add('hidden');
  showToast('Profile updated.');
  refreshProfile();
});

// NAVIGATION
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => { singleBookId = null; goPage(btn.dataset.page); };
});
$('backBtn').onclick = () => goPage('profile');

// STAFF PANEL (Admin WhatsApp log only)
let lastStaffPanelData = null;

$('staffPanelBtn').onclick = () => guardedAction('openstaffpanel', $('staffPanelBtn'), async () => {
  let data;
  try {
    data = await api('getStaffPanel', {});
  } catch (err) {
    showToast(err.message);
    return;
  }
  lastStaffPanelData = data;
  renderStaffLog(data.whatsappAccessLog);
  $('staffPanelModal').classList.remove('hidden');
});
$('closeStaffPanelBtn').onclick = () => $('staffPanelModal').classList.add('hidden');
$('staffPanelModal').querySelector('.modal-backdrop').onclick = () => $('staffPanelModal').classList.add('hidden');

function renderStaffLog(log) {
  if (!log || !log.length) { $('staffLogTab').innerHTML = '<p class="empty-hint">No WhatsApp access logged yet.</p>'; return; }
  $('staffLogTab').innerHTML = log.map(l => `
    <div class="req-card">
      <div class="req-card-body">
        <div class="name">${escapeHtml(l.UserName)} → ${escapeHtml(l.OwnerName)}</div>
        <div class="meta">"${escapeHtml(l.BookName)}" · ${l.DurationDays ? l.DurationDays + ' days' : ''} · ${formatDate(l.AccessedAt)}</div>
      </div>
    </div>`).join('');
}

// CUSTOMIZABLE BUTTON BACKGROUNDS (Supports local assets or Google Drive File IDs)
function applyCustomStatBgImages() {
  try {
    const cfg = (typeof BH_CONFIG !== 'undefined' ? BH_CONFIG : {}) ||
                (typeof window !== 'undefined' && window.STAT_BG_CONFIG ? window.STAT_BG_CONFIG : {});

    if (cfg.myBooksImage) {
      const btn = document.querySelector('.square-btn[data-filter="mine"]');
      if (btn) btn.style.backgroundImage = `url("${cfg.myBooksImage.startsWith('http') || cfg.myBooksImage.startsWith('/') || cfg.myBooksImage.startsWith('assets/') ? cfg.myBooksImage : driveImg(cfg.myBooksImage)}")`;
    }
    if (cfg.borrowedImage) {
      const btn = document.querySelector('.square-btn[data-filter="borrowed"]');
      if (btn) btn.style.backgroundImage = `url("${cfg.borrowedImage.startsWith('http') || cfg.borrowedImage.startsWith('/') || cfg.borrowedImage.startsWith('assets/') ? cfg.borrowedImage : driveImg(cfg.borrowedImage)}")`;
    }
    if (cfg.lentOutImage) {
      const btn = document.querySelector('.square-btn[data-filter="lent"]');
      if (btn) btn.style.backgroundImage = `url("${cfg.lentOutImage.startsWith('http') || cfg.lentOutImage.startsWith('/') || cfg.lentOutImage.startsWith('assets/') ? cfg.lentOutImage : driveImg(cfg.lentOutImage)}")`;
    }
  } catch (e) {
    console.warn('Could not set custom stat background images:', e);
  }
}

// BOOT
(function boot() {
  applyCustomStatBgImages();
  const startHash = (location.hash || '').slice(1);
  if (currentUser) {
    renderPage(PAGES.includes(startHash) ? startHash : 'profile');
    setTimeout(() => {
      refreshBooks();
      refreshFeaturedPosts();
      startNotificationPolling();
      initPushNotifications();
    }, 100);
  } else {
    showAuthTab('loginForm');
    renderPage('auth');
    initPushNotifications();
  }
  setTimeout(hideBootLoader, 200);
})();

// PWA INSTALL
let deferredInstallPrompt = null;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandalone && !localStorage.getItem('bh_install_dismissed')) {
    const banner = $('installBanner');
    if (banner) banner.classList.remove('hidden');
  }
});

if (isIos && !isStandalone && !localStorage.getItem('bh_install_dismissed')) {
  const bannerText = $('installBannerText');
  const bannerBtn = $('installBannerBtn');
  const banner = $('installBanner');
  if (bannerText) bannerText.textContent = 'Add Baitul Hikmah to your Home Screen: tap Share, then "Add to Home Screen".';
  if (bannerBtn) bannerBtn.textContent = 'Got it';
  if (banner) banner.classList.remove('hidden');
}

function triggerAppInstall() {
  if (isStandalone) {
    showToast('Baitul Hikmah is already installed as an app!');
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('Thank you for installing Baitul Hikmah!');
      }
      deferredInstallPrompt = null;
    });
    return;
  }

  // Show step-by-step install instructions in a modal
  const modal = $('installGuideModal');
  const content = $('installGuideContent');
  if (modal && content) {
    if (isIos) {
      content.innerHTML = `
        <div style="text-align:left; color:var(--text);">
          <p style="margin-top:0;"><b>To install on iPhone / iPad:</b></p>
          <ol style="padding-left:20px; margin:10px 0; line-height:1.6;">
            <li style="margin-bottom:8px;">Tap the <b>Share</b> button <span style="font-size:1.1rem; vertical-align:middle;">⎋</span> in Safari.</li>
            <li style="margin-bottom:8px;">Scroll down in the menu and tap <b>"Add to Home Screen"</b> <span style="font-size:1.1rem; vertical-align:middle;">➕</span>.</li>
            <li>Tap <b>"Add"</b> in the top right corner.</li>
          </ol>
          <p style="font-size:0.78rem; color:var(--text-dim); margin:8px 0 12px 0; font-style:italic;">Note: Make sure you open this site in <b>Safari</b> on iOS to install.</p>
          <button id="copyAppLinkBtn" type="button" class="btn btn-ghost btn-wide" style="font-size:0.8rem; padding:8px;">🔗 Copy Direct Web App Link</button>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div style="text-align:left; color:var(--text);">
          <p style="margin-top:0;"><b>To install on Android / Chrome:</b></p>
          <ol style="padding-left:20px; margin:10px 0; line-height:1.6;">
            <li style="margin-bottom:8px;">Tap the <b>3 dots menu</b> (⋮) in your browser top right corner.</li>
            <li style="margin-bottom:8px;">Tap <b>"Install app"</b> or <b>"Add to Home screen"</b>.</li>
            <li>Confirm by tapping <b>"Install"</b> or <b>"Add"</b>.</li>
          </ol>
          <button id="copyAppLinkBtn" type="button" class="btn btn-ghost btn-wide" style="font-size:0.8rem; padding:8px; margin-top:8px;">🔗 Copy Direct Web App Link</button>
        </div>
      `;
    }
    modal.classList.remove('hidden');

    const copyBtn = $('copyAppLinkBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          showToast('App link copied to clipboard!');
        }).catch(() => {
          showToast('App URL: ' + window.location.href);
        });
      };
    }
  } else {
    if (isIos) {
      showToast('To install on iPhone: tap Share ⎋ -> "Add to Home Screen"');
    } else {
      showToast('To install: tap browser menu (⋮) -> "Install app"');
    }
  }
}

// Bind click events to all permanent install buttons
['topbarTitleBtn', 'authBrandBtn', 'installBannerBtn'].forEach(id => {
  const btn = $(id);
  if (btn) btn.onclick = triggerAppInstall;
});

const bannerDismissBtn = $('installBannerDismiss');
if (bannerDismissBtn) {
  bannerDismissBtn.onclick = () => {
    localStorage.setItem('bh_install_dismissed', '1');
    const banner = $('installBanner');
    if (banner) banner.classList.add('hidden');
  };
}

// Modal close handlers for install guide
if ($('closeInstallGuideBtn')) $('closeInstallGuideBtn').onclick = () => $('installGuideModal').classList.add('hidden');
if ($('installGuideOkBtn')) $('installGuideOkBtn').onclick = () => $('installGuideModal').classList.add('hidden');
if ($('installGuideModal') && $('installGuideModal').querySelector('.modal-backdrop')) {
  $('installGuideModal').querySelector('.modal-backdrop').onclick = () => $('installGuideModal').classList.add('hidden');
}
