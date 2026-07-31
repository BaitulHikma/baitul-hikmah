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
var FIREBASE_PROJECT_ID = 'baitulhikmah-d7d0a';
var FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@baitulhikmah-d7d0a.iam.gserviceaccount.com';
var FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQDJ1nIN32OthLdU\nLhjH9cdMatsV6SSehkI2T3tm1VAIO5khbagD1K5hX+LuihTPgcuWzJCmbaQzfQTR\n43aVYKZWeqbKpssKLOW3zNaa6OkjbfhzKqC8gngmZc9+VuYNF1F652mai/YJm9CW\npy4yMNRpgVYIuy8L4cSXkp1PHnVfvmkVvzzyd24OhsVrOXxIHOC5Al7/VotxfeB+\nM27oV7JVc2t7T+UBBU6zA1vQZIq8zIWYbgC7RWdFohlK4aGo+OccmTdVsiO3fUl0\nNFNL4GY2rEFJ/mIQOUa8hyGUVkz+7/3P7gMIWz20TWxo/Zlj6wQnEQ1G8hJjMzKN\n1d+ek/lTAgMBAAECgf8+mymDNwntAZxzwnBfJClYSGSQLmvFHw9qrMsCgwIqNj9c\navL1DdP/yI7nW+1RecHSpe0u4dzwem6lfKZoNARH/jU5il0kpO52c3IK09UxOyQh\neH/LdIbZwQabfwOQ5gmPfjhf8KsxIGYX0CJeP722UYReOm8t/fYZWb+9m3wiNhS2\nfpzDqfpqsn+tRM9PTgVQ4Uh91g+DzrmOnUwbPNLBTimA6IBHwLCwOmZs+aLFQ7gb\nKqtE1cuwlzI3byQo090O6Cgg9ha4YbOI2AGXVdmWa7uK57vx73BwwqAuKxBjtKom\nEJ1XZbttRwamtDOlAkAwzxzDUs4zJ7ofZ/S2tQECgYEA8A9emZEWpPO8ycpP8iTy\njkg/yGjdH6NNEuBDUut8XwZnq3AOeek2E2GUCnsM6B3MJ5h7O3NeqNY06Z8rlthK\n2oBVEd3RpfC2gpKGX4uRu9Uxz/NHfxma5LTCruRzQDMdOTc7Ooxh+YyvBatc/lOg\ntdcHIlitLzlVf1zXxlA+mk0CgYEA1z1bpj9LDG0mE39GD2+xBH/EPSavwqx3bvLv\nBsxTjVy4jen0RN+WnEi+MlR9pVnzFjzailMNV3052jPynsCKocEvg1LW9Eu1Ldab\n2cCFATJG5zAe8xZ9gJR/VtGgO3nRwfYbi9TFU+KxPWsnpaRErFswdpREXkCt74yf\nhGHtch8CgYEA6qZbVchYVgxZcPVsh8hNv34nuoGmAxLgd572r8q22zurggwaWlf3\nH6K1zjjROOJHeDy32DjBQk9/kQyg0uXA5Suj+77S+lz8SU1oQ2RtoyiVdCrcrAQf\nP4bg9YsgjJRp8E9oeaZW7lLxkZ0bXQ3pfVUeCBid0Bc+1yutTo+JYdECgYBs3pdF\n7svKHEdfI0hPtIIIMYwUFkZepJfAodZvTNiSLy0Wcxjf4Wwv3sd9c6keAvJm9B7i\nSoH8F9Y0XYRB8kfs62dZ+IPLi6O37M5mBPABm+mrNHbjJCQU7oe+ZUez7blAb3id\ncODivk5CL7odGYq212UbBYHTXsnb2fgxoMrWpwKBgAtRa9JmwA4Ra1xjSVjDf+NP\nXdUyJ9KDGcyo+STWDNwpjDJEMfaLIXodgu4VMQF7zAYyIOIFT1g8emUiLq+jBgqL\nfut5GbsqhCMLaAvRZwAHAb3m8VJU86UUcshbFv2eX70MEBZs/rmqrve+un3Pl862\nx7uI/E29XSIysPjpN9uN\n-----END PRIVATE KEY-----\n";

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
      case 'editProfile':       result = handleEditProfile_(body); break;
      case 'sendSalam':         result = handleSendSalam_(body); break;
      case 'listNotifications': result = handleListNotifications_(body); break;
      case 'getLiveUpdates':    result = handleGetLiveUpdates_(body); break;
      case 'markNotificationsRead': result = handleMarkNotificationsRead_(body); break;
      case 'getInbox':          result = handleGetInbox_(body); break;
      case 'savePushToken':     result = handleSavePushToken_(body); break;
      case 'testNotification':  result = handleTestNotification_(body); break;
      case 'setModerator':      result = handleSetModerator_(body); break;
      case 'setHidden':         result = handleSetHidden_(body); break;
      case 'getStaffPanel':     result = handleGetStaffPanel_(body); break;
      case 'confirmWhatsappAccess': result = handleConfirmWhatsappAccess_(body); break;
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
  ensureColumn_(ss.getSheetByName('Users'), 'Bio');
  ensureColumn_(ss.getSheetByName('Users'), 'Role');       // '' | 'moderator'
  ensureColumn_(ss.getSheetByName('Users'), 'Hidden');     // '' | 'true' — admin/mod can hide an account
  ensureSheet_(ss, 'Books', ['BookID', 'OwnerID', 'BookName', 'Writer', 'Publisher',
    'ImageFileId', 'Status', 'CreatedAt', 'PageCount']);
  ensureColumn_(ss.getSheetByName('Books'), 'PageCount'); // migrates sheets created before this column existed
  ensureColumn_(ss.getSheetByName('Books'), 'Hidden');    // '' | 'true' — admin/mod can hide a book
  ensureSheet_(ss, 'Requests', ['RequestID', 'BookID', 'RequesterID', 'OwnerID', 'Status',
    'DurationDays', 'RequestDate', 'ApprovedDate', 'DueDate', 'ReturnRequestedDate']);
  ensureSheet_(ss, 'PushTokens', ['UserID', 'Token', 'CreatedAt']);
  ensureSheet_(ss, 'Salams', ['SenderID', 'TargetID', 'SentAt']);
  ensureSheet_(ss, 'LiveUpdates', ['Text', 'ImageFileId', 'CreatedAt']);
  ensureSheet_(ss, 'WhatsappAccessLog', ['UserID', 'UserName', 'OwnerID', 'OwnerName',
    'BookID', 'BookName', 'DurationDays', 'AccessedAt']);
  ensureSettingsSheet_(ss);
  ensureDailyHadithSheet_(ss);
  ensureSheet_(ss, 'Notifications', ['notifId', 'userId', 'title', 'body', 'read', 'timestamp']);
  return ss;
}

