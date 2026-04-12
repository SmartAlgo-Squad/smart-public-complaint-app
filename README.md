# ⚡ Smart Public Complaint App

An AI-powered civic issue resolution platform that allows citizens to submit, track, and resolve public complaints — with an admin dashboard for oversight and analytics.

## 🌐 Live Features

- **User Authentication** — Register/login with email or phone number
- **Submit Complaints** — Citizens can submit public complaints with details and category
- **Track Complaints** — View all submitted complaints and their statuses (Pending, In Progress, Resolved)
- **Analytics** — Visual stats on total, pending, and resolved complaints
- **AI Insights** — Intelligent analysis of complaint trends
- **Admin Dashboard** — Admins can manage all complaints, view reports, and configure system settings

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **Backend/Database:** Firebase (Firestore + Authentication)
- **Hosting:** Firebase Hosting / Static Web

## 📁 Project Structure

```
smart-public-complaint-app/
├── index.html            # Authentication page (Login / Register)
├── script.js             # Auth logic
├── style.css             # Auth page styles
├── dashboard.html        # User dashboard
├── dashboard.js          # User dashboard logic
├── dashboard.css         # Dashboard styles
├── admin-dashboard.html  # Admin dashboard
├── admin.js              # Admin logic
├── firebase-init.js      # Firebase configuration & initialization
```

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/SmartAlgo-Squad/smart-public-complaint-app.git
   cd smart-public-complaint-app
   ```

2. **Configure Firebase**
   - Create a Firebase project at [firebase.google.com](https://firebase.google.com)
   - Enable **Authentication** (Email/Password) and **Firestore**
   - Update `firebase-init.js` with your project credentials

3. **Open in browser**
   - Open `index.html` in a browser, or use a local server:
     ```bash
     npx serve .
     ```

## 👥 User Roles

| Role  | Access |
|-------|--------|
| User  | Submit & track own complaints |
| Admin | View all complaints, manage statuses, analytics |

## 📄 License

MIT License — feel free to use and contribute.
