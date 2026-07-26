// ============================================================================
// BAITUL HIKMAH — Frontend Application Logic
// Plain vanilla JS. No frameworks, no build step — open index.html and go.
// ============================================================================

// ---------------------------------------------------------------- STATE ----
let currentUser = JSON.parse(localStorage.getItem('bh_user') || 'null');
let allBooks = [];
let allMembers = [];
let profileData = null;
let currentExploreFilter = 'all';
let activeModalBook = null;

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
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

// ---------------------------------------------------------------- ROUTER ---
const PAGES = ['auth', 'profile', 'explore', 'members', 'addbooks'];

function showPage(name) {
  PAGES.forEach(p => $('page-' + p).classList.toggle('hidden', p !== name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));

  const loggedIn = !!currentUser;
  $('topbar').classList.toggle('hidden', !loggedIn);
  $('bottomNav').classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    $('topRightAvatar').src = driveImg(currentUser.dpFileId);
    $('topRightBtn').onclick = () => { showPage('profile'); refreshProfile(); };
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

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const data = await api('login', {
      identifier: $('loginIdentifier').value.trim(),
      password: $('loginPassword').value
    });
    saveSession(data.user);
    showPage('profile');
  } catch (err) {
    $('loginError').textContent = err.message;
  }
};

$('signupForm').onsubmit = async (e) => {
  e.preventDefault();
  $('signupError').textContent = '';
  try {
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
    });
    saveSession(data.user);
    showToast('Welcome! Account created.');
    showPage('profile');
  } catch (err) {
    $('signupError').textContent = err.message;
  }
};

$('sendResetCodeBtn').onclick = async () => {
  $('forgotError').textContent = '';
  $('forgotSuccess').textContent = '';
  const email = $('forgotEmail').value.trim();
  if (!email) { $('forgotError').textContent = 'Enter your email first.'; return; }
  try {
    await api('forgotPasswordRequest', { email });
    $('forgotSuccess').textContent = 'Code sent! Check your email.';
    $('resetStep2').classList.remove('hidden');
  } catch (err) {
    $('forgotError').textContent = err.message;
  }
};

$('confirmResetBtn').onclick = async () => {
  $('forgotError').textContent = '';
  try {
    await api('forgotPasswordReset', {
      email: $('forgotEmail').value.trim(),
      code: $('resetCode').value.trim(),
      newPassword: $('resetNewPassword').value
    });
    showToast('Password reset. Please sign in.');
    showAuthTab('loginForm');
  } catch (err) {
    $('forgotError').textContent = err.message;
  }
};

$('signOutBtn').onclick = () => {
  clearSession();
  showAuthTab('loginForm');
  showPage('auth');
};

// ============================================================= PROFILE ====

async function refreshProfile() {
  if (!currentUser) return;
  try {
    const data = await api('getProfile', {});
    profileData = data;
    $('profileIdNum').textContent = data.profile.id;
    $('profileGreeting').textContent = "Assalamu a'laikum ya shabab! " + data.profile.displayName;
    $('myBooksCount').textContent = data.profile.myBooksCount;
    $('borrowedCount').textContent = data.profile.borrowedCount;
    $('lentOutCount').textContent = data.profile.lentOutCount;

    renderRequestFeed('incomingRequestsList', data.incomingRequests, 'incoming');
    renderRequestFeed('outgoingRequestsList', data.outgoingRequests, 'outgoing');
    renderRequestFeed('borrowedList', data.borrowedBooks, 'borrowed');

    // Explore / members counts on the cubes (fetched lazily, cheap)
    const booksRes = await api('listBooks', {});
    $('cubeBookCount').textContent = booksRes.books.length;
    const membersRes = await api('listMembers', {});
    $('cubeMemberCount').textContent = membersRes.members.length;

    const inbox = await api('getInbox', {});
    // (kept for future notification-icon badge; count available at inbox.notificationCount)
  } catch (err) {
    showToast(err.message);
  }
}