// A simple two-column Key | Value sheet — this IS the "place you can edit
// anytime" for the signup greeting text. Editing the Value cell for
// GreetingText takes effect immediately, no redeploy needed.
function ensureSettingsSheet_(ss) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['GreetingText',
      'Welcome to Baitul Hikmah! We are so glad to have you here. Borrow ' +
      'and share books with your community, take good care of what you ' +
      'borrow, and return it on time so others can enjoy it too. Jazak Allahu khairan!']);
    sheet.setFrozenRows(1);
  }
}

// 365 rows, one per day of the year. Pre-filled with a placeholder so
// nothing ever shows blank before real hadiths are pasted in — safe to
// overwrite any row's Text cell in the sheet at any time.
function ensureDailyHadithSheet_(ss) {
  var sheet = ss.getSheetByName('DailyHadith');
  if (!sheet) {
    sheet = ss.insertSheet('DailyHadith');
    sheet.appendRow(['DayOfYear', 'Text']);
    var rows = [];
    for (var d = 1; d <= 365; d++) {
      rows.push([d, 'Hadith for day ' + d + ' — to be added.']);
    }
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    sheet.setFrozenRows(1);
  }
}

function getSettingValue_(ss, key) {
  var rows = sheetToObjects_(ss.getSheetByName('Settings'));
  var row = rows.filter(function (r) { return r.Key === key; })[0];
  return row ? row.Value : '';
}

// Bangladesh date, so "today" lines up with the 6:30am BD hadith the spec
// wants, not the server's default timezone.
function computeTodayHadith_(ss) {
  var now = new Date();
  var bdDateStr = Utilities.formatDate(now, 'Asia/Dhaka', 'yyyy-MM-dd');
  var bdDate = new Date(bdDateStr + 'T00:00:00');
  var startOfYear = new Date(bdDate.getFullYear(), 0, 1);
  var dayOfYear = Math.floor((bdDate - startOfYear) / 86400000) + 1;
  var row = ((dayOfYear - 1) % 365) + 1; // wraps safely even on a 366-day leap year
  var rows = sheetToObjects_(ss.getSheetByName('DailyHadith'));
  var match = rows.filter(function (r) { return Number(r.DayOfYear) === row; })[0];
  return match ? match.Text : '';
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

// Adds a new column to an already-existing sheet if it isn't there yet —
// needed because ensureSheet_ above only sets headers on a BRAND NEW sheet;
// it won't retroactively add columns to a sheet that already has rows in it.
// Safe to call every request: it's a no-op once the column exists.
function ensureColumn_(sheet, columnName) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(columnName) === -1) {
    sheet.getRange(1, lastCol + 1).setValue(columnName);
  }
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

