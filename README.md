# 🚀 AirDrop Web (file-transfer-yuta)

> **Fast, beautiful, and secure cross-device file sharing over local Wi-Fi / LAN with instant QR codes and a modern Web UI.**

![AirDrop Web](public/airdrop-icon.png)

---

## ✨ Features

- ⚡ **Instant Local Transfer**: Send files directly over Wi-Fi / LAN at high speed without relying on slow external cloud uploads.
- 📱 **QR Code & PIN Sharing**: Scan the QR code with any phone/tablet camera or enter an easy 6-character PIN code (`AD-XXXX`) to receive files instantly.
- 🌐 **Cross-Platform**: Works seamlessly across Linux, macOS, Windows, Android, iOS — anything with a modern web browser.
- 🎯 **Sender & Receiver Hub**:
  - **Sender**: Drag & drop multiple files, create share packages with custom expiry, copy instant links or show full-screen QR codes.
  - **Receiver**: Quick preview for images, audio, video, PDF, text, and 1-click batch download.
- 📡 **Nearby Radar**: Automatically detects local network interfaces and displays LAN IP & access URLs.
- 📜 **Transfer History**: Keep track of recent sent and received packages locally.
- 🔔 **Sound Alerts & Desktop Notifications**: Audio feedback on transfer completion and native Linux system notifications.
- 🖥️ **Linux Desktop Integration**: Pre-configured shell scripts (`start-app.sh`, `stop-app.sh`) and `.desktop` launcher.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Framer Motion, Canvas Confetti
- **Backend**: Node.js, Express, Multer, Tsx / esbuild
- **Networking**: LAN interface auto-discovery, HTTP streaming & REST APIs

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/TontonYuta/file-transfer-yuta.git
cd file-transfer-yuta
```

### 2. Install dependencies
```bash
npm install
```

### 3. Development Mode
Run both frontend and backend concurrently with hot reload:
```bash
npm run dev
```

Visit `http://localhost:3000` (or the port displayed in your terminal).

### 4. Production Build & Run
```bash
# Build frontend and backend
npm run build:all

# Run production server
npm run prod
```

---

## 🐧 Linux Background Launcher

Scripts are included for convenient Linux desktop usage:

- **Start background server & open browser**:
  ```bash
  chmod +x start-app.sh stop-app.sh
  ./start-app.sh
  ```
- **Stop background server**:
  ```bash
  ./stop-app.sh
  ```

---

## 📄 License

This project is licensed under the [Apache-2.0 License](LICENSE).
