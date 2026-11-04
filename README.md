# Smart Campus Management System

A responsive, front-end-only campus portal built with plain HTML, CSS and JavaScript. Students can register, log in, browse and sign up for campus events, send enquiries and view a personal dashboard. An administrator can review and manage student registrations, enquiries and events, and download the registrations and enquiries tables as CSV files.

No server, build step or internet connection is needed. All data is stored in the browser's `localStorage`.

## Features

### Students
- **Registration** with full name, email, student ID, department, year of study, phone and password. Every field is validated, with inline error messages. Duplicate emails and student IDs are rejected.
- **Login and logout** with the registered email and password.
- **Campus events**: search by title or venue, filter by category (Academic, Cultural, Sports, Workshop), and sign up or cancel. Each event shows the seats left, and full or past events can't be joined.
- **Enquiries**: anyone can send one. For logged-in students, name and email are filled in from their account. Each enquiry gets a reference number.
- **Dashboard**: profile details, signed-up events (with Cancel), and enquiries with their Open or Resolved status.

### Administrator
- Summary counts: registered students, open enquiries, events and event sign-ups.
- **Registrations**: searchable table, delete a student (with confirmation), download as CSV.
- **Enquiries**: search, filter by status, mark Resolved or reopen, download as CSV.
- **Events**: add an event (past dates rejected), delete an event (with confirmation).
- CSV downloads include only the rows that match the current search and filter. Passwords are never exported.

### General
- Multi-page site with one shared header, navigation and footer. The navigation changes depending on who is logged in.
- Mobile-first responsive layout, with a menu button below 768px wide.
- Accessibility: a label on every form field, a skip link, visible keyboard focus, error messages announced to screen readers, and keyboard-operable tabs on the admin page.
- Works offline. There are no CDNs or external fonts.

## Technologies used
- **HTML5**: semantic page structure and forms.
- **CSS3**: custom properties, Flexbox, Grid and media queries.
- **JavaScript (ES2017+, no libraries)**: validation, rendering, session handling and CSV export.
- **Web Storage API** (`localStorage` and `sessionStorage`) for data.
- **SVG** for the logo, favicon and home page illustration.

## Project structure

```
Smart_campus_mgmt/
├── index.html        Home page: introduction, upcoming events, quick links
├── register.html     Student registration form
├── login.html        Student and administrator login
├── events.html       Event list with search, filter and sign-up
├── enquiry.html      Enquiry form
├── dashboard.html    Student dashboard (students only)
├── admin.html        Administration panel (administrator only)
├── style.css         Shared styles for every page
├── script.js         Shared JavaScript for every page
├── assets/
│   ├── images/
│   │   ├── logo.svg
│   │   └── hero.svg
│   └── icons/
│       └── favicon.svg
└── README.md
```

Every page loads the same `script.js`. The `<body>` of each page has a `data-page` attribute, such as `data-page="events"`, and the script runs only the code for that page.

## How to run

You need a current version of Chrome, Edge or Firefox. Nothing else needs to be installed.

### Option 1: open the file directly
1. Download or clone the project folder.
2. Double-click `index.html`, or drag it into a browser window.

### Option 2: run a local web server (optional)
Use this if your browser blocks storage for files opened from disk, or if you want to open the site from another machine.

With Python 3:
```
cd Smart_campus_mgmt
python -m http.server 8000
```
Then open <http://localhost:8000/> in your browser.

With VS Code, install the **Live Server** extension, right-click `index.html` and choose **Open with Live Server**.

### Running on a virtual machine
1. Copy the project folder to the VM.
2. Either open `index.html` in the VM's browser (option 1), or start the Python server inside the VM (option 2).
3. To open the site from the host machine, start the server with `python -m http.server 8000 --bind 0.0.0.0`. Allow port 8000 in the VM firewall, then browse to `http://<vm-ip-address>:8000/`.

Data is stored separately for each browser and each address. For example, `file://` and `http://localhost:8000` each have their own data.

## Demo accounts
- **Administrator**: on the Login page choose **Administrator**, then enter username `admin` and password `admin123`.
- **Student**: register a new account on the Register page, then log in with that email and password.

## Resetting the data
To start again with only the sample events:
1. Open the browser developer tools (F12).
2. Go to **Application** (Chrome or Edge) or **Storage** (Firefox), then **Local Storage**.
3. Delete the keys `scms_students`, `scms_events`, `scms_enquiries` and `scms_session`, or clear all local storage for the site.
4. Reload the page. The sample events are added again.

## Limitations
- **Demo security only.** Login checks run in the browser, and passwords are stored as plain text in `localStorage`. Anyone with access to the browser can read or change the data. Don't use a real password.
- **Data stays in one browser.** The admin only sees registrations and enquiries made in the same browser, on the same address. There is no shared database.
- Clearing browser data deletes everything.