// Admin = the fixed owner account. Moderator = any account the admin has
// promoted (Role = 'moderator' on the Users sheet). "Staff" = either one —
// used for anything both are allowed to see/do, like the confidential
// WhatsApp access log. Moderators can do everything admin can EXCEPT
// promote/demote other moderators — that stays admin-only.
function isModerator_(userRow) {
  return userRow && String(userRow.Role || '').toLowerCase() === 'moderator';
}
function isStaff_(userRow) {
  return isAdmin_(userRow.Email) || isModerator_(userRow);
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

  logLiveUpdate_(ss, displayName + ' just joined Baitul Hikmah!');

  return { ok: true, user: publicUser_({
    ID: id, DisplayName: displayName, DPFileId: dpFileId, WhatsApp: whatsapp,
    Email: email, SessionToken: token
  }), greetingText: getSettingValue_(ss, 'GreetingText') };
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
    bio: u.Bio || '',
    token: u.SessionToken,
    isAdmin: isAdmin_(u.Email),
    isModerator: isModerator_(u),
    isStaff: isStaff_(u)
  };
}

// Level is DERIVED, never stored — this guarantees it can never drift out of
// sync with the actual data it's based on. Starts at -1 per spec.
// +1 per successful borrow-and-return (Requests row reaches 'returned').
// +1 per every 3 books the user has added to the library.
function computeUserLevel_(userId, ss) {
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var successfulReturns = requests.filter(function (r) {
    return String(r.RequesterID) === String(userId) && r.Status === 'returned';
  }).length;
  var booksOwned = books.filter(function (b) { return String(b.OwnerID) === String(userId); }).length;
  return -1 + successfulReturns + Math.floor(booksOwned / 3);
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
  var lentOutListEnriched = lentOut.map(function (r) { return enrichRequest_(r, books, ss); });

  // Books the CURRENT user lent out that the borrower has asked to return —
  // this is the "please confirm the book came back" queue.
  var returnRequests = requests
    .filter(function (r) { return String(r.OwnerID) === String(user.ID) && r.Status === 'return_pending'; })
    .map(function (r) { return enrichRequest_(r, books, ss); });

  var notificationCount = incomingRequests.length + returnRequests.length;

  var totalSuccessfulBorrows = requests.filter(function (r) {
    return r.Status === 'approved' || r.Status === 'return_pending' || r.Status === 'returned';
  }).length;
  var totalSuccessfulReturns = requests.filter(function (r) { return r.Status === 'returned'; }).length;

  // Everything the Profile page needs is bundled into this ONE response —
  // deliberately avoiding extra round trips to Apps Script, which is the
  // slowest part of this whole stack.
  return {
    ok: true,
    profile: {
      id: user.ID, displayName: user.DisplayName, dpFileId: user.DPFileId, bio: user.Bio || '',
      whatsapp: String(user.WhatsApp || ''), email: user.Email, isAdmin: isAdmin_(user.Email),
      isModerator: isModerator_(user), isStaff: isStaff_(user),
      myBooksCount: myBooks.length, borrowedCount: borrowed.length, lentOutCount: lentOut.length,
      level: computeUserLevel_(user.ID, ss)
    },
    totalBooksCount: books.length,
    totalMembersCount: users.length,
    totalSuccessfulBorrows: totalSuccessfulBorrows,
    totalSuccessfulReturns: totalSuccessfulReturns,
    todayHadith: computeTodayHadith_(ss),
    notificationCount: notificationCount,
    incomingRequests: incomingRequests,
    outgoingRequests: outgoingRequests,
    borrowedBooks: borrowedList,
    lentOutBooks: lentOutListEnriched,
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
    requestDate: r.RequestDate, approvedDate: r.ApprovedDate, dueDate: r.DueDate,
    returnRequestedDate: r.ReturnRequestedDate, daysLeft: daysLeft
  };
}

function handleListBooks_(body) {
  var me = requireAuth_(body);
  var ss = getSS_();
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var users = sheetToObjects_(ss.getSheetByName('Users'));

  if (!isStaff_(me)) {
    books = books.filter(function (b) { return b.Hidden !== 'true' || String(b.OwnerID) === String(me.ID); });
  }

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
    var borrower = activeReq ? userMap[activeReq.RequesterID] : null;
    return {
      bookId: b.BookID, bookName: b.BookName, writer: b.Writer, publisher: b.Publisher,
      pageCount: b.PageCount || null,
      imageFileId: b.ImageFileId, status: b.Status,
      ownerId: b.OwnerID, ownerName: owner.DisplayName, ownerWhatsapp: String(owner.WhatsApp || ''),
      dueDate: activeReq ? activeReq.DueDate : null,
      borrowerName: borrower ? borrower.DisplayName : null,
      myPendingRequestId: myReq ? myReq.RequestID : null,
      isMine: String(b.OwnerID) === String(body.userId),
      hidden: b.Hidden === 'true'
    };
  });

  return { ok: true, books: list };
}

