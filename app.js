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

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString();
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

  PAGES.forEach(p => $('page-' + p).classList.toggle('hidden', p !== name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));

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
  if (name === 'members') refreshMembers();
  if (name === 'liveupdate') refreshFullLiveUpdates();
  if (name === 'featured') refreshFeaturedPosts();

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

$('signupForm').onsubmit = (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  guardedAction('signup', btn, async () => {
    $('signupError').textContent = '';
    let dpBase64 = '';
    const f = $('signupDp').files[0];
    if (f) dpBase64 = await compressImage(f, 100);

    const data = await api('signup', {
      displayName: $('signupName').value.trim(),
      whatsapp: $('signupWhatsapp').value.trim(),
      email: $('signupEmail').value.trim(),
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
    $('profileIdNum').textContent = data.profile.id;
    $('profileGreeting').textContent = "Assalamu a'laikum, " + data.profile.displayName + "! 👋";
    $('profileDpImg').src = driveImg(data.profile.dpFileId);
    $('profileLevelBadge').textContent = 'Lv ' + data.profile.level;
    $('profileBioLine').textContent = data.profile.bio || '';
    $('profileBioLine').classList.toggle('hidden', !data.profile.bio);
    $('totalSuccessfulBorrows').textContent = data.totalSuccessfulBorrows || 0;
    $('totalSuccessfulReturns').textContent = data.totalSuccessfulReturns || 0;
    $('hadithStripText').textContent = data.todayHadith || '';
    $('hadithStrip').classList.toggle('hidden', !data.todayHadith);
    $('myBooksCount').textContent = data.profile.myBooksCount || 0;
    $('borrowedCount').textContent = data.profile.borrowedCount || 0;
    $('lentOutCount').textContent = data.profile.lentOutCount || 0;
    $('cubeBookCount').textContent = data.totalBooksCount || 0;
    $('cubeMemberCount').textContent = data.totalMembersCount || 0;

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

$('exploreCube').onclick = () => { currentExploreFilter = 'all'; singleBookId = null; goPage('explore'); };
$('membersCube').onclick = () => goPage('members');
$('addBookCta').onclick = () => goPage('addbooks');

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
    const statusText = b.status === 'available'
      ? 'Available'
      : 'Unavailable till ' + formatDate(b.dueDate) + (b.borrowerName ? ' · with ' + escapeHtml(b.borrowerName) : '');
    const statusClass = b.status === 'available' ? 'available' : 'unavailable';
    const pageBadge = b.pageCount ? `<div class="page-count-badge">${escapeHtml(String(b.pageCount))}p</div>` : '';
    const hiddenBadge = (isStaff && b.hidden) ? ' <span class="role-badge hidden-badge">HIDDEN</span>' : '';

    return `<div class="book-card" onclick="openBookModal('${b.bookId}')">
      <div class="book-cover-wrap">
        <img src="${driveImg(b.imageFileId)}" alt="">
        ${pageBadge}
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

  if (currentUser && currentUser.isStaff) {
    hideBtn.classList.remove('hidden');
    hideBtn.textContent = b.hidden ? 'Unhide this book' : 'Hide this book';
  } else {
    hideBtn.classList.add('hidden');
  }

  if (b.isMine) {
    editIcon.classList.remove('hidden');
    statusEl.textContent = b.status === 'available'
      ? 'This is your book — available.'
      : 'Currently lent out' + (b.borrowerName ? ' to ' + b.borrowerName : '') + ' — due ' + formatDate(b.dueDate);
    deleteBtn.classList.remove('hidden');
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
  $('editMetaModal').classList.remove('hidden');
};

// MEMBERS PAGE
let lastMembersData = null;

function renderMembersUI(data) {
  allMembers = data.members || [];
  const isStaff = currentUser && currentUser.isStaff;

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
    return `
    <div class="member-card">
      <div class="dp-wrap">
        <img src="${driveImg(m.dpFileId)}" alt="">
        <span class="level-badge" title="Level ${m.level}">Lv ${m.level}</span>
      </div>
      <div class="member-body">
        <div class="name">${escapeHtml(m.displayName)}${hiddenTag}</div>
        ${m.bio ? `<div class="bio">${escapeHtml(m.bio)}</div>` : ''}
        <div class="stats">Owns ${m.ownedBooks} · Lent ${m.lentOut} · Borrowed ${m.borrowed}</div>
      </div>
      ${isSelf ? '' : `<button class="salam-btn ${cooldownActive ? 'faded' : ''}" ${cooldownActive ? 'disabled' : ''} onclick="sendSalam(this,'${m.id}')">Send Salam!</button>`}
    </div>`;
  }).join('');
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

function renderFullLiveUpdateList(data) {
  const container = $('fullLiveUpdateList');
  if (!data.updates || !data.updates.length) {
    container.classList.add('empty-hint');
    container.textContent = 'No updates yet — stay tuned!';
    return;
  }
  container.classList.remove('empty-hint');
  container.innerHTML = data.updates.map(u => `
    <div class="fb-item">
      ${u.imageFileId ? `<img class="fb-thumb" src="${driveImg(u.imageFileId)}" alt="">` : `<div class="fb-icon">${pickEventIcon(u.text)}</div>`}
      <div class="fb-body">
        <div class="fb-text">${escapeHtml(u.text)}</div>
        <div class="fb-time">${timeAgo(u.createdAt)}</div>
      </div>
    </div>`).join('');
}

async function refreshFullLiveUpdates() {
  if (lastLiveUpdateData) renderFullLiveUpdateList(lastLiveUpdateData);
  else { $('fullLiveUpdateList').classList.add('empty-hint'); $('fullLiveUpdateList').textContent = 'Loading updates…'; }

  try {
    const data = await api('getLiveUpdates', {});
    lastLiveUpdateData = data;
    renderFullLiveUpdateList(data);
  } catch (err) {
    if (!lastLiveUpdateData) $('fullLiveUpdateList').textContent = err.message;
  }
}

// FEATURED BOOK PAGES (#16)
async function refreshFeaturedPosts() {
  const container = $('featuredGallery');
  if (!featuredLoadedOnce) container.innerHTML = '<p class="empty-hint">Loading featured posts…</p>';
  else renderFeaturedGallery();

  try {
    const data = await api('getFeaturedPosts', {});
    allFeaturedPosts = data.posts || [];
    featuredLoadedOnce = true;
    renderFeaturedGallery();
  } catch (err) {
    if (!featuredLoadedOnce) container.innerHTML = '<p class="empty-hint">No featured posts yet.</p>';
  }
}

$('featuredSearch').oninput = () => renderFeaturedGallery();
$('featuredSort').onchange = () => renderFeaturedGallery();

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

  gallery.innerHTML = list.map(p => `
    <div class="featured-card" onclick="openFeaturedZoomModal('${p.id}')">
      <div class="featured-card-img-wrap">
        <img src="${driveImg(p.imageFileId)}" alt="">
      </div>
      <div class="featured-card-body">
        <div class="featured-book-title">${escapeHtml(p.bookName || 'Featured Excerpt')}</div>
        <div class="featured-post-owner">By ${escapeHtml(p.memberName || 'Member')}</div>
      </div>
    </div>
  `).join('');
}

window.openFeaturedZoomModal = (postId) => {
  const p = allFeaturedPosts.find(x => x.id === postId);
  if (!p) return;
  $('zoomBookTitle').textContent = p.bookName || 'Book Page Excerpt';
  $('zoomMetaLine').textContent = 'Shared by ' + (p.memberName || 'Member') + ' · ' + (p.writer ? 'Writer: ' + p.writer : '');
  $('zoomModalImg').src = driveImg(p.imageFileId);
  $('featuredZoomModal').classList.remove('hidden');
};

$('closeFeaturedZoomBtn').onclick = () => $('featuredZoomModal').classList.add('hidden');
$('closeFeaturedZoomBackdrop').onclick = () => $('featuredZoomModal').classList.add('hidden');

// POST FEATURED MODAL
$('openPostFeaturedBtn').onclick = () => {
  selectedFeaturedBook = null;
  pendingFeaturedImageB64 = '';
  $('featuredImageInput').value = '';
  $('featuredImgPreviewWrap').classList.add('hidden');
  $('selectedFeaturedBookId').value = '';
  $('selectedFeaturedBookLabel').textContent = '';
  $('featuredBookSearch').value = '';
  $('featuredBookSearchResults').innerHTML = '';
  $('postFeaturedError').textContent = '';
  $('confirmPostFeaturedBtn').disabled = true;
  $('postFeaturedModal').classList.remove('hidden');
};

$('closePostFeaturedBtn').onclick = () => $('postFeaturedModal').classList.add('hidden');
$('postFeaturedModal').querySelector('.modal-backdrop').onclick = () => $('postFeaturedModal').classList.add('hidden');

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

  await api('addFeaturedPost', {
    imageBase64: pendingFeaturedImageB64,
    bookId: selectedFeaturedBook.bookId,
    bookName: selectedFeaturedBook.bookName,
    writer: selectedFeaturedBook.writer
  }).catch(err => { $('postFeaturedError').textContent = err.message; throw err; });

  $('postFeaturedModal').classList.add('hidden');
  showToast('Posted excerpt to Featured section!');
  refreshFeaturedPosts();
  refreshFullLiveUpdates();
});

// ADD BOOKS PAGE
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
      pendingBookFiles.push({ base64, bookName: '', writer: '', publisher: '', pageCount: '' });
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

  if (editMetaContext.mode === 'pending') {
    const pf = pendingBookFiles[editMetaContext.index];
    if (pf) { pf.bookName = bookName; pf.writer = writer; pf.publisher = publisher; pf.pageCount = pageCount; }
    $('editMetaModal').classList.add('hidden');
    renderAddPreview();
    return;
  }

  const bookId = editMetaContext.bookId;
  $('editMetaModal').classList.add('hidden');
  await api('editBook', { bookId, bookName, writer, publisher, pageCount });
  showToast('Book details updated.');
  if (activeModalBook && activeModalBook.bookId === bookId) {
    activeModalBook.bookName = bookName; activeModalBook.writer = writer; activeModalBook.publisher = publisher; activeModalBook.pageCount = pageCount;
    openBookModal(bookId);
  }
  refreshBooks();
});

$('uploadBooksBtn').onclick = (e) => guardedAction('uploadbooks', e.target, async () => {
  if (!pendingBookFiles.length) return;
  $('addBooksError').textContent = '';
  $('addBooksSuccess').textContent = '';
  const data = await api('addBooks', { files: pendingBookFiles })
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
  const bio = $('editProfileBio').value.trim();
  if (!displayName) { showToast('Name cannot be empty.'); return; }

  const payload = { displayName, bio };
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
    $('installBanner').classList.remove('hidden');
  }
});

if (isIos && !isStandalone && !localStorage.getItem('bh_install_dismissed')) {
  $('installBannerText').textContent = 'Add Baitul Hikmah to your Home Screen: tap Share, then "Add to Home Screen".';
  $('installBannerBtn').textContent = 'Got it';
  $('installBanner').classList.remove('hidden');
}

$('installBannerBtn').onclick = async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  }
  $('installBanner').classList.add('hidden');
};
$('installBannerDismiss').onclick = () => {
  localStorage.setItem('bh_install_dismissed', '1');
  $('installBanner').classList.add('hidden');
};
