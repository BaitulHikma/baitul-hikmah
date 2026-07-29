/**
 * ============================================================================
 *  BAITUL HIKMAH — Book Borrowing System Backend
 * ============================================================================
 * This is a Google Apps Script (GAS) "Web App". Deploy it as a Web App
 * (Execute as: Me, Who has access: Anyone) and you get a URL that your
 * GitHub Pages frontend calls with fetch().
 *
 * WHY EVERYTHING IS ONE doPost():
 * Google Apps Script web apps do NOT support custom CORS preflight (OPTIONS)
 * requests properly. The reliable, well-known workaround is:
 *   1. The frontend ALWAYS sends POST requests.
 *   2. The frontend sends the body as plain text (Content-Type: text/plain)
 *      instead of application/json — this avoids the browser sending a
 *      CORS "preflight" OPTIONS request (which GAS can't answer).
 *   3. This script manually parses that text as JSON.
 *   4. Every action (login, signup, list books, etc.) is a single
 *      "action" field inside the JSON body — so we only need ONE endpoint.
 *
 * SHEETS THIS SCRIPT EXPECTS (create a Google Sheet named "BaitulHikmahDB"
 * with these exact tab names — the script will also auto-create the header
 * rows the first time it runs if they are missing):
 *
 *   Users      : ID | DisplayName | DPFileId | WhatsApp | Email | PassHash
 *                | PassSalt | Reference | SessionToken | ResetCode
 *                | ResetExpiry | CreatedAt
 *
 *   Books      : BookID | OwnerID | BookName | Writer | Publisher
 *                | ImageFileId | Status | CreatedAt
 *                (Status = "available" or "borrowed")
 *
 *   Requests   : RequestID | BookID | RequesterID | OwnerID | Status
 *                | DurationDays | RequestDate | ApprovedDate | DueDate
 *                | ReturnRequestedDate
 *                (Status = "pending" | "approved" | "cancelled" |
 *                 "return_pending" | "returned")
 *
 * DRIVE FOLDERS (auto-created on first run, inside your Drive root):
 *   "BaitulHikmah_BookImages"
 *   "BaitulHikmah_ProfilePictures"
 *
 * ADMIN ACCOUNT:
 *   Email tamim.studio.personal@gmail.com is treated as Admin automatically
 *   (see isAdmin_ below). Display name defaults to "Admin" on signup if this
 *   email is used.
 * ============================================================================
 */

// ---- CONFIG ---------------------------------------------------------------
var SHEET_NAME = 'BaitulHikmahDB';          // The Google Sheet file name
var ADMIN_EMAIL = 'tamim.studio.personal@gmail.com';
var MEMBER_ID_START = 3130001;              // First member ID
var BOOK_ID_PREFIX = 'BOOK';
var BOOK_ID_DIGITS = 7;                     // BOOK0000001
var BOOK_IMAGES_FOLDER = 'BaitulHikmah_BookImages';
var DP_IMAGES_FOLDER = 'BaitulHikmah_ProfilePictures';
var RESET_CODE_MINUTES = 15;                // Forgot-password code validity

// --- Push notifications (Firebase Cloud Messaging) — all three are free.
// Get these from your Firebase project's service account JSON key.
// See README.md "Notifications Setup" for exactly where to find each one.
// Leave FIREBASE_PROJECT_ID as-is to leave notifications switched off.
var FIREBASE_PROJECT_ID = 'PASTE_YOUR_FIREBASE_PROJECT_ID';
var FIREBASE_CLIENT_EMAIL = 'PASTE_YOUR_SERVICE_ACCOUNT_EMAIL';
var FIREBASE_PRIVATE_KEY = 'PASTE_YOUR_SERVICE_ACCOUNT_PRIVATE_KEY';