## Manual test checklist

Before you start, reset the data as described above.

### Layout and navigation
- [ ] Open `index.html` directly from disk. The page loads with no errors in the developer tools console.
- [ ] Every link in the header and footer opens the right page.
- [ ] At a width under 768px, the navigation collapses behind a **Menu** button. The button opens and closes the menu with mouse, Enter and Space. Escape closes the menu.
- [ ] Pressing Tab on any page first shows a "Skip to main content" link. Every link, button and field shows a visible focus outline.
- [ ] Pages show no horizontal scrolling at widths of 360px, 768px and 1280px. Admin tables scroll on their own inside the page.

### Events
- [ ] The Events page shows 8 sample events. The Home page shows the next 3.
- [ ] Typing in the search box narrows the list by title or venue. The category dropdown filters by category.
- [ ] Searching for a word that matches nothing shows the "No events match" message. **Clear filters** brings back all events.
- [ ] After a reload, the events are still there. After deleting `scms_events` and reloading, the sample events come back.

### Registration
- [ ] Submitting the empty form shows an error under every field and a summary at the top. Focus moves to the first invalid field.
- [ ] Each rule shows its own error: bad email format, student ID with symbols, phone number that isn't 10 digits, password under 8 characters or without a number, and passwords that don't match.
- [ ] A valid registration redirects to Login with a success message, and the email is already filled in.
- [ ] Registering again with the same email or the same student ID is rejected.
- [ ] The new student appears under `scms_students` in the developer tools.
- [ ] **Clear form** empties the fields and removes the error messages.

### Login, logout and access control
- [ ] A wrong password shows "Incorrect email or password."
- [ ] A student logs in and arrives at the Dashboard. The navigation shows Dashboard and Logout instead of Register and Login.
- [ ] Choosing **Administrator** changes the field to "Admin username" and shows the demo credentials. Logging in with `admin` / `admin123` opens the Admin page.
- [ ] While logged out, opening `dashboard.html` or `admin.html` directly redirects to Login with a message.
- [ ] A logged-in student who opens `admin.html` is redirected to Login.
- [ ] **Logout** returns to Home and the navigation shows Register and Login again.

### Event sign-up and dashboard
- [ ] While logged out, event cards show **Log in to sign up**. Clicking it opens Login, and after logging in the student returns to the Events page.
- [ ] A logged-in student clicks **Sign up**. The card shows "Signed up", the seats left go down by one, and the event appears under **My events** on the Dashboard.
- [ ] **Cancel** on the Dashboard or **Cancel sign-up** on the Events page removes the sign-up from both pages.
- [ ] An event that is full shows a disabled **Event full** button. To test this, the admin adds an event with capacity 1 and one student signs up, then a second student checks the event.
- [ ] The Dashboard shows the student's profile and the right counts.

### Enquiries
- [ ] Submitting the empty form shows errors. A message under 20 characters is rejected. The counter updates as you type.
- [ ] A logged-out visitor can submit an enquiry and sees a reference number.
- [ ] For a logged-in student, the name and email are filled in and can't be edited. After submitting, the enquiry shows as **Open** on their Dashboard.
- [ ] An enquiry whose message contains `<script>alert(1)</script>` is shown as plain text on the Dashboard and Admin page, and no alert appears.

### Admin: registrations and enquiries
- [ ] The summary counts match the data.
- [ ] Searching the registrations table filters the rows, and the "Showing X of Y" text updates.
- [ ] **Delete** asks for confirmation. After confirming, the student disappears, the counts update, and that student can no longer log in.
- [ ] **Mark resolved** changes the enquiry badge to Resolved and lowers the open count. The student's Dashboard now shows Resolved. **Reopen** changes it back.
- [ ] The status filter shows only Open or only Resolved enquiries.
- [ ] The Arrow keys move between the Registrations, Enquiries and Events tabs.

### Admin: events
- [ ] Submitting the empty Add event form shows errors. A past date is rejected.
- [ ] A valid new event appears in the admin table, on the Events page and, if it is one of the next 3, on the Home page.
- [ ] Deleting an event asks for confirmation, removes it from the Events page, and removes it from the **My events** list of any student who had signed up.

### CSV export
- [ ] **Download CSV** on Registrations downloads `registrations-YYYY-MM-DD.csv`. On Enquiries it downloads `enquiries-YYYY-MM-DD.csv`.
- [ ] The files open correctly in Excel or LibreOffice, including values that contain commas, quotes or line breaks.
- [ ] The registrations file has no password column.
- [ ] With a search or status filter active, the file contains only the matching rows.
- [ ] A value that starts with `=` (for example an enquiry subject `=1+1`) shows as text in the spreadsheet, not as a calculated result.
