# Logistics AI Dashboard

An interactive, AI-powered analytics platform designed to ingest raw supply chain data and instantly generate actionable optimization strategies. 

Developed by Owen Schock as a technical showcase bridging Data Science and Supply Chain Management, this tool transforms standard CSV exports into comprehensive geospatial, financial, and predictive insights.

##  Key Features

* **Automated AI Insights:** Integrates directly with the Google Gemini 2.5 REST API to generate professional, natural-language supply chain optimizations based on dataset statistical summaries.
* **Geospatial Network Mapping:** Visualizes origin-to-destination freight corridors using interactive Plotly.js coordinate maps to identify high-cost or delayed routes.
* **Time-Series Forecasting:** Calculates safety stock, reorder points, and projects 30-day seasonal demand trends using Recharts.
* **Interactive ROI Simulator:** A waterfall chart visualization that allows users to model the financial impact of freight and transit time reductions.
* **Professional PDF Export:** One-click conversion of AI-generated Markdown reports into downloadable, styled PDF documents for stakeholder presentations.

##  Technical Stack

* **Frontend Framework:** React (TypeScript), Vite
* **Styling & UI:** Tailwind CSS, Framer Motion, Lucide Icons
* **Data Visualization:** Recharts, Plotly.js, D3.js
* **Data Parsing:** PapaParse (Client-side CSV ingestion)
* **AI Integration:** Google Gemini 2.5 API (Direct REST Fetch)
* **Document Generation:** jsPDF, html2canvas, React-Markdown

##  Getting Started

To run this project locally on your machine:

 1. **Clone the repository:**
   ```bash
   git clone [https://github.com/OwenSchock/logistics-ai-dashboard.git](https://github.com/OwenSchock/logistics-ai-dashboard.git)
   cd logistics-ai-dashboard

### 2. **Install Dependencies:**
    npm install

### 3. **Configure the AI Environment:**
    Create a .env.local file in the root directory of the project and add your Google Gemini API key: VITE_GEMINI_API_KEY=your_api_key_here

### 4. **Start the Development Server:**
    npm run dev

### 5. Test the Application:
Upload the provided sample dataset to see the geospatial network, predictive forecasting, and AI optimization tools populate with freight and inventory data.

🔗 **[Download the Master Portfolio Dataset here](https://github.com/OwenSchock/logistics-ai-dashboard/raw/refs/heads/main/master_portfolio_dataset.csv)**
    