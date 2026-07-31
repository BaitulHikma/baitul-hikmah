// ============================================================================
// BAITUL HIKMAH — Frontend Application Logic
// Plain vanilla JS. No frameworks, no build step — open index.html and go.
// ============================================================================

// ---------------------------------------------------------------- STATE ----
let currentUser = JSON.parse(localStorage.getItem('bh_user') || 'null');
let allBooks = [];
let allMembers = [];
let booksLoadedOnce = false;   // #6 — lets us render instantly from cache on
let membersLoadedOnce = false; // repeat visits instead of a spinner every time
let profileData = null;
let currentExploreFilter = 'all';
let singleBookId = null;        // set when arriving at Explore from a profile card tap
let activeModalBook = null;
let editMetaContext = null;     // { mode: 'pending', index } or { mode: 'existing', bookId }
let pendingBookFiles = [];      // [{ base64, bookName, writer, publisher }]

const PAGES = ['auth', 'profile', 'explore', 'members', 'addbooks'];

// ---------------------------------------------------------------- HELPERS --
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

// ---------------------------------------------------- DOUBLE-TAP GUARD ----
// Every action in the app (button click or form submit) runs through this.
// While a call for a given "key" is in flight, repeat taps are ignored —
// this is what stops "sign up" being submitted five times because the
// network felt slow. The button also gets an instant visual "busy" state.
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