// ---- ENTRY POINT ------------------------------------------------------------
function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    switch (action) {
      case 'signup':            result = handleSignup_(body); break;
      case 'login':              result = handleLogin_(body); break;
      case 'forgotPasswordRequest': result = handleForgotPasswordRequest_(body); break;
      case 'forgotPasswordReset':   result = handleForgotPasswordReset_(body); break;
      case 'getProfile':        result = handleGetProfile_(body); break;
      case 'listBooks':         result = handleListBooks_(body); break;
      case 'addBooks':          result = handleAddBooks_(body); break;
      case 'editBook':          result = handleEditBook_(body); break;
      case 'deleteBook':        result = handleDeleteBook_(body); break;
      case 'requestBorrow':     result = handleRequestBorrow_(body); break;
      case 'cancelMyRequest':   result = handleCancelMyRequest_(body); break;
      case 'approveRequest':    result = handleApproveRequest_(body); break;
      case 'rejectRequest':     result = handleRejectRequest_(body); break;
      case 'requestReturn':     result = handleRequestReturn_(body); break;
      case 'confirmReturn':     result = handleConfirmReturn_(body); break;
      case 'listMembers':       result = handleListMembers_(body); break;
      case 'getInbox':          result = handleGetInbox_(body); break;
      case 'savePushToken':     result = handleSavePushToken_(body); break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: 'Server error: ' + err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Simple health check if you open the deployed URL directly in a browser.
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: 'Baitul Hikmah API is running.' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// SHEET HELPERS
// ============================================================================

function getSS_() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
  }
  ensureSheet_(ss, 'Users', ['ID', 'DisplayName', 'DPFileId', 'WhatsApp', 'Email',
    'PassHash', 'PassSalt', 'Reference', 'SessionToken', 'ResetCode', 'ResetExpiry', 'CreatedAt']);
  ensureSheet_(ss, 'Books', ['BookID', 'OwnerID', 'BookName', 'Writer', 'Publisher',
    'ImageFileId', 'Status', 'CreatedAt']);
  ensureSheet_(ss, 'Requests', ['RequestID', 'BookID', 'RequesterID', 'OwnerID', 'Status',
    'DurationDays', 'RequestDate', 'ApprovedDate', 'DueDate', 'ReturnRequestedDate']);
  ensureSheet_(ss, 'PushTokens', ['UserID', 'Token', 'CreatedAt']);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  // IMPORTANT: Google Sheets auto-detects all-digit text (like a WhatsApp
  // number "01712345678") and silently converts it to a Number, which
  // strips leading zeros and breaks the value. Forcing this column to
  // plain-text format ("@") stops that from ever happening again.
  if (name === 'Users') {
    var waCol = headers.indexOf('WhatsApp') + 1;
    if (waCol > 0) sheet.getRange(2, waCol, 2000, 1).setNumberFormat('@');
  }
  // Remove the default "Sheet1" if it's empty and unused
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) {
    ss.deleteSheet(def);
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (row.join('') === '') continue; // skip blank rows
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj._row = r + 1; // 1-based sheet row number, useful for updates
    out.push(obj);
  }
  return out;
}

function findRowById_(sheet, idColName, idValue) {
  var objs = sheetToObjects_(sheet);
  for (var i = 0; i < objs.length; i++) {
    if (String(objs[i][idColName]) === String(idValue)) return objs[i];
  }
  return null;
}

function updateRowFields_(sheet, rowNumber, fields) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var key in fields) {
    var col = headers.indexOf(key);
    if (col > -1) sheet.getRange(rowNumber, col + 1).setValue(fields[key]);
  }
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