function handleAddBooks_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var books = ss.getSheetByName('Books');
  var added = [];
  var levelBefore = computeUserLevel_(user.ID, ss);

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
    var pageCount = f.pageCount ? parseInt(f.pageCount, 10) : '';
    books.appendRow([bookId, user.ID, bookName, writer, publisher, fileId, 'available', new Date(), pageCount]);
    added.push({ bookId: bookId, bookName: bookName, writer: writer, publisher: publisher, imageFileId: fileId, pageCount: pageCount });
    logLiveUpdate_(ss, user.DisplayName + ' added "' + (bookName || 'a book') + '" to the Library!', fileId);
    logNotification_(ss, user.ID, 'Book added', 'You added "' + (bookName || 'a book') + '" to the library.');
  });

  var levelAfter = computeUserLevel_(user.ID, ss);
  var leveledUp = levelAfter > levelBefore;
  if (leveledUp) logNotification_(ss, user.ID, 'Level up! \ud83c\udf89', 'Congratulations — you just reached Level ' + levelAfter + '!');

  return { ok: true, added: added, leveledUp: leveledUp, newLevel: levelAfter };
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
    Publisher: String(body.publisher || '').trim(),
    PageCount: body.pageCount ? parseInt(body.pageCount, 10) : ''
  });
  logNotification_(ss, user.ID, 'Book updated', 'You updated the details for "' + String(body.bookName || book.BookName || 'a book') + '".');
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

  var affected = sheetToObjects_(ss.getSheetByName('Requests')).filter(function (r) {
    return String(r.BookID) === String(book.BookID) && (r.Status === 'pending' || r.Status === 'approved' || r.Status === 'return_pending');
  });
  affected.forEach(function (r) {
    logNotification_(ss, r.RequesterID, 'Book removed', '"' + book.BookName + '" was removed from the library by its owner.');
  });

  logNotification_(ss, user.ID, 'Book removed', 'You removed "' + book.BookName + '" from the library.');
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

  logNotification_(ss, book.OwnerID, 'New borrow request', user.DisplayName + ' would like to borrow "' + book.BookName + '".');
  logNotification_(ss, user.ID, 'Request sent', 'Your request for "' + book.BookName + '" was sent.');

  return { ok: true, requestId: reqId };
}

function handleCancelMyRequest_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var requests = ss.getSheetByName('Requests');
  var req = findRowById_(requests, 'RequestID', body.requestId);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (String(req.RequesterID) !== String(user.ID)) return { ok: false, error: 'Not your request.' };
  updateRowFields_(requests, req._row, { Status: 'cancelled' });

  var book = findRowById_(ss.getSheetByName('Books'), 'BookID', req.BookID);
  logNotification_(ss, req.OwnerID, 'Request withdrawn', user.DisplayName + ' withdrew their request for "' + (book ? book.BookName : 'a book') + '".');
  logNotification_(ss, user.ID, 'You withdrew a request', 'You withdrew your request for "' + (book ? book.BookName : 'a book') + '".');

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

  logNotification_(ss, req.RequesterID, 'Request approved', '"' + book.BookName + '" is ready — go pick it up!');
  logNotification_(ss, user.ID, 'You approved a request', 'You approved ' + (function () {
    var r = findRowById_(ss.getSheetByName('Users'), 'ID', req.RequesterID);
    return r ? r.DisplayName : 'a member';
  })() + '\u2019s request for "' + book.BookName + '".');

  var borrowerRow = findRowById_(ss.getSheetByName('Users'), 'ID', req.RequesterID);
  var borrowerName = borrowerRow ? borrowerRow.DisplayName : 'Someone';
  logLiveUpdate_(ss, borrowerName + ' borrowed "' + book.BookName + '" from ' + user.DisplayName, book.ImageFileId);

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

  var book = findRowById_(ss.getSheetByName('Books'), 'BookID', req.BookID);
  logNotification_(ss, req.RequesterID, 'Request declined', 'Your request for "' + (book ? book.BookName : 'a book') + '" was declined.');
  logNotification_(ss, user.ID, 'You declined a request', 'You declined the request for "' + (book ? book.BookName : 'a book') + '".');

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
  logNotification_(ss, req.OwnerID, 'Return requested', user.DisplayName + ' says they\u2019re returning "' + (book ? book.BookName : 'a book') + '".');
  logNotification_(ss, user.ID, 'Return request sent', 'The owner has been notified you\u2019re returning "' + (book ? book.BookName : 'a book') + '".');

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

  var levelBefore = computeUserLevel_(req.RequesterID, ss);

  updateRowFields_(requests, req._row, { Status: 'returned' });
  var book = findRowById_(books, 'BookID', req.BookID);
  if (book) updateRowFields_(books, book._row, { Status: 'available' });

  logNotification_(ss, req.RequesterID, 'Return confirmed', 'Thanks! The owner confirmed "' + (book ? book.BookName : 'the book') + '" was returned.');
  logNotification_(ss, user.ID, 'You confirmed a return', 'You confirmed "' + (book ? book.BookName : 'a book') + '" was returned.');

  var borrowerRow = findRowById_(ss.getSheetByName('Users'), 'ID', req.RequesterID);
  var borrowerName = borrowerRow ? borrowerRow.DisplayName : 'Someone';
  logLiveUpdate_(ss, borrowerName + ' returned "' + (book ? book.BookName : 'a book') + '" to ' + user.DisplayName, book ? book.ImageFileId : null);

  var levelAfter = computeUserLevel_(req.RequesterID, ss);
  var leveledUp = levelAfter > levelBefore;
  if (leveledUp) logNotification_(ss, req.RequesterID, 'Level up! \ud83c\udf89', 'Congratulations — you just reached Level ' + levelAfter + '!');

  return { ok: true, leveledUp: leveledUp, newLevel: levelAfter, forUserId: req.RequesterID };
}