// Shrinks an image (by quality, then by dimensions) until it's under
// maxKB. Runs entirely in the browser on a <canvas> — no server round trip.
function compressImage(file, maxKB) {
  maxKB = maxKB || 500;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.9;
        let scale = 1;
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
              if (quality > 0.35) quality -= 0.15; else scale = Math.max(0.2, scale - 0.15);
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

// Calls the Apps Script backend. We always POST as text/plain to dodge
// CORS preflight (see the big comment at the top of Code.gs).
async function api(action, payload) {
  if (!API_URL || API_URL.indexOf('PASTE_YOUR') === 0) {
    showToast('Set your Apps Script URL in config.js first.');
    throw new Error('API_URL not configured');
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

// ---------------------------------------------------------------- ROUTER ---
// The current page lives in the URL hash (#profile, #explore, ...) so a
// reload — or the browser's back button — lands you back where you were,
// instead of always bouncing to the profile page.
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
    checkNotifRedDot();
  }

  if (name === 'profile') refreshProfile();
  if (name === 'explore') refreshBooks();
  if (name === 'members') refreshMembers();

  window.scrollTo(0, 0);
}

// ================================================================ AUTH ====

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
  const b64 = await fileToBase64(f);
  $('signupDpPreview').src = b64;
  $('signupDpPreview').classList.remove('hidden');
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
    if (f) dpBase64 = await fileToBase64(f);

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
    $('forgotSuccess').textContent = 'Code sent! Check your inbox (and your spam folder).';
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

// ============================================================= PROFILE ====

async function refreshProfile() {
  if (!currentUser) return;
  try {
    // ONE call gets everything the profile page needs (counts, feeds,
    // notifications) — this used to be four separate round trips.
    const data = await api('getProfile', {});
    profileData = data;
    $('profileIdNum').textContent = data.profile.id;
    $('profileGreeting').textContent = "Assalamu a'laikum ya shabab! " + data.profile.displayName;
    $('profileDpImg').src = driveImg(data.profile.dpFileId);
    $('profileLevelBadge').textContent = 'Lv ' + data.profile.level;
    $('profileBioLine').textContent = data.profile.bio || '';
    $('profileBioLine').classList.toggle('hidden', !data.profile.bio);
    $('totalSuccessfulBorrows').textContent = data.totalSuccessfulBorrows;
    $('totalSuccessfulReturns').textContent = data.totalSuccessfulReturns;
    $('hadithStripText').textContent = data.todayHadith || '';
    $('hadithStrip').classList.toggle('hidden', !data.todayHadith);
    $('myBooksCount').textContent = data.profile.myBooksCount;
    $('borrowedCount').textContent = data.profile.borrowedCount;
    $('lentOutCount').textContent = data.profile.lentOutCount;
    $('cubeBookCount').textContent = data.totalBooksCount;
    $('cubeMemberCount').textContent = data.totalMembersCount;

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

  // Per-user request: don't clutter the profile with section headers that
  // have nothing under them — only show a section when it's actually active.
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
    // "lentout" (books I own that are currently out) has no action buttons —
    // the actual return confirmation lives in the "return" section above once
    // the borrower asks for it back; this one is just informational.
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

// Tapping a request/borrowed card in the profile jumps to Explore filtered
// down to just that one book (fix requested: "make the list clickable").
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
  showToast('Return requested — waiting for the owner to confirm.');
  refreshProfile();
});
window.confirmReturn = (btn, id) => guardedAction('confirmreturn-' + id, btn, async () => {
  btn.closest('.req-card').remove();
  await api('confirmReturn', { requestId: id }).catch(err => { refreshProfile(); throw err; });
  showToast('Return confirmed — the book is available again.');
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

// ============================================================= EXPLORE ====

async function refreshBooks() {
  // #6 — if we've already loaded books this session, show them instantly
  // (no spinner) and quietly refresh in the background. A real page reload
  // resets booksLoadedOnce to false automatically, so that still gets a
  // real fresh load as expected.
  const isFirstLoad = !booksLoadedOnce;
  if (isFirstLoad) $('bookGrid').innerHTML = '<p class="empty-hint">Loading…</p>';
  else renderBookGrid();

  try {
    const data = await api('listBooks', {});
    allBooks = data.books;
    booksLoadedOnce = true;

    if (singleBookId) {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    } else {
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === currentExploreFilter));
    }
    renderBookGrid();

    // If we arrived here to view one specific book, open it straight away.
    if (singleBookId) {
      const b = allBooks.find(x => x.bookId === singleBookId);
      if (b) openBookModal(singleBookId);
    }
  } catch (err) {
    if (isFirstLoad) { showToast(err.message); $('bookGrid').innerHTML = ''; }
    // On a background refresh, a failed silent retry shouldn't nuke what's
    // already correctly on screen — just leave the last-known-good data.
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
    if (currentExploreFilter === 'mine') list = list.filter(b => b.isMine);
    else if (currentExploreFilter === 'lent') list = list.filter(b => b.isMine && b.status === 'borrowed');
    else if (currentExploreFilter === 'requesting') list = list.filter(b => !!b.myPendingRequestId);
    else if (currentExploreFilter === 'requested') list = list.filter(b => !!b.myPendingRequestId);
    else if (currentExploreFilter === 'borrowed') {
      const borrowedIds = (profileData && profileData.borrowedBooks || []).map(r => r.bookId);
      list = list.filter(b => borrowedIds.includes(b.bookId));
    }
    if (q) list = list.filter(b =>
      (b.bookName || '').toLowerCase().includes(q) ||
      (b.writer || '').toLowerCase().includes(q) ||
      (b.ownerName || '').toLowerCase().includes(q)
    );
  }

  const grid = $('bookGrid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-hint">No books match here yet.</p>';
    return;
  }
  grid.innerHTML = list.map(b => {
    const statusText = b.status === 'available'
      ? 'Available'
      : 'Unavailable till ' + formatDate(b.dueDate) + (b.borrowerName ? ' · with ' + escapeHtml(b.borrowerName) : '');
    const statusClass = b.status === 'available' ? 'available' : 'unavailable';
    const pageBadge = b.pageCount ? `<div class="page-count-badge">${escapeHtml(String(b.pageCount))}p</div>` : '';
    return `<div class="book-card" onclick="openBookModal('${b.bookId}')">
      <div class="book-cover-wrap">
        <img src="${driveImg(b.imageFileId)}" alt="">
        ${pageBadge}
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

// ------------------------------------------------------------ BOOK MODAL --
// The modal is shown FIRST, instantly, then filled in — this both feels
// faster and guarantees the popup can never silently fail to appear again.
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
      // A pending request unlocks the WhatsApp button, as specified.
      const wa = String(b.ownerWhatsapp || '').replace(/[^0-9]/g, '');
      if (wa) {
        waBtn.classList.remove('disabled');
        waBtn.setAttribute('href', 'https://wa.me/' + wa);
      }
    } else {
      statusEl.textContent = 'Available to borrow.';
      borrowArea.classList.remove('hidden');
    }
  } catch (err) {
    showToast('Could not load full details — please try again.');
  }
};

$('closeModalBtn').onclick = () => $('bookModal').classList.add('hidden');
$('bookModal').querySelector('.modal-backdrop').onclick = () => $('bookModal').classList.add('hidden');

$('modalRequestBtn').onclick = (e) => guardedAction('borrow-' + activeModalBook.bookId, e.target, async () => {
  const book = activeModalBook;
  $('bookModal').classList.add('hidden');
  await api('requestBorrow', {
    bookId: book.bookId,
    durationDays: parseInt($('modalDuration').value, 10) || 7
  }).catch(err => { refreshBooks(); throw err; });
  showToast('Borrow request sent!');
  refreshBooks();
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
  if (!confirm('Delete "' + (activeModalBook.bookName || 'this book') + '" from the library?')) return;
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

// ========================================================= MEMBERS =========

let lastMembersData = null; // cached full response (includes leaderboard), for instant re-render

function renderMembersUI(data) {
  allMembers = data.members;

  const lb = data.leaderboard || {};
  const lbParts = [];
  if (lb.topOwner) lbParts.push(`<div class="lb-item">📚 <b>${escapeHtml(lb.topOwner.name)}</b> — top owner (${lb.topOwner.count})</div>`);
  if (lb.topBorrower) lbParts.push(`<div class="lb-item">🤝 <b>${escapeHtml(lb.topBorrower.name)}</b> — top borrower (${lb.topBorrower.count})</div>`);
  if (lb.topRequester) lbParts.push(`<div class="lb-item">🙋 <b>${escapeHtml(lb.topRequester.name)}</b> — most active (${lb.topRequester.count})</div>`);
  const lbEl = $('membersLeaderboard');
  if (lbParts.length) { lbEl.classList.remove('hidden'); lbEl.innerHTML = lbParts.join(''); }
  else { lbEl.classList.add('hidden'); }

  $('membersList').innerHTML = allMembers.map(m => {
    const cooldownActive = m.salamCooldownUntil && new Date(m.salamCooldownUntil) > new Date();
    const isSelf = currentUser && String(m.id) === String(currentUser.id);
    return `
    <div class="member-card">
      <div class="dp-wrap">
        <img src="${driveImg(m.dpFileId)}" alt="">
        <span class="level-badge" title="Level ${m.level}">Lv ${m.level}</span>
      </div>
      <div class="member-body">
        <div class="name">${escapeHtml(m.displayName)}</div>
        ${m.bio ? `<div class="bio">${escapeHtml(m.bio)}</div>` : ''}
        <div class="stats">Owns ${m.ownedBooks} · Lent ${m.lentOut} · Borrowed ${m.borrowed}</div>
      </div>
      ${isSelf ? '' : `<button class="salam-btn ${cooldownActive ? 'faded' : ''}" ${cooldownActive ? 'disabled' : ''} onclick="sendSalam(this,'${m.id}')">Send Salam!</button>`}
    </div>`;
  }).join('');
}

async function refreshMembers() {
  const isFirstLoad = !membersLoadedOnce;
  if (isFirstLoad) $('membersList').innerHTML = '<p class="empty-hint">Loading…</p>';
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

// ======================================================== ADD BOOKS =======

$('bookFilesInput').onchange = async () => {
  const files = Array.from($('bookFilesInput').files);
  if (!files.length) return;
  pendingBookFiles = [];
  const statusEl = $('compressStatus');
  statusEl.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    statusEl.textContent = 'Compressing image ' + (i + 1) + ' of ' + files.length + '…';
    try {
      const base64 = await compressImage(files[i], 100);
      pendingBookFiles.push({ base64, bookName: '', writer: '', publisher: '', pageCount: '' });
    } catch (err) {
      showToast('Skipped one image: ' + err.message);
    }
    renderAddPreview();
  }
  statusEl.textContent = pendingBookFiles.length + ' image(s) ready — under 100KB each.';
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

  // mode === 'existing': this book is already in the library — save to the server.
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

  $('addBooksSuccess').textContent = data.added.length + ' book(s) added to the library.';
  pendingBookFiles = [];
  $('bookFilesInput').value = '';
  $('addBooksPreview').innerHTML = '';
  $('uploadBooksBtn').disabled = true;
  showToast('Books uploaded!');
  if (data.leveledUp) showToast('🎉 Level up! You reached Level ' + data.newLevel + '!');
});

// ============================================== SIGNUP GREETING POPUP (#13)
$('greetingPopupOkBtn').onclick = () => $('greetingPopupModal').classList.add('hidden');

// ===================================================== NOTIFICATIONS (#3) ==
async function checkNotifRedDot() {
  if (!currentUser) return;
  try {
    const data = await api('listNotifications', {});
    $('notifRedDot').classList.toggle('hidden', data.unreadCount === 0);
  } catch (err) { /* silent — a failed badge check shouldn't interrupt anything */ }
}

$('notifBellBtn').onclick = async () => {
  $('notifModal').classList.remove('hidden');
  $('notifList').classList.add('empty-hint');
  $('notifList').textContent = 'Loading…';
  try {
    const data = await api('listNotifications', {});
    if (!data.notifications.length) {
      $('notifList').textContent = 'No notifications yet.';
      return;
    }
    $('notifList').classList.remove('empty-hint');
    $('notifList').innerHTML = data.notifications.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-body">${escapeHtml(n.body)}</div>
        <div class="notif-date">${formatDate(n.createdAt)}</div>
      </div>`).join('');
    // Reading the list IS the "mark as read" action, per spec.
    if (data.unreadCount > 0) {
      api('markNotificationsRead', {}).then(() => $('notifRedDot').classList.add('hidden')).catch(() => {});
    } else {
      $('notifRedDot').classList.add('hidden');
    }
  } catch (err) {
    $('notifList').textContent = err.message;
  }
};
$('closeNotifBtn').onclick = () => $('notifModal').classList.add('hidden');
$('notifModal').querySelector('.modal-backdrop').onclick = () => $('notifModal').classList.add('hidden');

// ==================================================== EDIT PROFILE (#20) ==
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
    showToast('Could not use that image: ' + err.message);
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

// ============================================================ NAVIGATION ==

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => { singleBookId = null; goPage(btn.dataset.page); };
});
$('backBtn').onclick = () => goPage('profile');