function hashPassword_(password, salt) {
  var digest = Utilities.computeHmacSha256Signature(password, salt);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function makeSalt_() {
  return Utilities.getUuid();
}

function makeToken_() {
  return Utilities.getUuid() + '-' + new Date().getTime();
}

function isAdmin_(email) {
  return String(email).toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Verifies a userId + sessionToken pair sent by the frontend on every
// authenticated request. Throws if invalid.
function requireAuth_(body) {
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var user = findRowById_(users, 'ID', body.userId);
  if (!user || !body.token || String(user.SessionToken) !== String(body.token)) {
    throw new Error('Not authenticated. Please log in again.');
  }
  return user;
}

function nextMemberId_(users) {
  var objs = sheetToObjects_(users);
  var max = MEMBER_ID_START - 1;
  objs.forEach(function (u) {
    var n = parseInt(u.ID, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function nextBookId_(books) {
  var objs = sheetToObjects_(books);
  var max = 0;
  objs.forEach(function (b) {
    var n = parseInt(String(b.BookID).replace(BOOK_ID_PREFIX, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  var next = max + 1;
  var padded = ('0000000' + next).slice(-BOOK_ID_DIGITS);
  return BOOK_ID_PREFIX + padded;
}

// ============================================================================
// DRIVE HELPERS
// ============================================================================

function getOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

// Accepts a base64 data URL (e.g. "data:image/jpeg;base64,...."), saves it
// to Drive, makes it viewable by link, and returns the file ID.
function saveBase64Image_(base64DataUrl, folderName, filename) {
  var match = base64DataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
  if (!match) throw new Error('Invalid image data.');
  var mimeType = match[1];
  var data = match[2];
  var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);
  var folder = getOrCreateFolder_(folderName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function handleSignup_(body) {
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var existing = sheetToObjects_(users);

  var email = String(body.email || '').trim().toLowerCase();
  var whatsapp = String(body.whatsapp || '').trim().replace(/[\s-]/g, '');
  // Always store WhatsApp numbers with a leading "+" — this keeps Sheets
  // from treating the number as a numeric value (see ensureSheet_ note),
  // and it's exactly the format the WhatsApp click-to-chat link needs.
  if (whatsapp && whatsapp.charAt(0) !== '+') whatsapp = '+' + whatsapp;
  if (!body.displayName || !email || !whatsapp || !body.password) {
    return { ok: false, error: 'Please fill in all required fields.' };
  }
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].Email).toLowerCase() === email) {
      return { ok: false, error: 'An account with this email already exists.' };
    }
    if (String(existing[i].WhatsApp) === whatsapp) {
      return { ok: false, error: 'An account with this WhatsApp number already exists.' };
    }
  }

  var id = nextMemberId_(users);
  var salt = makeSalt_();
  var hash = hashPassword_(body.password, salt);
  var token = makeToken_();

  var dpFileId = '';
  if (body.dpBase64) {
    dpFileId = saveBase64Image_(body.dpBase64, DP_IMAGES_FOLDER, 'dp_' + id);
  }

  var displayName = isAdmin_(email) ? 'Admin' : body.displayName;

  users.appendRow([id, displayName, dpFileId, whatsapp, email, hash, salt,
    body.reference || '', token, '', '', new Date()]);

  return { ok: true, user: publicUser_({
    ID: id, DisplayName: displayName, DPFileId: dpFileId, WhatsApp: whatsapp,
    Email: email, SessionToken: token
  }) };
}

function handleLogin_(body) {
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var objs = sheetToObjects_(users);
  var loginId = String(body.identifier || '').trim().toLowerCase();

  var found = null;
  for (var i = 0; i < objs.length; i++) {
    var u = objs[i];
    if (String(u.Email).toLowerCase() === loginId || String(u.WhatsApp) === body.identifier) {
      found = u; break;
    }
  }
  if (!found) return { ok: false, error: 'No account found with that email or WhatsApp number.' };

  var hash = hashPassword_(body.password, found.PassSalt);
  if (hash !== found.PassHash) return { ok: false, error: 'Incorrect password.' };

  var token = makeToken_();
  updateRowFields_(users, found._row, { SessionToken: token });
  found.SessionToken = token;

  return { ok: true, user: publicUser_(found) };
}

function publicUser_(u) {
  return {
    id: u.ID,
    displayName: u.DisplayName,
    dpFileId: u.DPFileId,
    whatsapp: String(u.WhatsApp || ''),
    email: u.Email,
    token: u.SessionToken,
    isAdmin: isAdmin_(u.Email)
  };
}

function handleForgotPasswordRequest_(body) {
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var email = String(body.email || '').trim().toLowerCase();
  var user = null;
  var objs = sheetToObjects_(users);
  for (var i = 0; i < objs.length; i++) {
    if (String(objs[i].Email).toLowerCase() === email) { user = objs[i]; break; }
  }
  if (!user) return { ok: false, error: 'No account found with that email.' };

  var code = String(Math.floor(100000 + Math.random() * 900000));
  var expiry = new Date(new Date().getTime() + RESET_CODE_MINUTES * 60000);
  updateRowFields_(users, user._row, { ResetCode: code, ResetExpiry: expiry });

  MailApp.sendEmail({
    to: user.Email,
    subject: 'Baitul Hikmah — Password Reset Code',
    body: 'Assalamu alaikum ' + user.DisplayName + ',\n\n' +
      'Your password reset code is: ' + code + '\n' +
      'This code expires in ' + RESET_CODE_MINUTES + ' minutes.\n\n' +
      'If you did not request this, you can safely ignore this email.'
  });

  return { ok: true };
}

function handleForgotPasswordReset_(body) {
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var email = String(body.email || '').trim().toLowerCase();
  var objs = sheetToObjects_(users);
  var user = null;
  for (var i = 0; i < objs.length; i++) {
    if (String(objs[i].Email).toLowerCase() === email) { user = objs[i]; break; }
  }
  if (!user) return { ok: false, error: 'No account found with that email.' };
  if (String(user.ResetCode) !== String(body.code)) return { ok: false, error: 'Incorrect reset code.' };
  if (new Date() > new Date(user.ResetExpiry)) return { ok: false, error: 'Reset code has expired. Please request a new one.' };

  var salt = makeSalt_();
  var hash = hashPassword_(body.newPassword, salt);
  updateRowFields_(users, user._row, { PassHash: hash, PassSalt: salt, ResetCode: '', ResetExpiry: '' });

  return { ok: true };
}

function handleGetProfile_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var users = sheetToObjects_(ss.getSheetByName('Users'));

  var myBooks = books.filter(function (b) { return String(b.OwnerID) === String(user.ID); });
  var borrowed = requests.filter(function (r) {
    return String(r.RequesterID) === String(user.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
  });
  var lentOut = requests.filter(function (r) {
    return String(r.OwnerID) === String(user.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
  });

  var incomingRequests = requests
    .filter(function (r) { return String(r.OwnerID) === String(user.ID) && r.Status === 'pending'; })
    .map(function (r) { return enrichRequest_(r, books, ss); });

  var outgoingRequests = requests
    .filter(function (r) { return String(r.RequesterID) === String(user.ID) && r.Status === 'pending'; })
    .map(function (r) { return enrichRequest_(r, books, ss); });

  var borrowedList = borrowed.map(function (r) { return enrichRequest_(r, books, ss); });

  // Books the CURRENT user lent out that the borrower has asked to return —
  // this is the "please confirm the book came back" queue.
  var returnRequests = requests
    .filter(function (r) { return String(r.OwnerID) === String(user.ID) && r.Status === 'return_pending'; })
    .map(function (r) { return enrichRequest_(r, books, ss); });

  var notificationCount = incomingRequests.length + returnRequests.length;

  // Everything the Profile page needs is bundled into this ONE response —
  // deliberately avoiding extra round trips to Apps Script, which is the
  // slowest part of this whole stack.
  return {
    ok: true,
    profile: {
      id: user.ID, displayName: user.DisplayName, dpFileId: user.DPFileId,
      whatsapp: String(user.WhatsApp || ''), email: user.Email, isAdmin: isAdmin_(user.Email),
      myBooksCount: myBooks.length, borrowedCount: borrowed.length, lentOutCount: lentOut.length
    },
    totalBooksCount: books.length,
    totalMembersCount: users.length,
    notificationCount: notificationCount,
    incomingRequests: incomingRequests,
    outgoingRequests: outgoingRequests,
    borrowedBooks: borrowedList,
    returnRequests: returnRequests
  };
}

function enrichRequest_(r, books, ss) {
  var book = books.filter(function (b) { return String(b.BookID) === String(r.BookID); })[0] || {};
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  var owner = users.filter(function (u) { return String(u.ID) === String(r.OwnerID); })[0] || {};
  var requester = users.filter(function (u) { return String(u.ID) === String(r.RequesterID); })[0] || {};
  var dueDate = r.DueDate ? new Date(r.DueDate) : null;
  var daysLeft = dueDate ? Math.ceil((dueDate - new Date()) / 86400000) : null;
  return {
    requestId: r.RequestID,
    bookId: r.BookID,
    bookName: book.BookName, writer: book.Writer, publisher: book.Publisher,
    imageFileId: book.ImageFileId,
    ownerId: r.OwnerID, ownerName: owner.DisplayName, ownerDp: owner.DPFileId, ownerWhatsapp: owner.WhatsApp,
    requesterId: r.RequesterID, requesterName: requester.DisplayName, requesterDp: requester.DPFileId,
    status: r.Status, durationDays: r.DurationDays,
    requestDate: r.RequestDate, dueDate: r.DueDate, daysLeft: daysLeft
  };
}

function handleListBooks_(body) {
  requireAuth_(body);
  var ss = getSS_();
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var users = sheetToObjects_(ss.getSheetByName('Users'));

  var userMap = {};
  users.forEach(function (u) { userMap[u.ID] = u; });

  var list = books.map(function (b) {
    var activeReq = requests.filter(function (r) {
      return String(r.BookID) === String(b.BookID) && (r.Status === 'approved' || r.Status === 'return_pending');
    })[0];
    var myReq = requests.filter(function (r) {
      return String(r.BookID) === String(b.BookID) && String(r.RequesterID) === String(body.userId) && r.Status === 'pending';
    })[0];
    var owner = userMap[b.OwnerID] || {};
    return {
      bookId: b.BookID, bookName: b.BookName, writer: b.Writer, publisher: b.Publisher,
      imageFileId: b.ImageFileId, status: b.Status,
      ownerId: b.OwnerID, ownerName: owner.DisplayName, ownerWhatsapp: String(owner.WhatsApp || ''),
      dueDate: activeReq ? activeReq.DueDate : null,
      myPendingRequestId: myReq ? myReq.RequestID : null,
      isMine: String(b.OwnerID) === String(body.userId)
    };
  });

  return { ok: true, books: list };
}

function handleAddBooks_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = ss.getSheetByName('Books');
  var added = [];

  // body.files = [{ base64: "data:image/...", bookName, writer, publisher }, ...]
  // The owner is always the logged-in user — no filename parsing needed.
  // Book name / writer / publisher are optional; the owner can fill them
  // in now or edit them later from the book's detail popup.
  (body.files || []).forEach(function (f) {
    var bookId = nextBookId_(books);
    var fileId = saveBase64Image_(f.base64, BOOK_IMAGES_FOLDER, bookId);
    var bookName = String(f.bookName || '').trim();
    var writer = String(f.writer || '').trim();
    var publisher = String(f.publisher || '').trim();
    books.appendRow([bookId, user.ID, bookName, writer, publisher, fileId, 'available', new Date()]);
    added.push({ bookId: bookId, bookName: bookName, writer: writer, publisher: publisher, imageFileId: fileId });
  });

  return { ok: true, added: added };
}

function handleEditBook_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = ss.getSheetByName('Books');
  var book = findRowById_(books, 'BookID', body.bookId);
  if (!book) return { ok: false, error: 'Book not found.' };
  if (String(book.OwnerID) !== String(user.ID) && !isAdmin_(user.Email)) {
    return { ok: false, error: 'You can only edit your own books.' };
  }
  updateRowFields_(books, book._row, {
    BookName: String(body.bookName || '').trim(),
    Writer: String(body.writer || '').trim(),
    Publisher: String(body.publisher || '').trim()
  });
  return { ok: true };
}

function handleDeleteBook_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = ss.getSheetByName('Books');
  var book = findRowById_(books, 'BookID', body.bookId);
  if (!book) return { ok: false, error: 'Book not found.' };
  if (String(book.OwnerID) !== String(user.ID) && !isAdmin_(user.Email)) {
    return { ok: false, error: 'You can only delete your own books.' };
  }
  books.deleteRow(book._row);
  return { ok: true };
}

function handleRequestBorrow_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = ss.getSheetByName('Books');
  var requests = ss.getSheetByName('Requests');

  var book = findRowById_(books, 'BookID', body.bookId);
  if (!book) return { ok: false, error: 'Book not found.' };
  if (book.Status !== 'available') return { ok: false, error: 'This book is currently unavailable.' };
  if (String(book.OwnerID) === String(user.ID)) return { ok: false, error: 'You cannot borrow your own book.' };

  var existing = sheetToObjects_(requests).filter(function (r) {
    return String(r.BookID) === String(body.bookId) && String(r.RequesterID) === String(user.ID) && r.Status === 'pending';
  });
  if (existing.length) return { ok: false, error: 'You already requested this book.' };

  var reqId = 'REQ' + new Date().getTime();
  requests.appendRow([reqId, body.bookId, user.ID, book.OwnerID, 'pending',
    body.durationDays || 7, new Date(), '', '', '']);

  sendPushToUser_(book.OwnerID, 'New borrow request', user.DisplayName + ' would like to borrow "' + book.BookName + '".');

  return { ok: true };
}

function handleCancelMyRequest_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.RequesterID) !== String(user.ID)) return { ok: false, error: 'Not your request.' };
  updateRowFields_(requests, req._row, { Status: 'cancelled' });
  return { ok: true };
}

function handleApproveRequest_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var books = ss.getSheetByName('Books');

  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.OwnerID) !== String(user.ID)) return { ok: false, error: 'Not your book.' };

  var book = findRowById_(books, 'BookID', req.BookID);
  if (!book || book.Status !== 'available') return { ok: false, error: 'Book is no longer available.' };

  var dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + parseInt(req.DurationDays, 10));

  updateRowFields_(requests, req._row, { Status: 'approved', ApprovedDate: new Date(), DueDate: dueDate });
  updateRowFields_(books, book._row, { Status: 'borrowed' });

  // Auto-cancel any other pending requests for the same book
  sheetToObjects_(requests).forEach(function (r) {
    if (String(r.BookID) === String(req.BookID) && r.Status === 'pending') {
      updateRowFields_(requests, r._row, { Status: 'cancelled' });
    }
  });

  sendPushToUser_(req.RequesterID, 'Request approved', '"' + book.BookName + '" is ready — go pick it up!');

  return { ok: true };
}

