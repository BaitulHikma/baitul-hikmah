// ============================================================================
// BAITUL HIKMAH — Frontend Application Logic
// Plain vanilla JS. No frameworks, no build step.
// ============================================================================

// STATE
let currentUser = JSON.parse(localStorage.getItem('bh_user') || 'null');
let allBooks = [];
let allMembers = [];
let allFeaturedPosts = [];
let booksLoadedOnce = false;
let membersLoadedOnce = false;
let featuredLoadedOnce = false;
let profileData = null;
let currentExploreFilter = 'all';
let singleBookId = null;
let activeModalBook = null;
let editMetaContext = null;
let pendingBookFiles = [];
let selectedFeaturedBook = null;
let pendingFeaturedImageB64 = '';

const PAGES = ['auth', 'profile', 'explore', 'members', 'liveupdate', 'featured', 'addbooks'];

// HELPERS
function $(id) { return document.getElementById(id); }

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
  if (t.includes('featured')) return '📖';
  return '🔔';
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
    body.token = body.token || currentUser.token;
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
}
function clearSession() {
  currentUser = null;
  localStorage.removeItem('bh_user');
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
    $('staffPanelBtn').classList.toggle('hidden', !currentUser.isStaff);
    checkNotifRedDot();
  }

  if (name === 'profile') refreshProfile();
  if (name === 'explore') refreshBooks();
  if (name === 'members') {
    refreshMembers();
    refreshFullLiveUpdates();
  }
  if (name === 'featured') {
    refreshFeaturedPosts();
    $('featuredRedDot').classList.add('hidden');
    if (allFeaturedPosts.length > 0) {
      localStorage.setItem('bh_seen_featured_id', allFeaturedPosts[0].id);
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
async function refreshProfile() {
  if (!currentUser) return;
  try {
    const data = await api('getProfile', {});
    profileData = data;
    const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const setSrc = (id, val) => { const el = $(id); if (el) el.src = val; };
    setTxt('profileIdNum', data.profile.id);
    setTxt('profileDisplayName', data.profile.displayName);
    const firstName = (data.profile.displayName || '').split(' ')[0] || data.profile.displayName;
    setTxt('profileGreeting', "Assalamu a'laikum, " + firstName + "! 👋");
    setSrc('profileDpImg', driveImg(data.profile.dpFileId));
    setTxt('profileLevelBadge', 'Lv ' + data.profile.level);

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
    setTxt('cubeBookCount', data.totalBooksCount || 0);
    setTxt('cubeMemberCount', data.totalMembersCount || 0);

    renderRequestFeed('incomingRequestsList', data.incomingRequests, 'incoming');
    renderRequestFeed('outgoingRequestsList', data.outgoingRequests, 'outgoing');
    renderRequestFeed('borrowedList', data.borrowedBooks, 'borrowed');
    renderRequestFeed('lentOutList', data.lentOutBooks, 'lentout');
    renderRequestFeed('returnRequestsList', data.returnRequests, 'return');
  } catch (err) {
    showToast(err.message);
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
  if (isFirstLoad) $('bookGrid').innerHTML = '<p class="empty-hint">Loading…</p>';
  else renderBookGrid();

  try {
    const data = await api('listBooks', {});
    allBooks = data.books || [];
    booksLoadedOnce = true;

    const totalEl = $('exploreTotalCount');
    if (totalEl) totalEl.textContent = 'Total: ' + allBooks.length + ' book' + (allBooks.length === 1 ? '' : 's');

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

  // Hide hidden books for non-staff users unless owned
  const isStaff = currentUser && currentUser.isStaff;
  list = list.filter(b => !b.hidden || isStaff || b.isMine);

  if (singleBookId) {
    list = list.filter(b => b.bookId === singleBookId);
  } else {
    if (currentExploreFilter === 'mine') list = list.filter(b => b.isMine);
    else if (currentExploreFilter === 'lent') list = list.filter(b => b.isMine && b.status === 'borrowed');
    else if (currentExploreFilter === 'requesting') list = list.filter(b => !!b.myPendingRequestId);
    else if (currentExploreFilter === 'requested') list = list.filter(b => !!b.myPendingRequestId);
    else if (currentExploreFilter === 'borrowed') {
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
    const hiddenBadge = (isStaff && b.hidden) ? ' <span class="role-badge hidden-badge">HIDDEN</span>' : '';

    return `<div class="book-card" onclick="openBookModal('${b.bookId}')">
      <div class="book-cover-wrap" style="position:relative;">
        <img src="${driveImg(b.imageFileId)}" alt="">
        <div class="book-cover-badges">
          ${pageBadge}
          ${pdfBadge}
        </div>
      </div>
      <div class="book-card-body">
        <div class="name">${escapeHtml(b.bookName || 'Untitled')}${hiddenBadge}</div>
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
  const hideBtn = $('modalHideBookBtn');

  borrowArea.classList.add('hidden');
  cancelBtn.classList.add('hidden');
  deleteBtn.classList.add('hidden');
  editIcon.classList.add('hidden');
  waBtn.classList.add('disabled');
  waBtn.removeAttribute('href');

  const isPdfBook = b.isPdf || (b.downloadLink && String(b.downloadLink).trim().length > 5);

  if (currentUser && currentUser.isStaff) {
    hideBtn.classList.remove('hidden');
    hideBtn.textContent = b.hidden ? 'Unhide this book' : 'Hide this book';
  } else {
    hideBtn.classList.add('hidden');
  }

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
    // PDF books do NOT have "Request to borrow"
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

$('closeModalBtn').onclick = () => $('bookModal').classList.add('hidden');
$('bookModal').querySelector('.modal-backdrop').onclick = () => $('bookModal').classList.add('hidden');

$('modalWhatsappBtn').onclick = (e) => {
  e.preventDefault();
  if ($('modalWhatsappBtn').classList.contains('disabled')) return;
  $('waConfirmPassword').value = '';
  $('waConfirmError').textContent = '';
  $('waConfirmModal').classList.remove('hidden');
  $('waConfirmPassword').focus();
};

$('modalHideBookBtn').onclick = (e) => guardedAction('hidebook', e.target, async () => {
  if (!activeModalBook) return;
  const b = activeModalBook;
  const newHidden = !b.hidden;
  b.hidden = newHidden;
  renderModalStatusArea(b);
  try {
    await api('setHidden', { targetType: 'book', targetId: b.bookId, hidden: newHidden });
    showToast(newHidden ? 'Book hidden from public library.' : 'Book is visible in public library.');
    refreshBooks();
  } catch (err) {
    b.hidden = !newHidden;
    renderModalStatusArea(b);
    throw err;
  }
});

$('closeWaConfirmBtn').onclick = () => $('waConfirmModal').classList.add('hidden');
$('waConfirmModal').querySelector('.modal-backdrop').onclick = () => $('waConfirmModal').classList.add('hidden');

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
let lastMembersData = null;

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
  const isStaff = currentUser && currentUser.isStaff;

  const totalEl = $('membersTotalCount');
  if (totalEl) totalEl.textContent = (data.totalMembersCount || allMembers.length);

  // Filter hidden users for non-staff members (#11)
  const visibleMembers = allMembers.filter(m => !m.hidden || isStaff);

  const lb = data.leaderboard || {};
  const lbParts = [];
  if (lb.topOwner) lbParts.push(`<div class="lb-item">📚 <b>${escapeHtml(lb.topOwner.name)}</b> — top book owner (${lb.topOwner.count} books)</div>`);
  if (lb.topBorrower) lbParts.push(`<div class="lb-item">🤝 <b>${escapeHtml(lb.topBorrower.name)}</b> — top borrower (${lb.topBorrower.count} books)</div>`);
  if (lb.topRequester) lbParts.push(`<div class="lb-item">🙋 <b>${escapeHtml(lb.topRequester.name)}</b> — most active requester (${lb.topRequester.count})</div>`);
  const lbEl = $('membersLeaderboard');
  if (lbParts.length) { lbEl.classList.remove('hidden'); lbEl.innerHTML = lbParts.join(''); }
  else { lbEl.classList.add('hidden'); }

  $('membersList').innerHTML = visibleMembers.map(m => {
    const cooldownActive = m.salamCooldownUntil && new Date(m.salamCooldownUntil) > new Date();
    const isSelf = currentUser && String(m.id) === String(currentUser.id);
    const hiddenTag = (isStaff && m.hidden) ? ' <span class="role-badge hidden-badge">HIDDEN</span>' : '';
    const clickHandler = isStaff ? `onclick="openMemberDetailModal('${m.id}')" style="cursor:pointer;"` : '';
    const statsText = (m.ownedBooks != null) ? `Owns ${m.ownedBooks} · Lent ${m.lentOut} · Borrowed ${m.borrowed}` : `Role: ${m.role || 'Member'}`;

    return `
    <div class="member-card" ${clickHandler}>
      <div class="dp-wrap">
        <img src="${driveImg(m.dpFileId)}" alt="">
        <span class="level-badge" title="Level ${m.level}">Lv ${m.level || 1}</span>
      </div>
      <div class="member-body">
        <div class="name">${escapeHtml(m.displayName || m.name)}${hiddenTag}</div>
        ${m.bio ? `<div class="bio">${escapeHtml(m.bio)}</div>` : ''}
        <div class="stats">${statsText}</div>
      </div>
      ${isSelf ? '' : `<button class="salam-btn ${cooldownActive ? 'faded' : ''}" ${cooldownActive ? 'disabled' : ''} onclick="event.stopPropagation(); sendSalam(this,'${m.id}')">Send Salam!</button>`}
    </div>`;
  }).join('');
}

window.openMemberDetailModal = (memberId) => {
  const m = allMembers.find(x => x.id === memberId) || (lastStaffPanelData && lastStaffPanelData.members && lastStaffPanelData.members.find(x => x.id === memberId));
  if (!m) return;
  const content = $('memberDetailContent');
  if (!content) return;

  const isStaff = currentUser && currentUser.isStaff;
  const isAdmin = currentUser && currentUser.isAdmin;

  content.innerHTML = `
    <div style="text-align:center; margin-bottom:12px;">
      <img src="${driveImg(m.dpFileId)}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:2px solid var(--accent); margin:0 auto;">
      <h4 style="margin:8px 0 2px;">${escapeHtml(m.displayName || m.name)}</h4>
      <p style="color:var(--text-dim); font-size:0.8rem; margin:0;">ID: ${escapeHtml(m.id)}</p>
    </div>
    <div class="member-detail-row"><span class="member-detail-label">Email:</span><span class="member-detail-val">${escapeHtml(m.email || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">WhatsApp:</span><span class="member-detail-val">${escapeHtml(m.whatsapp || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">City:</span><span class="member-detail-val">${escapeHtml(m.city || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Near Area:</span><span class="member-detail-val">${escapeHtml(m.area || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Bio:</span><span class="member-detail-val">${escapeHtml(m.bio || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Reference:</span><span class="member-detail-val">${escapeHtml(m.reference || '—')}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Joined:</span><span class="member-detail-val">${formatDate(m.joinedAt) || '—'}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Role:</span><span class="member-detail-val">${m.role ? m.role.toUpperCase() : 'Member'}</span></div>
    <div class="member-detail-row"><span class="member-detail-label">Status:</span><span class="member-detail-val">${m.hidden ? 'HIDDEN' : 'Active'}</span></div>
    ${isStaff ? `
      <div style="margin-top:16px; display:flex; gap:8px;">
        ${isAdmin ? `<button class="btn btn-secondary btn-wide" onclick="toggleModerator(this,'${m.id}', ${m.role !== 'moderator'})">${m.role === 'moderator' ? 'Remove Mod' : 'Make Mod'}</button>` : ''}
        <button class="btn btn-ghost btn-wide" onclick="toggleHidden(this,'user','${m.id}', ${!m.hidden})">${m.hidden ? 'Unhide User' : 'Hide User'}</button>
      </div>
    ` : ''}
  `;
  if ($('memberDetailModal')) $('memberDetailModal').classList.remove('hidden');
};

if ($('closeMemberDetailBtn')) $('closeMemberDetailBtn').onclick = () => $('memberDetailModal').classList.add('hidden');
if ($('memberDetailModal') && $('memberDetailModal').querySelector('.modal-backdrop')) {
  $('memberDetailModal').querySelector('.modal-backdrop').onclick = () => $('memberDetailModal').classList.add('hidden');
}

async function refreshMembers() {
  const isFirstLoad = !membersLoadedOnce;
  if (isFirstLoad) $('membersList').innerHTML = '<p class="empty-hint">Loading members…</p>';
  else if (lastMembersData) renderMembersUI(lastMembersData);

  try {
    const data = await api('listMembers', {});
    lastMembersData = data;
    membersLoadedOnce = true;
    renderMembersUI(data);
  } catch (err) {
    if (isFirstLoad) { showToast(err.message); $('membersList').innerHTML = ''; }
  }
}

window.sendSalam = (btn, targetId) => guardedAction('salam-' + targetId, btn, async () => {
  btn.classList.add('faded');
  btn.disabled = true;
  await api('sendSalam', { targetId }).catch(err => { btn.classList.remove('faded'); btn.disabled = false; throw err; });
  showToast('Salam sent!');
  setTimeout(() => { btn.classList.remove('faded'); btn.disabled = false; }, 30 * 60 * 1000);
});

// FULL LIVE UPDATE PAGE (#15)
let lastLiveUpdateData = null;
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

// FEATURED BOOK PAGES (#16 & #18)
async function refreshFeaturedPosts() {
  const container = $('featuredGallery');
  if (!featuredLoadedOnce) {
    container.innerHTML = `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div></div><div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div></div>`;
  } else {
    renderFeaturedGallery();
  }

  try {
    const data = await api('getFeaturedPosts', {});
    allFeaturedPosts = data.posts || [];
    featuredLoadedOnce = true;

    // Check for unread featured posts for dot indicator
    const lastSeenId = localStorage.getItem('bh_seen_featured_id');
    if (allFeaturedPosts.length > 0 && allFeaturedPosts[0].id !== lastSeenId) {
      if (location.hash !== '#featured') {
        $('featuredRedDot').classList.remove('hidden');
      }
    }

    renderFeaturedGallery();
  } catch (err) {
    if (!featuredLoadedOnce) container.innerHTML = '<p class="empty-hint">No featured posts yet.</p>';
  }
}

$('featuredSearch').oninput = () => renderFeaturedGallery();
$('featuredSort').onchange = () => renderFeaturedGallery();

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
  const q = $('featuredSearch').value.trim().toLowerCase();
  const sort = $('featuredSort').value;
  let list = allFeaturedPosts.slice();

  if (q) {
    list = list.filter(p =>
      String(p.bookName || '').toLowerCase().includes(q) ||
      String(p.writer || '').toLowerCase().includes(q) ||
      String(p.memberName || '').toLowerCase().includes(q)
    );
  }

  if (sort === 'oldest') {
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === 'members') {
    list.sort((a, b) => String(a.memberName || '').localeCompare(String(b.memberName || '')));
  } else {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const gallery = $('featuredGallery');
  if (!list.length) {
    gallery.innerHTML = '<p class="empty-hint">No featured book pages found.</p>';
    return;
  }

  gallery.innerHTML = list.map(p => {
    const posterDp = driveImg(p.posterDpFileId);
    const mainImg = driveImg(p.imageFileId);
    const coverThumb = p.bookCoverFileId ? driveImg(p.bookCoverFileId) : '';
    const caption = p.caption || '';
    const isLongCaption = caption.length > 80;
    const captionPreview = isLongCaption ? caption.slice(0, 80) + '...' : caption;

    return `
    <div class="featured-post-card" onclick="openFeaturedZoomModal('${p.id}')">
      <div class="featured-post-header">
        <img class="featured-post-dp" src="${posterDp}" alt="">
        <div class="featured-post-user-info">
          <span class="featured-post-name">${escapeHtml(p.memberName || 'Member')}</span>
          <span class="featured-post-time">${timeAgo(p.createdAt)}</span>
        </div>
      </div>
      <div class="featured-post-img-wrap">
        <img class="featured-post-main-img" src="${mainImg}" alt="">
        ${coverThumb ? `<img class="featured-post-cover-thumb" src="${coverThumb}" alt="" title="${escapeHtml(p.bookName || '')}">` : ''}
        <div class="featured-post-book-name">${escapeHtml(p.bookName || 'Excerpt')}</div>
      </div>
      ${caption ? `
      <div class="featured-post-caption-box">
        <span class="caption-text">${escapeHtml(captionPreview)}</span>
        ${isLongCaption ? `<button type="button" class="story-caption-toggle" onclick="event.stopPropagation(); toggleCardCaption(this, '${p.id}')">See more</button>` : ''}
      </div>` : ''}
    </div>
  `;
  }).join('');
}

window.openFeaturedZoomModal = (postId) => {
  const p = allFeaturedPosts.find(x => x.id === postId);
  if (!p) return;

  const posterDp = driveImg(p.posterDpFileId);
  const mainImg = driveImg(p.imageFileId);

  const dpEl = $('storyPosterDp');
  if (dpEl) dpEl.src = posterDp;

  const nameEl = $('storyPosterName');
  if (nameEl) nameEl.textContent = p.memberName || 'Member';

  const timeEl = $('storyPostTime');
  if (timeEl) timeEl.textContent = timeAgo(p.createdAt);

  const bookEl = $('storyBookName');
  if (bookEl) bookEl.textContent = 'Book: ' + (p.bookName || 'Untitled') + (p.writer ? ' (' + p.writer + ')' : '');

  const imgEl = $('zoomModalImg') || $('storyZoomImg');
  if (imgEl) imgEl.src = mainImg;

  // Render Caption in Zoom Modal
  const captionWrap = $('storyCaptionWrap');
  const captionText = $('storyCaptionText');
  const captionToggle = $('storyCaptionToggleBtn');

  if (captionWrap && captionText) {
    if (p.caption) {
      captionWrap.classList.remove('hidden');
      const fullText = p.caption;
      const shortText = fullText.length > 90 ? fullText.slice(0, 90) + '...' : fullText;
      captionText.textContent = shortText;

      if (captionToggle) {
        if (fullText.length > 90) {
          captionToggle.classList.remove('hidden');
          captionToggle.textContent = 'See more';
          let expanded = false;
          captionToggle.onclick = (e) => {
            e.stopPropagation();
            expanded = !expanded;
            captionText.textContent = expanded ? fullText : shortText;
            captionToggle.textContent = expanded ? 'See less' : 'See more';
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
    const canDel = p.canDelete || (currentUser && (currentUser.isStaff || String(p.memberId) === String(currentUser.id)));
    deleteBtn.classList.toggle('hidden', !canDel);
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (!confirm('Delete this featured post excerpt?')) return;
      guardedAction('delfeature-' + p.id, deleteBtn, async () => {
        if ($('featuredZoomModal')) $('featuredZoomModal').classList.add('hidden');
        await api('deleteFeaturedPost', { postId: p.id }).catch(err => { refreshFeaturedPosts(); throw err; });
        showToast('Featured post deleted.');
        refreshFeaturedPosts();
      });
    };
  }

  const borrowBtn = $('storyBorrowBtn');
  if (borrowBtn) {
    borrowBtn.textContent = p.isPdf ? 'Download PDF' : 'View / Borrow Book';
    borrowBtn.onclick = (e) => {
      e.stopPropagation();
      if ($('featuredZoomModal')) $('featuredZoomModal').classList.add('hidden');
      if (p.bookId) viewBookFromProfile(p.bookId);
      else goPage('explore');
    };
  }

  if ($('featuredZoomModal')) $('featuredZoomModal').classList.remove('hidden');
};

if ($('closeFeaturedZoomBtn')) $('closeFeaturedZoomBtn').onclick = () => $('featuredZoomModal').classList.add('hidden');
if ($('closeFeaturedZoomBackdrop')) $('closeFeaturedZoomBackdrop').onclick = () => $('featuredZoomModal').classList.add('hidden');

// POST FEATURED MODAL
if ($('openPostFeaturedBtn')) {
  $('openPostFeaturedBtn').onclick = () => {
    selectedFeaturedBook = null;
    pendingFeaturedImageB64 = '';
    if ($('featuredImageInput')) $('featuredImageInput').value = '';
    if ($('featuredImgPreviewWrap')) $('featuredImgPreviewWrap').classList.add('hidden');
    if ($('selectedFeaturedBookId')) $('selectedFeaturedBookId').value = '';
    if ($('selectedFeaturedBookLabel')) $('selectedFeaturedBookLabel').textContent = '';
    if ($('featuredBookSearch')) $('featuredBookSearch').value = '';
    if ($('featuredCaptionInput')) $('featuredCaptionInput').value = '';
    if ($('featuredBookSearchResults')) $('featuredBookSearchResults').innerHTML = '';
    if ($('postFeaturedError')) $('postFeaturedError').textContent = '';
    if ($('confirmPostFeaturedBtn')) $('confirmPostFeaturedBtn').disabled = true;
    if ($('postFeaturedModal')) $('postFeaturedModal').classList.remove('hidden');
  };
}

if ($('closePostFeaturedBtn')) $('closePostFeaturedBtn').onclick = () => $('postFeaturedModal').classList.add('hidden');
if ($('postFeaturedModal') && $('postFeaturedModal').querySelector('.modal-backdrop')) {
  $('postFeaturedModal').querySelector('.modal-backdrop').onclick = () => $('postFeaturedModal').classList.add('hidden');
}

$('featuredImageInput').onchange = async () => {
  const file = $('featuredImageInput').files[0];
  if (!file) return;
  const statusEl = $('featuredCompressStatus');
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Compressing image under 100KB…';

  try {
    pendingFeaturedImageB64 = await compressImage(file, 100);
    $('featuredImgPreview').src = pendingFeaturedImageB64;
    $('featuredImgPreviewWrap').classList.remove('hidden');
    statusEl.textContent = 'Image compressed successfully.';
    validateFeaturedPostForm();
  } catch (err) {
    statusEl.textContent = 'Error compressing image: ' + err.message;
  }
};

$('featuredBookSearch').oninput = () => {
  const q = $('featuredBookSearch').value.trim().toLowerCase();
  const resultsEl = $('featuredBookSearchResults');
  if (!q) { resultsEl.innerHTML = ''; return; }

  const matches = allBooks.filter(b =>
    String(b.bookName || '').toLowerCase().includes(q) ||
    String(b.writer || '').toLowerCase().includes(q)
  ).slice(0, 5);

  if (!matches.length) {
    resultsEl.innerHTML = '<p class="empty-hint">No matching book found in library.</p>';
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

window.selectBookForFeatured = (bookId) => {
  const b = allBooks.find(x => x.bookId === bookId);
  if (!b) return;
  selectedFeaturedBook = b;
  $('selectedFeaturedBookId').value = b.bookId;
  $('selectedFeaturedBookLabel').textContent = 'Mentioned: ' + b.bookName + (b.writer ? ' (' + b.writer + ')' : '');
  $('featuredBookSearchResults').innerHTML = '';
  validateFeaturedPostForm();
};

function validateFeaturedPostForm() {
  const ok = pendingFeaturedImageB64 && selectedFeaturedBook;
  $('confirmPostFeaturedBtn').disabled = !ok;
}

$('confirmPostFeaturedBtn').onclick = (e) => guardedAction('postfeatured', e.target, async () => {
  if (!pendingFeaturedImageB64 || !selectedFeaturedBook) return;
  $('postFeaturedError').textContent = '';

  const caption = $('featuredCaptionInput') ? $('featuredCaptionInput').value.trim() : '';

  await api('addFeaturedPost', {
    imageBase64: pendingFeaturedImageB64,
    bookId: selectedFeaturedBook.bookId,
    bookName: selectedFeaturedBook.bookName,
    writer: selectedFeaturedBook.writer,
    caption: caption
  }).catch(err => { $('postFeaturedError').textContent = err.message; throw err; });

  $('postFeaturedModal').classList.add('hidden');
  showToast('Posted excerpt to Featured section!');
  refreshFeaturedPosts();
  refreshFullLiveUpdates();
});

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

async function checkNotifRedDot() {
  if (!currentUser) return;
  try {
    const data = await api('listNotifications', {});
    lastNotifData = data;
    $('notifRedDot').classList.toggle('hidden', data.unreadCount === 0);
  } catch (err) { }
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

// STAFF PANEL
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
  renderStaffMembers(data);
  renderStaffLog(data.whatsappAccessLog);
  $('staffPanelModal').classList.remove('hidden');
});
$('closeStaffPanelBtn').onclick = () => $('staffPanelModal').classList.add('hidden');
$('staffPanelModal').querySelector('.modal-backdrop').onclick = () => $('staffPanelModal').classList.add('hidden');

document.querySelectorAll('[data-stafftab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('[data-stafftab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('staffMembersTab').classList.toggle('hidden', btn.dataset.stafftab !== 'members');
    $('staffLogTab').classList.toggle('hidden', btn.dataset.stafftab !== 'log');
  };
});

function renderStaffMembers(data) {
  $('staffMembersTab').innerHTML = (data.members || []).map(m => `
    <div class="req-card">
      <div class="req-card-body">
        <div class="name">${escapeHtml(m.displayName)} ${m.role === 'moderator' ? '<span class="role-badge">MOD</span>' : ''}${m.hidden ? '<span class="role-badge hidden-badge">HIDDEN</span>' : ''}</div>
        <div class="meta">${escapeHtml(m.email)}</div>
      </div>
      <div class="req-card-actions">
        ${data.isAdmin ? `<button class="req-cancel" onclick="toggleModerator(this,'${m.id}', ${m.role !== 'moderator'})">${m.role === 'moderator' ? 'Remove mod' : 'Make mod'}</button>` : ''}
        <button class="req-cancel" onclick="toggleHidden(this,'user','${m.id}', ${!m.hidden})">${m.hidden ? 'Unhide' : 'Hide'}</button>
      </div>
    </div>`).join('');
}

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

window.toggleModerator = (btn, userId, makeModerator) => guardedAction('setmod-' + userId, btn, async () => {
  const m = lastStaffPanelData.members.find(x => x.id === userId);
  if (!m) return;
  const prevRole = m.role;
  m.role = makeModerator ? 'moderator' : '';
  renderStaffMembers(lastStaffPanelData);
  try {
    await api('setModerator', { targetUserId: userId, makeModerator });
  } catch (err) {
    m.role = prevRole;
    renderStaffMembers(lastStaffPanelData);
    throw err;
  }
});

window.toggleHidden = (btn, targetType, targetId, hidden) => guardedAction('sethidden-' + targetId, btn, async () => {
  const list = targetType === 'book' ? [] : lastStaffPanelData.members;
  const m = list.find(x => x.id === targetId);
  const prevHidden = m ? m.hidden : null;
  if (m) { m.hidden = hidden; renderStaffMembers(lastStaffPanelData); }
  try {
    await api('setHidden', { targetType, targetId, hidden });
    showToast(hidden ? 'User hidden from public directory.' : 'User is visible in directory.');
    refreshMembers();
  } catch (err) {
    if (m) { m.hidden = prevHidden; renderStaffMembers(lastStaffPanelData); }
    throw err;
  }
});

// BOOT
(function boot() {
  const startHash = (location.hash || '').slice(1);
  if (currentUser) {
    renderPage(PAGES.includes(startHash) ? startHash : 'profile');
    // Silent background pre-fetching
    setTimeout(() => {
      refreshBooks();
      refreshFeaturedPosts();
      checkNotifRedDot();
    }, 100);
  } else {
    showAuthTab('loginForm');
    renderPage('auth');
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
          <p style="font-size:0.78rem; color:var(--text-dim); margin:8px 0 0 0; font-style:italic;">Note: Make sure you open this site in <b>Safari</b> on iOS to install.</p>
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
        </div>
      `;
    }
    modal.classList.remove('hidden');
  } else {
    if (isIos) {
      showToast('To install on iPhone: tap Share ⎋ -> "Add to Home Screen"');
    } else {
      showToast('To install: tap browser menu (⋮) -> "Install app"');
    }
  }
}

// Bind click events to all permanent install buttons
['loginInstallBtn', 'signupInstallBtn', 'profileInstallBtn', 'installBannerBtn'].forEach(id => {
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