// ================================================================= BOOT ===

(function boot() {
  const startHash = (location.hash || '').slice(1);
  if (currentUser) {
    renderPage(PAGES.includes(startHash) ? startHash : 'profile');
  } else {
    showAuthTab('loginForm');
    renderPage('auth');
  }
  // Small delay so the boot text doesn't just flash for logged-out users,
  // while still feeling instant on a normal connection.
  setTimeout(hideBootLoader, 250);
})();

// ============================================================ PWA INSTALL ==
// Android/Chrome fires this event when the app is installable — we capture
// it and trigger it ourselves from our own "Install" button instead of
// waiting for the browser's default mini-bar.
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
  $('installBannerText').textContent = 'Add Baitul Hikmah to your Home Screen: tap the Share icon, then "Add to Home Screen".';
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

// ==================================================== PUSH NOTIFICATIONS ==
// Uses Firebase Cloud Messaging (see firebase-config.js + README "Notifications
// Setup"). If firebase-config.js hasn't been filled in yet, this quietly
// does nothing — the rest of the app is unaffected either way.
function firebaseIsConfigured() {
  return typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') !== 0;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

async function maybeShowNotifBanner() {
  if (!firebaseIsConfigured()) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
  if (localStorage.getItem('bh_notif_dismissed')) return;
  $('notifBanner').classList.remove('hidden');
}

$('notifBannerBtn').onclick = () => guardedAction('enable-notifs', $('notifBannerBtn'), async () => {
  $('notifBanner').classList.add('hidden');
  await enablePushNotifications();
});
$('notifBannerDismiss').onclick = () => {
  localStorage.setItem('bh_notif_dismissed', '1');
  $('notifBanner').classList.add('hidden');
};

async function enablePushNotifications() {
  if (!firebaseIsConfigured()) { showToast('Notifications aren\u2019t set up yet.'); return; }
  const reg = await registerServiceWorker();
  if (!reg) { showToast('Notifications need a supported browser.'); return; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Notifications permission was not granted.'); return; }

  const app = firebase.initializeApp(FIREBASE_CONFIG, 'main');
  const messaging = firebase.messaging(app);
  const token = await messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) { showToast('Could not get a notification token.'); return; }

  // Data-only messages don't auto-display while the app tab is actually
  // open (that only happens in the background via sw.js) — so we show it
  // ourselves here, just as boldly, and refresh whatever's on screen.
  //
  // IMPORTANT: this uses reg.showNotification() (the service-worker route),
  // NOT `new Notification()`. iOS Safari does not support triggering
  // notifications via the page-level Notification constructor at all —
  // only through a service worker registration. Using showNotification()
  // here means foreground notifications work identically on Android and
  // iPhone, instead of silently failing on iPhone specifically.
  messaging.onMessage((payload) => {
    const title = (payload.data && payload.data.title) || 'Baitul Hikmah';
    const body = (payload.data && payload.data.body) || '';
    if (Notification.permission === 'granted' && reg && reg.showNotification) {
      reg.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
    } else {
      showToast(title + ': ' + body);
    }
    if (currentUser && (location.hash.slice(1) || 'profile') === 'profile') refreshProfile();
  });

  if (currentUser) {
    await api('savePushToken', { pushToken: token });
  }
  showToast('Notifications enabled!');
}

// Kick off service worker registration. If notifications were already
// granted in a previous visit, quietly refresh the token (FCM tokens can
// rotate) — otherwise, offer the banner if logged in.
registerServiceWorker().then(() => {
  if (!currentUser) return;
  if (firebaseIsConfigured() && 'Notification' in window && Notification.permission === 'granted') {
    enablePushNotifications();
  } else {
    maybeShowNotifBanner();
  }
});
