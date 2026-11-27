# 🌾 Fasal-Nirnay (फसल-निर्णय)

**Voice-First Mandi Profit & Agricultural Decision Engine for Indian Farmers**
---

## 🎯 Problem Statement

Every week, millions of Indian smallholder farmers sell perishable produce (tomatoes, onions, potatoes, seasonal greens) at the nearest local mandi without knowing whether a market 30–80 km away offers higher net earnings after accounting for transport costs and heat/humidity spoilage. Existing agri-portals rely on dense English tables and manual forms that exclude voice-first rural users.

## 💡 Solution

**Fasal-Nirnay** turns a complex multi-variable market comparison into a single spoken Hindi/Hinglish interaction. A farmer taps the mic, speaks their crop and quantity naturally, and immediately receives—both visually and via spoken Hindi audio—the exact mandi that maximizes take-home profit.

## ✨ Key Features

- **🎙️ Voice-First Hindi & Hinglish Input:** Push-to-talk speech capture (`hi-IN` / `en-IN`) powered by the browser Web Speech API with real-time transcript preview and editable confirmation chips.
- **🧠 Dialect & Local Unit Normalization:** LLM-backed intent parser (with deterministic regex fallback) that converts regional crop names (*tamatar*, *pyaaz/kanda*, *aloo*, *gehu*, *dhan*) and local units (*1 bori = 0.5 quintal*, *ton*, *kg*) into standardized quintals.
- **🔊 Spoken Hindi Results (TTS):** Automatically reads out the top-ranked mandi, net profit after freight and spoilage, and extra profit compared to the nearest local mandi.
- **📍 Live Geolocation & Reverse Geocoding:** Uses browser GPS coordinates and OpenStreetMap Nominatim to detect the farmer's district and calculate road distances to nearby mandis.
- **📊 Live Mandi Prices & Weather Spoilage Risk:** Integrates **Agmarknet** wholesale rates and **OpenWeatherMap** temperature/humidity data to penalize transit spoilage on perishable crops—backed by resilient fallback data if external APIs rate-limit.
- **💬 Krishi Sahayak AI Chatbot & Itihaas (History):** Context-aware OpenRouter AI assistant for post-harvest/selling advice and saved decision history.
- **⚡ Frictionless Access:** Supports OTP login alongside a one-click **Demo Farmer Login** for instant testing.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, Web Speech API (`SpeechRecognition` & `speechSynthesis`) |
| **Backend** | Node.js, Express.js, MongoDB, Mongoose |
| **AI & Data APIs** | OpenRouter API (LLM Entity Extraction & Advisory Chat), Agmarknet API, OpenWeatherMap API, Nominatim Geocoding |
| **Deployment** | Vercel (Frontend), Render (Backend), MongoDB Atlas |

---

## ⚙️ Local Setup & Installation

### 1. Clone the Repository
```bash
git clone [https://github.com/abhiishekk2411/Fasal-Nirnay.git](https://github.com/abhiishekk2411/Fasal-Nirnay.git)
cd Fasal-Nirnay