function renderRequestFeed(containerId, items, kind) {
  const el = $(containerId);
  if (!items || !items.length) {
    el.innerHTML = '';
    el.classList.add('empty-hint');
    el.textContent = kind === 'incoming' ? 'No incoming requests.'
      : kind === 'outgoing' ? 'No outgoing requests.'
      : 'No borrowed books.';
    return;
  }
  el.classList.remove('empty-hint');
  el.innerHTML = items.map(r => {
    let actions = '';
    if (kind === 'incoming') {
      actions = `<div class="req-card-actions">
        <button class="req-approve" onclick="approveRequest('${r.requestId}')">Approve</button>
        <button class="req-cancel" onclick="rejectRequest('${r.requestId}')">Cancel</button>
      </div>`;
    } else if (kind === 'outgoing') {
      actions = `<div class="req-card-actions">
        <button class="req-cancel" onclick="cancelMyRequest('${r.requestId}')">Cancel req</button>
      </div>`;
    } else if (kind === 'borrowed') {
      const label = r.status === 'return_pending' ? 'Return requested' : 'Give back now';
      actions = `<div class="req-card-actions">
        <button class="req-cancel" ${r.status === 'return_pending' ? 'disabled' : ''} onclick="requestReturn('${r.requestId}')">${label}</button>
      </div>`;
    }
    const personLine = kind === 'incoming'
      ? `From ${r.requesterName || 'Unknown'} · ${r.durationDays} days`
      : kind === 'outgoing'
      ? `Owner: ${r.ownerName || 'Unknown'} · ${r.durationDays} days`
      : `Owner: ${r.ownerName || 'Unknown'} · ${r.daysLeft != null ? r.daysLeft + ' days left' : ''}`;
    return `<div class="req-card">
      <img src="${driveImg(r.imageFileId)}" alt="">
      <div class="req-card-body">
        <div class="name">${escapeHtml(r.bookName || 'Unknown book')}</div>
        <div class="meta">${escapeHtml(personLine)}</div>
      </div>
      ${actions}
    </div>`;
  }).join('');
}

window.approveRequest = async (id) => {
  try { await api('approveRequest', { requestId: id }); showToast('Request approved.'); refreshProfile(); }
  catch (err) { showToast(err.message); }
};
window.rejectRequest = async (id) => {
  try { await api('rejectRequest', { requestId: id }); showToast('Request cancelled.'); refreshProfile(); }
  catch (err) { showToast(err.message); }
};
window.cancelMyRequest = async (id) => {
  try { await api('cancelMyRequest', { requestId: id }); showToast('Request withdrawn.'); refreshProfile(); }
  catch (err) { showToast(err.message); }
};
window.requestReturn = async (id) => {
  try { await api('requestReturn', { requestId: id }); showToast('Return requested — waiting for owner to confirm.'); refreshProfile(); }
  catch (err) { showToast(err.message); }
};

$('exploreCube').onclick = () => { currentExploreFilter = 'all'; showPage('explore'); };
$('membersCube').onclick = () => showPage('members');
$('addBookCta').onclick = () => showPage('addbooks');

document.querySelectorAll('#detailSquares .square-btn').forEach(btn => {
  btn.onclick = () => {
    currentExploreFilter = btn.dataset.filter === 'mine' ? 'mine'
      : btn.dataset.filter === 'borrowed' ? 'borrowed' : 'lent';
    showPage('explore');
  };
});

// ============================================================= EXPLORE ====

async function refreshBooks() {
  try {
    const data = await api('listBooks', {});
    allBooks = data.books;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === currentExploreFilter));
    renderBookGrid();
  } catch (err) {
    showToast(err.message);
  }
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.onclick = () => {
    currentExploreFilter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderBookGrid();
  };
});

$('bookSearch').oninput = () => renderBookGrid();
$('filterBtn').onclick = () => $('filterChips').scrollIntoView({ behavior: 'smooth' });