function handleRejectRequest_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.OwnerID) !== String(user.ID)) return { ok: false, error: 'Not your book.' };
  updateRowFields_(requests, req._row, { Status: 'cancelled' });
  return { ok: true };
}

function handleRequestReturn_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.RequesterID) !== String(user.ID)) return { ok: false, error: 'Not your borrowed book.' };
  updateRowFields_(requests, req._row, { Status: 'return_pending', ReturnRequestedDate: new Date() });

  var book = findRowById_(ss.getSheetByName('Books'), 'BookID', req.BookID);
  sendPushToUser_(req.OwnerID, 'Return requested', user.DisplayName + ' says they\u2019re returning "' + (book ? book.BookName : 'a book') + '".');

  return { ok: true };
}

function handleConfirmReturn_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var books = ss.getSheetByName('Books');
  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.OwnerID) !== String(user.ID)) return { ok: false, error: 'Not your book.' };

  updateRowFields_(requests, req._row, { Status: 'returned' });
  var book = findRowById_(books, 'BookID', req.BookID);
  if (book) updateRowFields_(books, book._row, { Status: 'available' });

  sendPushToUser_(req.RequesterID, 'Return confirmed', 'Thanks! The owner confirmed "' + (book ? book.BookName : 'the book') + '" was returned.');

  return { ok: true };
}