function handleListMembers_(body) {
  var me = requireAuth_(body);
  var ss = getSS_();
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  var books = sheetToObjects_(ss.getSheetByName('Books'));
  var requests = sheetToObjects_(ss.getSheetByName('Requests'));
  var salams = sheetToObjects_(ss.getSheetByName('Salams'));
  var SALAM_COOLDOWN_MS = 30 * 60 * 1000;

  if (!isStaff_(me)) {
    users = users.filter(function (u) { return u.Hidden !== 'true' || String(u.ID) === String(me.ID); });
  }

  var list = users.map(function (u) {
    var owned = books.filter(function (b) { return String(b.OwnerID) === String(u.ID); }).length;
    var lent = requests.filter(function (r) {
      return String(r.OwnerID) === String(u.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
    }).length;
    var borrowed = requests.filter(function (r) {
      return String(r.RequesterID) === String(u.ID) && (r.Status === 'approved' || r.Status === 'return_pending');
    }).length;
    var totalRequestsSent = requests.filter(function (r) { return String(r.RequesterID) === String(u.ID); }).length;
    var successfulReturns = requests.filter(function (r) {
      return String(r.RequesterID) === String(u.ID) && r.Status === 'returned';
    }).length;

    var mySalam = salams.filter(function (s) {
      return String(s.SenderID) === String(me.ID) && String(s.TargetID) === String(u.ID);
    }).sort(function (a, b) { return new Date(b.SentAt) - new Date(a.SentAt); })[0];
    var salamCooldownUntil = null;
    if (mySalam) {
      var until = new Date(mySalam.SentAt).getTime() + SALAM_COOLDOWN_MS;
      if (until > Date.now()) salamCooldownUntil = new Date(until).toISOString();
    }

    return {
      id: u.ID, displayName: u.DisplayName, dpFileId: u.DPFileId, bio: u.Bio || '',
      ownedBooks: owned, lentOut: lent, borrowed: borrowed,
      totalRequestsSent: totalRequestsSent, successfulReturns: successfulReturns,
      level: computeUserLevel_(u.ID, ss),
      salamCooldownUntil: salamCooldownUntil
    };
  });

  var topOwner = list.slice().sort(function (a, b) { return b.ownedBooks - a.ownedBooks; })[0];
  var topBorrower = list.slice().sort(function (a, b) { return b.successfulReturns - a.successfulReturns; })[0];
  var topRequester = list.slice().sort(function (a, b) { return b.totalRequestsSent - a.totalRequestsSent; })[0];

  return {
    ok: true, members: list,
    leaderboard: {
      topOwner: (topOwner && topOwner.ownedBooks > 0) ? { name: topOwner.displayName, count: topOwner.ownedBooks } : null,
      topBorrower: (topBorrower && topBorrower.successfulReturns > 0) ? { name: topBorrower.displayName, count: topBorrower.successfulReturns } : null,
      topRequester: (topRequester && topRequester.totalRequestsSent > 0) ? { name: topRequester.displayName, count: topRequester.totalRequestsSent } : null
    }
  };
}

function handleEditProfile_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var row = findRowById_(users, 'ID', user.ID);
  if (!row) return { ok: false, error: 'Account not found.' };

  var displayName = String(body.displayName || '').trim();
  if (!displayName) return { ok: false, error: 'Name cannot be empty.' };
  var bio = String(body.bio || '').trim().slice(0, 300);

  var fields = { DisplayName: displayName, Bio: bio };

  if (body.dpBase64) {
    var newFileId = saveBase64Image_(body.dpBase64, DP_IMAGES_FOLDER, 'dp_' + user.ID + '_' + new Date().getTime());
    if (row.DPFileId) {
      try { DriveApp.getFileById(row.DPFileId).setTrashed(true); } catch (e) { /* old file already gone — fine */ }
    }
    fields.DPFileId = newFileId;
  }

  updateRowFields_(users, row._row, fields);

  return {
    ok: true,
    user: publicUser_({
      ID: user.ID, DisplayName: fields.DisplayName, DPFileId: fields.DPFileId || row.DPFileId,
      WhatsApp: row.WhatsApp, Email: row.Email, Bio: fields.Bio, SessionToken: row.SessionToken
    })
  };
}

