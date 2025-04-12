# 🏐 Volleyball Team Management Platform

A sleek, real-time web app built for managing volleyball pickup games!  
This platform helps **players join the waiting list**, and **admins sort, manage, and edit teams** with an intuitive UI powered by Firebase.

---

## 📸 Demo

_Member Panel_: [🔗 Live Site on Vercel](https://volleyball-team-sorter-5v7j.vercel.app)  
_Admin Panel_: [https://volleyball-team-sorter-5v7j.vercel.app](https://volleyball-team-sorter-5v7j.vercel.app/admin)

---

## 🎯 Features

### 👥 Players Page (`index.html`)
- Join the waiting list with name and skill level.
- Real-time feedback on your status.
- Automatically shows assigned team after admin sorts.
- Manual "Leave Game" button to reset participation.
- Responsive toast notifications for updates.

### 🛠️ Admin Panel (`admin.html`)
- Admin login with email/password (hardcoded validation).
- Set admin name, skill level, and toggle "Playing"/"Not Playing".
- View and manage current waiting list.
- Sort and rebalance teams with skill-weighted logic.
- **Edit Mode** with drag-and-drop powered by `SortableJS`:
  - Move players between teams.
  - Drag players to trash to remove them.
  - Undo last move instantly.
  - Players dragged into full teams become substitutes.
- Reset button to wipe all data from Firebase.
- Toast-based confirmations and feedback.

---

## 🚀 Tech Stack

| Technology     | Purpose                          |
|----------------|----------------------------------|
| **HTML/CSS**   | UI and layout                    |
| **JavaScript** | Logic and interaction            |
| **Firebase**   | Auth, Realtime Database          |
| **SortableJS** | Drag-and-drop editing in admin   |
| **Vercel**     | Deployment hosting               |

---

## 📂 Project Structure

```bash
├── index.html          # Player view
├── admin.html          # Admin panel
├── styles.css          # Shared styles
├── firebase.js         # Firebase config & exports
├── script.js           # Player-side logic
├── admin.js            # Admin-side logic
└── vercel.json         # Vercel routing (rewrites clean URLs)