function handleListMembers_(body) {
  requireAuth_(body);
  var ss = getSS_();
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));

  var list = users.map(function (u) {
    var owned = books.filter(function (b) { return String(b.OwnerID) === String(u.ID); }).length;
    var lent = requests.filter(function (r) {
      return String(r.OwnerID) === String(u.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
    }).length;
    var borrowed = requests.filter(function (r) {
      return String(r.RequesterID) === String(u.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
    }).length;
    return {
      id: u.ID, displayName: u.DisplayName, dpFileId: u.DPFileId,
      ownedBooks: owned, lentOut: lent, borrowed: borrowed
    };
  });

  return { ok: true, members: list };
}

function handleGetInbox_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var incomingPending = requests.filter(function (r) {
    return String(r.OwnerID) === String(user.ID) && r.Status === 'pending';
  }).length;
  var returnPendingForMe = requests.filter(function (r) {
    return String(r.OwnerID) === String(user.ID) && r.Status === 'return_pending';
  }).length;
  return { ok: true, notificationCount: incomingPending + returnPendingForMe };
}

function handleSavePushToken_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var tokens = ss.getSheetByName('PushTokens');
  var existing = sheetToObjects_(tokens).filter(function (t) { return String(t.Token) === String(body.pushToken); })[0];
  if (existing) {
    updateRowFields_(tokens, existing._row, { UserID: user.ID, CreatedAt: new Date() });
  } else {
    tokens.appendRow([user.ID, body.pushToken, new Date()]);
  }
  return { ok: true };
}