function handleSendSalam_(body) {
  var me = requireAuth_(body);
  var ss = getSS_();
  var salamsSheet = ss.getSheetByName('Salams');
  var salams = sheetToObjects_(salamsSheet);
  var targetId = String(body.targetId || '');
  if (!targetId) return { ok: false, error: 'No member specified.' };
  if (targetId === String(me.ID)) return { ok: false, error: "You can't send Salam to yourself!" };

  var SALAM_COOLDOWN_MS = 30 * 60 * 1000;
  var last = salams.filter(function (s) {
    return String(s.SenderID) === String(me.ID) && String(s.TargetID) === targetId;
  }).sort(function (a, b) { return new Date(b.SentAt) - new Date(a.SentAt); })[0];
  if (last && (Date.now() - new Date(last.SentAt).getTime()) < SALAM_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait before sending Salam to this member again.' };
  }

  salamsSheet.appendRow([me.ID, targetId, new Date()]);
  logNotification_(ss, targetId, 'Salam! \ud83d\udc4b', me.DisplayName + ' sent you Salam!');
  var targetRow = findRowById_(ss.getSheetByName('Users'), 'ID', targetId);
  logNotification_(ss, me.ID, 'Salam sent', 'You sent Salam to ' + (targetRow ? targetRow.DisplayName : 'a member') + '.');

  return { ok: true, cooldownUntil: new Date(Date.now() + SALAM_COOLDOWN_MS).toISOString() };
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

// #15 — public activity feed. Deliberately reads/logs its own small entries
// rather than depending on the (skipped, per your request) 3-month backup
// sheet — simpler and lower-risk, same visible result.
function logLiveUpdate_(ss, text, imageFileId) {
  try {
    ss.getSheetByName('LiveUpdates').appendRow([text, imageFileId || '', new Date()]);
  } catch (e) {
    Logger.log('logLiveUpdate_: failed: ' + e);
  }
}

function handleGetLiveUpdates_(body) {
  requireAuth_(body);
  var ss = getSS_();
  var all = sheetToObjects_(ss.getSheetByName('LiveUpdates'))
    .sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); })
    .slice(0, 4);
  return {
    ok: true,
    updates: all.map(function (u) { return { text: u.Text, imageFileId: u.ImageFileId || null, createdAt: u.CreatedAt }; })
  };
}

// #3 / #25 / #27 — every notification-worthy event goes through THIS, not
// sendPushToUser_ directly, so it's both pushed to the device AND recorded
// in the in-app notification bulletin (the little red-dot bell icon). The
// two are deliberately coupled — the bulletin is the "reasons" history the
// spec asks for, and it should never fall out of sync with what was pushed.
function logNotification_(ss, userId, title, body) {
  try {
    var sheet = ss.getSheetByName('Notifications');
    sheet.appendRow(['N' + new Date().getTime() + Math.floor(Math.random() * 1000), userId, title, body, false, new Date()]);
  } catch (e) {
    Logger.log('logNotification_: failed to write log row: ' + e);
  }
  sendPushToUser_(userId, title, body);
}

function handleListNotifications_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var all = sheetToObjects_(ss.getSheetByName('Notifications'))
    .filter(function (n) { return String(n.userId) === String(user.ID); })
    .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })
    .slice(0, 100); // most recent 100 is plenty for a bulletin list
  var unreadCount = all.filter(function (n) { return n.read !== true && n.read !== 'TRUE' && n.read !== 'true'; }).length;
  return {
    ok: true,
    unreadCount: unreadCount,
    notifications: all.map(function (n) {
      return { id: n.notifId, title: n.title, body: n.body, createdAt: n.timestamp, read: !!(n.read === true || n.read === 'TRUE' || n.read === 'true') };
    })
  };
}

function handleMarkNotificationsRead_(body) {
  var user = requireAuth_(body);
  var ss = getSS_();
  var sheet = ss.getSheetByName('Notifications');
  var rows = sheetToObjects_(sheet);
  rows.forEach(function (n) {
    if (String(n.userId) === String(user.ID) && !(n.read === true || n.read === 'TRUE' || n.read === 'true')) {
      updateRowFields_(sheet, n._row, { read: true });
    }
  });
  return { ok: true };
}

// #22 — call this from a Google Apps Script time-driven trigger set to run
// daily at 6:30am (Asia/Dhaka). See setup guide for how to attach the
// trigger — it's a one-time, 30-second manual step in the Apps Script UI,
// not something that can be done from a deployment alone.
function sendDailyHadithNotifications_() {
  var ss = getSS_();
  var hadith = computeTodayHadith_(ss);
  if (!hadith) return;
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  users.forEach(function (u) {
    logNotification_(ss, u.ID, "Today's Hadith", hadith);
  });
}

// Trigger dropdowns in Apps Script sometimes cache a stale function list —
// this small wrapper exists purely so there's a function name your browser
// has never seen before, guaranteeing it shows up fresh. Point your 6:30am
// trigger at THIS function, not the one above.
function dailyHadithTrigger() {
  sendDailyHadithNotifications_();
}