function renderBookGrid() {
  const q = $('bookSearch').value.trim().toLowerCase();
  let list = allBooks.slice();

  if (currentExploreFilter === 'mine') list = list.filter(b => b.isMine);
  else if (currentExploreFilter === 'lent') list = list.filter(b => b.isMine && b.status === 'borrowed');
  else if (currentExploreFilter === 'requesting') list = list.filter(b => !!b.myPendingRequestId);
  else if (currentExploreFilter === 'requested') list = list.filter(b => !!b.myPendingRequestId);
  else if (currentExploreFilter === 'borrowed') {
    const borrowedIds = (profileData && profileData.borrowedBooks || []).map(r => r.bookId);
    list = list.filter(b => borrowedIds.includes(b.bookId));
  }

  if (q) list = list.filter(b => (b.bookName || '').toLowerCase().includes(q));

  const grid = $('bookGrid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-hint">No books match here yet.</p>';
    return;
  }
  grid.innerHTML = list.map(b => {
    const statusText = b.status === 'available' ? 'Available'
      : 'Unavailable till ' + formatDate(b.dueDate);
    const statusClass = b.status === 'available' ? 'available' : 'unavailable';
    return `<div class="book-card" onclick="openBookModal('${b.bookId}')">
      <img src="${driveImg(b.imageFileId)}" alt="">
      <div class="book-card-body">
        <div class="name">${escapeHtml(b.bookName)}</div>
        <div class="sub">${escapeHtml(b.publisher || '')}</div>
        <div class="sub">Owner: ${escapeHtml(b.ownerName || '')}</div>
        <div class="book-status ${statusClass}">${statusText}</div>
      </div>
    </div>`;
  }).join('');
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------ BOOK MODAL --
window.openBookModal = (bookId) => {
  const b = allBooks.find(x => x.bookId === bookId);
  if (!b) return;
  activeModalBook = b;

  $('modalImage').src = driveImg(b.imageFileId);
  $('modalBookName').textContent = b.bookName;
  $('modalWriter').textContent = 'Writer: ' + b.writer;
  $('modalPublisher').textContent = 'Publisher: ' + b.publisher;
  $('modalOwner').textContent = 'Owner: ' + (b.ownerName || '');

  const statusEl = $('modalStatus');
  const borrowArea = $('modalBorrowArea');
  const cancelBtn = $('modalCancelReqBtn');
  const deleteBtn = $('modalDeleteBtn');
  const waBtn = $('modalWhatsappBtn');

  borrowArea.classList.add('hidden');
  cancelBtn.classList.add('hidden');
  deleteBtn.classList.add('hidden');
  waBtn.classList.add('disabled');
  waBtn.removeAttribute('href');

  if (b.isMine) {
    statusEl.textContent = b.status === 'available' ? 'This is your book — available.' : 'Currently lent out — due ' + formatDate(b.dueDate);
    statusEl.className = 'modal-status ' + (b.status === 'available' ? '' : '');
    deleteBtn.classList.remove('hidden');
  } else if (b.status !== 'available') {
    statusEl.textContent = 'Unavailable till ' + formatDate(b.dueDate);
  } else if (b.myPendingRequestId) {
    statusEl.textContent = 'You already requested this book.';
    cancelBtn.classList.remove('hidden');
    // A pending request unlocks the WhatsApp button per the spec.
    if (b.ownerWhatsapp) {
      waBtn.classList.remove('disabled');
      waBtn.href = 'https://wa.me/' + b.ownerWhatsapp.replace(/[^0-9]/g, '');
    }
  } else {
    statusEl.textContent = 'Available to borrow.';
    borrowArea.classList.remove('hidden');
  }

  $('bookModal').classList.remove('hidden');
};

$('closeModalBtn').onclick = () => $('bookModal').classList.add('hidden');
$('bookModal').querySelector('.modal-backdrop').onclick = () => $('bookModal').classList.add('hidden');

$('modalRequestBtn').onclick = async () => {
  if (!activeModalBook) return;
  try {
    await api('requestBorrow', {
      bookId: activeModalBook.bookId,
      durationDays: parseInt($('modalDuration').value, 10) || 7
    });
    showToast('Borrow request sent!');
    $('bookModal').classList.add('hidden');
    refreshBooks();
  } catch (err) { showToast(err.message); }
};

$('modalCancelReqBtn').onclick = async () => {
  if (!activeModalBook || !activeModalBook.myPendingRequestId) return;
  try {
    await api('cancelMyRequest', { requestId: activeModalBook.myPendingRequestId });
    showToast('Request cancelled.');
    $('bookModal').classList.add('hidden');
    refreshBooks();
  } catch (err) { showToast(err.message); }
};

$('modalDeleteBtn').onclick = async () => {
  if (!activeModalBook) return;
  if (!confirm('Delete "' + activeModalBook.bookName + '" from the library?')) return;
  try {
    await api('deleteBook', { bookId: activeModalBook.bookId });
    showToast('Book deleted.');
    $('bookModal').classList.add('hidden');
    refreshBooks();
  } catch (err) { showToast(err.message); }
};

// ============================================================= MEMBERS ====

async function refreshMembers() {
  try {
    const data = await api('listMembers', {});
    allMembers = data.members;
    $('membersList').innerHTML = allMembers.map(m => `
      <div class="member-card">
        <img src="${driveImg(m.dpFileId)}" alt="">
        <div>
          <div class="name">${escapeHtml(m.displayName)}</div>
          <div class="stats">Owns ${m.ownedBooks} · Lent ${m.lentOut} · Borrowed ${m.borrowed}</div>
        </div>
      </div>`).join('');
  } catch (err) {
    showToast(err.message);
  }
}

// ============================================================ ADD BOOKS ===

let pendingBookFiles = []; // [{ file, base64, parsed:{bookName,writer,publisher,ownerId}, valid }]

$('bookFilesInput').onchange = async () => {
  const files = Array.from($('bookFilesInput').files);
  pendingBookFiles = [];
  for (const f of files) {
    const base64 = await fileToBase64(f);
    const nameNoExt = f.name.replace(/\.[^.]+$/, '');
    const parts = nameNoExt.split('_');
    const valid = parts.length >= 4;
    pendingBookFiles.push({
      file: f, base64,
      filename: f.name,
      parsed: valid ? { ownerId: parts[0].trim(), bookName: parts[1].trim(), writer: parts[2].trim(), publisher: parts.slice(3).join('_').trim() } : null,
      valid
    });
  }
  renderAddPreview();
};

function renderAddPreview() {
  const el = $('addBooksPreview');
  $('addBooksError').textContent = '';
  $('addBooksSuccess').textContent = '';
  if (!pendingBookFiles.length) { el.innerHTML = ''; $('uploadBooksBtn').disabled = true; return; }

  el.innerHTML = pendingBookFiles.map(pf => {
    if (!pf.valid) {
      return `<div class="add-preview-item bad">
        <img src="${pf.base64}" alt="">
        <div class="meta"><div class="warn">Filename format not recognized:</div>${escapeHtml(pf.filename)}</div>
      </div>`;
    }
    return `<div class="add-preview-item">
      <img src="${pf.base64}" alt="">
      <div class="meta">
        <div class="bookname">${escapeHtml(pf.parsed.bookName)}</div>
        <div>${escapeHtml(pf.parsed.writer)} · ${escapeHtml(pf.parsed.publisher)}</div>
        <div>Owner ID: ${escapeHtml(pf.parsed.ownerId)}</div>
      </div>
    </div>`;
  }).join('');

  const anyValid = pendingBookFiles.some(pf => pf.valid);
  $('uploadBooksBtn').disabled = !anyValid;
}

$('uploadBooksBtn').onclick = async () => {
  const valid = pendingBookFiles.filter(pf => pf.valid);
  if (!valid.length) return;
  $('addBooksError').textContent = '';
  $('addBooksSuccess').textContent = '';
  try {
    const data = await api('addBooks', {
      files: valid.map(pf => ({ filename: pf.filename, base64: pf.base64 }))
    });
    $('addBooksSuccess').textContent = data.added.length + ' book(s) added to the library.';
    pendingBookFiles = [];
    $('bookFilesInput').value = '';
    $('addBooksPreview').innerHTML = '';
    $('uploadBooksBtn').disabled = true;
    showToast('Books uploaded!');
  } catch (err) {
    $('addBooksError').textContent = err.message;
  }
};

// ============================================================ NAVIGATION ==

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => showPage(btn.dataset.page);
});

$('backBtn').onclick = () => showPage('profile');

// ================================================================= BOOT ===

if (currentUser) {
  showPage('profile');
} else {
  showAuthTab('loginForm');
  showPage('auth');
}
