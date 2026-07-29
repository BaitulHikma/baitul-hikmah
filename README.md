# Baitul Hikmah — Book Borrowing Website (100% free stack)

Frontend: plain HTML/CSS/JS · Backend: Google Apps Script · Database: Google
Sheets · Images: Google Drive · Hosting: GitHub Pages.

## Files

- `index.html`, `style.css`, `app.js`, `config.js` — the website.
- `manifest.json`, `sw.js`, `icons/` — makes the site installable as an app
  (PWA) on Android and iPhone, with an offline app shell.
- `firebase-config.js` — paste your free Firebase keys here to turn on push
  notifications (optional — the app works fully without it).
- `Code.gs` — paste this into a Google Apps Script project; it is your entire backend.

## 1. Set up the backend (Google Apps Script)

1. Go to https://script.google.com and log in with **tamim.studio.personal@gmail.com**.
2. Click **New project**. Name it `BaitulHikmah`.
3. Delete the default `Code.gs` content and paste in the full contents of this
   project's `Code.gs`.
4. Click **Deploy → New deployment**.
   - Type: **Web app**.
   - Execute as: **Me (tamim.studio.personal@gmail.com)**.
   - Who has access: **Anyone**.
5. Click **Deploy**, authorize the permissions it asks for (Sheets, Drive,
   Gmail — needed to store data, store images, and send reset-code emails).
6. Copy the URL it gives you — it ends in `/exec`.

The very first time any action runs, `Code.gs` automatically creates a
Google Sheet named **BaitulHikmahDB** in your Drive (with `Users`, `Books`
and `Requests` tabs) and two Drive folders, **BaitulHikmah_BookImages** and
**BaitulHikmah_ProfilePictures** — nothing to set up by hand.

## 2. Connect the frontend to the backend

Open `config.js` and paste your Web App URL:

```js
const API_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

## 3. Test locally

Just open `index.html` in a browser, or use VS Code's "Live Server"
extension for auto-reload. No build step, no npm install — it's plain
HTML/CSS/JS.

## 4. Publish for free on GitHub Pages

1. Create a new GitHub repo (e.g. `baitul-hikmah`).
2. Push **all** the files and folders in this project to the repo root —
   including the `icons/` folder, `manifest.json`, `sw.js`, and
   `firebase-config.js` (not just the html/css/js you had before).
3. In the repo, go to **Settings → Pages**, set Source to the `main` branch
   / root, and save.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

## 5. Make it installable as an app (PWA) — free, already built in

Nothing extra to set up — once the files above are on GitHub Pages:

- **Android (Chrome)**: after visiting the site, a small "Install" banner
  appears automatically. Tap it, and a real app icon shows up on the home
  screen / app drawer, opening full-screen like a native app.
- **iPhone (Safari)**: the site shows a banner explaining to tap the
  **Share icon → "Add to Home Screen"** — Apple doesn't allow websites to
  trigger this automatically, so it's one manual tap.

This already gives you a genuine installable app on both platforms, 100%
free, with no app store involved.

## 6. Turn on real push notifications (free, optional, ~15 minutes)

This uses **Firebase Cloud Messaging** — a free Google service. You need a
free Firebase account (just your Google login, no credit card).

**A. Create the Firebase project**
1. Go to https://console.firebase.google.com → **Add project** → name it
   `BaitulHikmah` → you can turn off Google Analytics (not needed) → **Create**.

**B. Register a Web App inside it**
1. On the project's home page, click the **`</>`** (Web) icon.
2. Give it a nickname (e.g. "Baitul Hikmah Web") → **Register app**.
3. You'll see a code block with `apiKey`, `authDomain`, `projectId`,
   `messagingSenderId`, `appId`. Copy each of those five values.
4. Open **`firebase-config.js`** in this project and paste them into the
   matching fields of `FIREBASE_CONFIG`.

**C. Get the "Web Push" key (VAPID key)**
1. In the Firebase console, click the **gear icon → Project settings**.
2. Go to the **Cloud Messaging** tab.
3. Under **"Web configuration"**, click **"Generate key pair"** if you don't
   have one yet, then copy the long key shown.
4. Paste it into `firebase-config.js` as `FIREBASE_VAPID_KEY`.

**D. Get a Service Account key (lets your backend SEND notifications)**
1. Still in **Project settings**, go to the **Service accounts** tab.
2. Click **"Generate new private key"** → confirm → a `.json` file downloads.
3. Open that file in a text editor. You need three values from it:
   `project_id`, `client_email`, and `private_key`.
4. Open **`Code.gs`** and near the top, paste them in:
   ```js
   var FIREBASE_PROJECT_ID = 'paste project_id here';
   var FIREBASE_CLIENT_EMAIL = 'paste client_email here';
   var FIREBASE_PRIVATE_KEY = 'paste private_key here'; // keep the \n characters exactly as in the file
   ```
   ⚠️ Keep this file private — anyone with the private key could send
   notifications as your app. It's safe inside Apps Script (only you can see
   your own script's code), just don't share `Code.gs` publicly with these
   filled in.

**E. Re-deploy**
1. In Apps Script: **Deploy → Manage deployments → edit (pencil) → New
   version → Deploy**.
2. Push the updated `firebase-config.js` (and the rest of the files) to
   GitHub as in Part 4.

**F. Test it**
Open the site, log in — you'll see an "Enable notifications" banner. Tap
**Enable**, allow the browser permission prompt, then have a friend send a
borrow request for one of your books. You should get a real push
notification, even with the site closed.

If you skip this whole section, everything else in the app still works
normally — notifications simply won't fire.

## 7. Get a real downloadable Android .apk (free, optional)

Once your site is live on GitHub Pages with the PWA files from Part 5:

1. Go to https://www.pwabuilder.com (free, made by Microsoft).
2. Paste in your GitHub Pages URL and click **Start**.
3. It scans your site, confirms it's a valid installable PWA, then click
   the **Android** package option → **Generate**.
4. Download the `.apk` it builds — you can share that file directly with
   anyone to install (sideload) for free, or optionally upload it to the
   Google Play Store later for a one-time $25 registration fee.

**iPhone note:** there is no free equivalent step here — Apple requires a
$99/year Developer account to produce a real installable `.ipa` file, no
matter which tool is used. The Part 5 "Add to Home Screen" install is the
free option on iPhone, and it's a fully working app icon with offline
support and push notifications (iOS 16.4+).

## How the admin account works

Sign up (once) using the email `tamim.studio.personal@gmail.com`. The
backend automatically names that account "Admin" and flags `isAdmin: true`
on the user object it returns. Per your instructions the admin doesn't have
extra powers yet — that's intentionally left for a later phase.

## What's implemented right now (fully working, no mock data)

- Sign up / sign in / sign out, with hashed (never plain-text) passwords.
- Forgot password via a 6-digit emailed code (15-minute expiry).
- Sequential member IDs starting at 3130001 and book IDs starting at
  BOOK0000001, generated server-side.
- Profile page: greeting, live Explore/Members counts, My books / Borrowed /
  Lent out counts, incoming/outgoing request feeds, borrowed-books feed with
  "give back now", sign out.
- Explore/library grid with search, filter chips, and a detail sheet that
  shows real availability, lets you request to borrow with a duration, and
  only unlocks the WhatsApp button once you've sent (or the owner has
  approved) a request — as you specified.
- Add Books: pick multiple photos (any filename). Each one is compressed
  in the browser to under 500KB automatically, then shown as a tap-to-name
  thumbnail grid — book name/writer/publisher are optional and editable
  any time later via the pencil icon on the book's detail popup. The owner
  is always whoever is logged in — no filename format required.
- Borrow lifecycle: request → owner approves/cancels → due date is set →
  borrower can request return → owner confirms → book becomes available
  again. All of this is live sheet data, not placeholders.
- Members directory with per-member owned/lent/borrowed counts.
- Delete-book button for your own books.
- Dark, minimal, Islamic-toned theme; mobile-first with a bottom nav bar,
  works on desktop too.

## Gaps I noticed and how I handled them (per your "use your brain" note)

- **Sessions**: there's no real user-auth system possible with only Sheets,
  so login issues a random session token stored in the sheet and in the
  browser's `localStorage`; every request re-checks it. Good enough for a
  small trusted community, not bank-grade — worth knowing.
- **Concurrent double-borrow race**: if two people tap "approve" at almost
  the same instant, `handleApproveRequest_` re-checks the book is still
  `available` before approving, and auto-cancels other pending requests for
  that book once one is approved.
- **Malformed upload filenames**: rather than silently guessing, the add-books
  screen shows exactly which files it couldn't parse before you upload.
- **Notification badge**: the backend already returns a live unread count
  (`getInbox`) — wiring it to a bell icon with a red badge is a natural next
  small phase; I left the hook in `app.js` (`refreshProfile`) ready for it
  so I wasn't bolting on a cosmetic feature without a working data source
  behind it.
- **Reference field** ("who invited you") is stored on signup for your
  future use (e.g. a referral leaderboard) but isn't surfaced anywhere yet,
  since you said extra admin/analytics features can come gradually.

## Changelog — round 2 fixes

- **WhatsApp button root cause found**: Google Sheets silently converts an
  all-digit cell (like a phone number typed without a `+`) into a *Number*,
  which strips leading zeros and breaks the click-to-chat link — this is
  also what made the book detail popup fail to reopen (the code crashed
  partway through building the WhatsApp link). Fixed by (a) forcing the
  WhatsApp column to plain-text format in the sheet, (b) always saving the
  number with a leading `+`, and (c) opening the popup instantly, before
  filling in its contents, so a bad value can never block it from showing.
- **Double-tap protection**: every button and form now locks itself the
  instant it's tapped and ignores repeat taps until the request finishes —
  this is what was creating duplicate accounts on signup.
- **Return confirmation added**: the profile page now has a "Return
  requests" section so an owner can confirm a book was actually handed
  back; until then it correctly stays marked as borrowed.
- **Faster loading**: the profile page used to make 4 separate requests to
  Google — it now makes 1. A blinking "Baitul Hikmah" boot screen shows on
  first load, and list actions (approve/cancel/return/confirm) update the
  screen instantly while the save happens quietly in the background.
- **Reload keeps your page**: the page you're on is now saved in the
  address bar (e.g. `.../#explore`), so reloading — or hitting back — stays
  put instead of always jumping to the profile.
- **Tap a book anywhere to open it**: cards in "Requested", "Requesting"
  and "Borrowed" are now tappable and take you straight to that book.
- **+880 default**: the WhatsApp field on sign-up is pre-filled with `+880`
  and stays fully editable.
- **Simplified uploads**: see the Add Books description above — filenames
  no longer matter at all, and images are auto-compressed under 500KB.

**One item I could not fully verify:** the "forgot password" email flow —
I hardened the code (clearer error messages, no more silent failures) but
since email delivery depends on Gmail actually sending it, please check
your spam folder after testing. If it's not arriving at all, it's most
likely Apps Script's free daily email quota or Gmail delivery — not a bug
in the code — and worth a quick test with a second email address.

**Skipped:** item "#6 make app" in your feedback was cut off / unclear —
let me know what you meant and I'll take care of it.

## Natural next phases (not built yet, intentionally)

- Notification bell + dedicated notifications page.
- Admin dashboard (edit/delete any user or book, view all requests).
- Push/email notifications when a request is approved or a due date is close.
- Bengali/English language toggle.