// Sends a push notification to every device a user has enabled notifications
// on. Silently does nothing if Firebase isn't configured, or the user has
// none — a notification failure should never break the actual borrow/return
// action it's attached to.
function sendPushToUser_(userId, title, body) {
  if (!pushNotificationsConfigured_()) { Logger.log('sendPushToUser_: Firebase not configured, skipping.'); return; }
  try {
    var ss = getSS_();
    var tokensSheet = ss.getSheetByName('PushTokens');
    var tokens = sheetToObjects_(tokensSheet)
      .filter(function (t) { return String(t.UserID) === String(userId); });
    if (!tokens.length) { Logger.log('sendPushToUser_: no PushTokens row for userId=' + userId + '. The device never saved a token.'); return; }

    var accessToken = getFCMAccessToken_();
    tokens.forEach(function (t) {
      // Sent as data-only (no top-level "notification" key) so there is
      // exactly ONE place that decides how it looks — sw.js's
      // onBackgroundMessage — instead of the browser and our own code both
      // trying to show it (which can cause duplicates). "Urgency: high"
      // asks the browser to wake the device immediately rather than batch
      // it for later, which is what makes this feel instant/"bold".
      var payload = {
        message: {
          token: t.Token,
          data: { title: title, body: body },
          webpush: { headers: { Urgency: 'high' } }
        }
      };
      var res = UrlFetchApp.fetch(
        'https://fcm.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/messages:send',
        {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + accessToken },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        }
      );
      var code = res.getResponseCode();
      if (code !== 200) {
        Logger.log('sendPushToUser_: FCM send FAILED (HTTP ' + code + ') for userId=' + userId + ': ' + res.getContentText());
        // UNREGISTERED / NOT_FOUND means the token is dead (uninstalled, permission
        // revoked, etc.) — delete it so we stop trying and the sheet stays clean.
        if (code === 404 || (res.getContentText() || '').indexOf('UNREGISTERED') !== -1) {
          tokensSheet.deleteRow(t._row);
        }
      } else {
        Logger.log('sendPushToUser_: sent OK to userId=' + userId);
      }
    });
  } catch (err) {
    Logger.log('sendPushToUser_: EXCEPTION: ' + err + (err.stack ? ('\n' + err.stack) : ''));
  }
}