// ============================================================================
// PUSH NOTIFICATIONS (Firebase Cloud Messaging, HTTP v1 API)
// Apps Script has no Firebase Admin SDK, so this signs its own short-lived
// OAuth token from your service account's private key — a standard,
// documented technique, no extra libraries needed. If FIREBASE_PROJECT_ID
// hasn't been filled in, every call below quietly no-ops.
// ============================================================================

function pushNotificationsConfigured_() {
  return FIREBASE_PROJECT_ID && FIREBASE_PROJECT_ID.indexOf('PASTE_YOUR') !== 0;
}

function base64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

// Exchanges your Firebase service account key for a short-lived Google
// OAuth access token (valid ~1 hour), following Google's standard
// "JWT bearer token" server-to-server auth flow.
function getFCMAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fcm_access_token');
  if (cached) return cached;

  var header = { alg: 'RS256', typ: 'JWT' };
  var now = Math.floor(new Date().getTime() / 1000);
  var claim = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  var encodedHeader = base64UrlEncode_(Utilities.newBlob(JSON.stringify(header)).getBytes());
  var encodedClaim = base64UrlEncode_(Utilities.newBlob(JSON.stringify(claim)).getBytes());
  var toSign = encodedHeader + '.' + encodedClaim;

  var privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, privateKey);
  var jwt = toSign + '.' + base64UrlEncode_(signatureBytes);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Could not get FCM access token: ' + res.getContentText());

  cache.put('fcm_access_token', data.access_token, 3000); // cache ~50 min
  return data.access_token;
}

// Sends a push notification to every device a user has enabled notifications
// on. Silently does nothing if Firebase isn't configured, or the user has
// none — a notification failure should never break the actual borrow/return
// action it's attached to.
function sendPushToUser_(userId, title, body) {
  if (!pushNotificationsConfigured_()) return;
  try {
    var ss = getSS_();
    var tokens = sheetToObjects_(ss.getSheetByName('PushTokens'))
      .filter(function (t) { return String(t.UserID) === String(userId); });
    if (!tokens.length) return;

    var accessToken = getFCMAccessToken_();
    tokens.forEach(function (t) {
      var payload = {
        message: {
          token: t.Token,
          notification: { title: title, body: body },
          webpush: { fcm_options: { link: '/' } }
        }
      };
      UrlFetchApp.fetch(
        'https://fcm.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/messages:send',
        {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + accessToken },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        }
      );
    });
  } catch (err) {
    // Never let a notification problem break the underlying action.
  }
}