// ---------------------------------------------------------------------------
// DEBUG HELPER — call this from the browser console (see notes below) to
// send yourself a real push notification right now and get the exact error
// back in the response instead of it being swallowed. Remove once
// everything's confirmed working, or just leave it — it's harmless.
// ---------------------------------------------------------------------------
function handleTestNotification_(body) {
  var user = requireAuth_(body);
  if (!pushNotificationsConfigured_()) {
    return { ok: false, error: 'FIREBASE_PROJECT_ID is not set in Code.gs.' };
  }
  var ss = getSS_();
  var tokens = sheetToObjects_(ss.getSheetByName('PushTokens'))
    .filter(function (t) { return String(t.UserID) === String(user.ID); });
  if (!tokens.length) {
    return { ok: false, error: 'No PushTokens row exists for your account yet. This means the FRONTEND never successfully got a token and called savePushToken — the problem is on the browser/permission side, not the backend. Check the browser console for errors when you tap "Enable notifications".' };
  }
  try {
    var accessToken = getFCMAccessToken_();
  } catch (err) {
    return { ok: false, error: 'Could not get an FCM access token from your service account key: ' + err + '. Double-check FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in Code.gs exactly match your service account JSON, including all the \\n characters in the private key.' };
  }
  var results = [];
  tokens.forEach(function (t) {
    var payload = {
      message: {
        token: t.Token,
        data: { title: 'Test notification', body: 'If you see this, push is fully working \ud83c\udf89' },
        webpush: { headers: { Urgency: 'high' } }
      }
    };
    var res = UrlFetchApp.fetch(
      'https://fcm.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/messages:send',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
    results.push({ token: t.Token.slice(0, 12) + '...', httpCode: res.getResponseCode(), response: res.getContentText() });
  });
  return { ok: true, results: results };
}

// ============================================================================
// ADMIN / MODERATOR SYSTEM
// Admin = the fixed ADMIN_EMAIL account. Moderators = accounts the admin
// promotes. Both can hide/unhide accounts and books, and both can see the
// confidential WhatsApp access log. Only admin can promote/demote moderators.
// ============================================================================

function handleSetModerator_(body) {
  var me = requireAuth_(body);
  if (!isAdmin_(me.Email)) return { ok: false, error: 'Only the admin account can manage moderators.' };
  var ss = getSS_();
  var users = ss.getSheetByName('Users');
  var target = findRowById_(users, 'ID', body.targetUserId);
  if (!target) return { ok: false, error: 'Member not found.' };
  updateRowFields_(users, target._row, { Role: body.makeModerator ? 'moderator' : '' });
  logNotification_(ss, target.ID, body.makeModerator ? 'You are now a moderator' : 'Moderator role removed',
    body.makeModerator ? 'The admin made you a moderator.' : 'Your moderator role was removed.');
  return { ok: true };
}

function handleSetHidden_(body) {
  var me = requireAuth_(body);
  if (!isStaff_(me)) return { ok: false, error: 'Only admin or moderators can do this.' };
  var ss = getSS_();
  var sheetName = body.targetType === 'book' ? 'Books' : 'Users';
  var idCol = body.targetType === 'book' ? 'BookID' : 'ID';
  var sheet = ss.getSheetByName(sheetName);
  var row = findRowById_(sheet, idCol, body.targetId);
  if (!row) return { ok: false, error: 'Not found.' };
  updateRowFields_(sheet, row._row, { Hidden: body.hidden ? 'true' : '' });

  // Tell every other staff member (admin + moderators) via the bell icon —
  // so hide/unhide actions are always visible to the whole staff team.
  var label = body.targetType === 'book'
    ? ('the book "' + (row.BookName || 'Untitled') + '"')
    : ('the account "' + (row.DisplayName || '') + '"');
  var verb = body.hidden ? 'hid' : 'unhid';
  notifyAllStaff_(ss, me.ID, (body.hidden ? 'Hidden' : 'Unhidden') + ': ' + label,
    me.DisplayName + ' ' + verb + ' ' + label + '.');

  return { ok: true };
}

// Sends a bell-icon notification to admin + every moderator, excluding
// whoever just performed the action (they already know they did it).
function notifyAllStaff_(ss, actingUserId, title, body) {
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  users.forEach(function (u) {
    if (String(u.ID) === String(actingUserId)) return;
    if (isAdmin_(u.Email) || isModerator_(u)) {
      logNotification_(ss, u.ID, title, body);
    }
  });
}

// Admin/moderator dashboard: who's a moderator, and the confidential
// WhatsApp access log (see #24 — every time someone taps the WhatsApp
// button, it's recorded here for safety/accountability).
function handleGetStaffPanel_(body) {
  var me = requireAuth_(body);
  if (!isStaff_(me)) return { ok: false, error: 'Only admin or moderators can view this.' };
  var ss = getSS_();
  var users = sheetToObjects_(ss.getSheetByName('Users'));
  var log = sheetToObjects_(ss.getSheetByName('WhatsappAccessLog'))
    .sort(function (a, b) { return new Date(b.AccessedAt) - new Date(a.AccessedAt); })
    .slice(0, 200); // most recent 200 — plenty for review, keeps the response light

  return {
    ok: true,
    isAdmin: isAdmin_(me.Email),
    members: users.map(function (u) {
      return { id: u.ID, displayName: u.DisplayName, email: u.Email, role: u.Role || '', hidden: u.Hidden === 'true' };
    }),
    whatsappAccessLog: log
  };
}

// #24 — before unlocking the WhatsApp button, the user must re-type their
// own password. On success, this logs exactly who accessed whose contact
// info, for which book, and when — visible only to admin/moderators.
function handleConfirmWhatsappAccess_(body) {
  var user = requireAuth_(body);
  var hash = hashPassword_(body.password || '', user.PassSalt);
  if (hash !== user.PassHash) return { ok: false, error: 'Incorrect password.' };

  var ss = getSS_();
  var book = findRowById_(ss.getSheetByName('Books'), 'BookID', body.bookId);
  if (!book) return { ok: false, error: 'Book not found.' };
  var owner = findRowById_(ss.getSheetByName('Users'), 'ID', book.OwnerID);
  if (!owner) return { ok: false, error: 'Owner not found.' };

  var myReq = sheetToObjects_(ss.getSheetByName('Requests')).filter(function (r) {
    return String(r.BookID) === String(book.BookID) && String(r.RequesterID) === String(user.ID)
      && (r.Status === 'pending' || r.Status === 'approved');
  })[0];

  ss.getSheetByName('WhatsappAccessLog').appendRow([
    user.ID, user.DisplayName, owner.ID, owner.DisplayName,
    book.BookID, book.BookName, myReq ? myReq.DurationDays : '', new Date()
  ]);

  // Admin and every moderator get told immediately — both a bell entry and
  // a bold push notification, per #24/#25.
  var allUsers = sheetToObjects_(ss.getSheetByName('Users'));
  var staffMsg = user.DisplayName + ' accessed ' + owner.DisplayName + '\u2019s WhatsApp for "' + book.BookName + '".';
  allUsers.filter(function (u) { return isStaff_(u); }).forEach(function (staffUser) {
    logNotification_(ss, staffUser.ID, 'WhatsApp access', staffMsg);
    sendPushToUser_(staffUser.ID, 'WhatsApp access', staffMsg);
  });

  return { ok: true, whatsapp: String(owner.WhatsApp || '') };
}







function debugAuthorize() {
  try {
    var token = getFCMAccessToken_();
    Logger.log('SUCCESS — got an access token, length: ' + token.length);
  } catch (e) {
    Logger.log('FAILED: ' + e);
  }
}



