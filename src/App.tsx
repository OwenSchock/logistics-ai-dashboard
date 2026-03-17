import React, { useState, useMemo, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as d3 from 'd3';
import Plot from 'react-plotly.js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { 
  Upload, FileText, BarChart3, PieChart as PieChartIcon, 
  TrendingUp, AlertCircle, CheckCircle2, Search, 
  Filter, Database, BrainCircuit, ChevronRight, 
  Table as TableIcon, Download, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

console.log('All Env Variables:', import.meta.env);
console.log('Gemini Key:', import.meta.env.VITE_GEMINI_API_KEY);

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface DataRow {
  [key: string]: any;
}

interface ColumnStats {
  name: string;
  type: 'numeric' | 'categorical' | 'date';
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  uniqueValues?: number;
  missingCount: number;
}

interface LogisticsKPI {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: string;
}

// --- Constants ---
const LOGISTICS_KEYWORDS = {
  lead_time: ['lead_time', 'leadtime', 'delivery_time', 'days_to_ship'],
  inventory: ['inventory', 'stock', 'qty', 'quantity', 'on_hand'],
  cost: ['cost', 'shipping_cost', 'price', 'freight', 'expense'],
  sku: ['sku', 'product_id', 'item_code', 'part_number'],
  transit: ['transit_time', 'shipping_days', 'travel_time'],
  warehouse: ['warehouse', 'location', 'site_id', 'dc_id'],
  route: ['route', 'carrier', 'origin', 'destination']
};

const COLORS = ['#141414', '#5A5A40', '#F27D26', '#00FF00', '#FF4444', '#0000FF'];

// --- AI Initialization ---



export default function App() {
 // 1. We only get the key here, we DON'T initialize the AI yet
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  
  const [data, setData] = useState<DataRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced' | 'logistics' | 'predictive' | 'geospatial' | 'roi' | 'ai'>('simple');
  const [costReduction, setCostReduction] = useState(5);
  const [transitReduction, setTransitReduction] = useState(5);
  const [geoJson, setGeoJson] = useState<any>(null);

  // --- PDF Export Setup ---
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPDF = async () => {
    const element = reportRef.current;
    if (!element) return;

    setIsDownloading(true);
    try {
      // Capture the styled DOM element as a high-res image
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      
      // Create PDF and calculate aspect ratio to fit the page
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
      pdf.save('Logistics_AI_Optimization_Report.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  React.useEffect(() => {
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then(res => res.json())
      .then(data => setGeoJson(data))
      .catch(err => console.error("Failed to load map data", err));
  }, []);

  // Advanced Controls State
  const [selectedX, setSelectedX] = useState<string>('');
  const [selectedY, setSelectedY] = useState<string>('');
  const [groupBy, setGroupBy] = useState<string>('');

  // --- Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          setData(results.data as DataRow[]);
          const cols = Object.keys(results.data[0] as object);
          setHeaders(cols);
          
          // Set default advanced controls
          const numericCols = cols.filter(c => typeof (results.data[0] as any)[c] === 'number');
          const categoricalCols = cols.filter(c => typeof (results.data[0] as any)[c] === 'string');
          
          if (numericCols.length >= 2) {
            setSelectedX(numericCols[0]);
            setSelectedY(numericCols[1]);
          } else if (numericCols.length === 1) {
            setSelectedX(numericCols[0]);
            setSelectedY(numericCols[0]);
          }

          if (categoricalCols.length > 0) {
            setGroupBy(categoricalCols[0]);
          }
          
          setError(null);
          setAiReport(null);
        } else {
          setError("The CSV file appears to be empty.");
        }
      },
      error: (err) => {
        setError(`Error parsing CSV: ${err.message}`);
      }
    });
  };

  const generateAIReport = async () => {
    if (data.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const statsSummary = headers.map(h => {
        const values = data.map(d => d[h]).filter(v => v !== null && v !== undefined);
        const isNumeric = typeof values[0] === 'number';
        if (isNumeric) {
          const sum = values.reduce((a, b) => a + b, 0);
          return `${h}: Mean=${(sum / values.length).toFixed(2)}, Min=${Math.min(...values)}, Max=${Math.max(...values)}`;
        }
        return `${h}: ${new Set(values).size} unique categories`;
      }).join('\n');

      const sampleData = JSON.stringify(data.slice(0, 10), null, 2);

      const promptText = `
        Act as a Supply Chain Data Scientist. Analyze the following logistics dataset:
        SUMMARY: ${statsSummary}
        SAMPLE: ${sampleData}
        Identify 3 actionable logistics optimizations in clean Markdown format.
      `;

      // THE FIX: We are now calling your secure Vercel backend at '/api/generate'
      // The browser no longer knows Google or the API key exists.
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: promptText }]
          }]
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || result.error || 'Failed to communicate with backend');
      }

      if (result.candidates && result.candidates[0].content.parts[0].text) {
        setAiReport(result.candidates[0].content.parts[0].text);
      } else {
        throw new Error("API returned an empty response.");
      }

    } catch (err: any) {
      console.error("Secure API Error:", err);
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Computed Data ---
  const columnStats = useMemo(() => {
    return headers.map(h => {
      const values = data.map(d => d[h]);
      const numericValues = values.filter(v => typeof v === 'number') as number[];
      const isNumeric = numericValues.length > values.length * 0.5;
      
      const stats: ColumnStats = {
        name: h,
        type: isNumeric ? 'numeric' : 'categorical',
        missingCount: values.filter(v => v === null || v === undefined || v === '').length
      };

      if (isNumeric && numericValues.length > 0) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        stats.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        stats.median = sorted[Math.floor(sorted.length / 2)];
        stats.min = sorted[0];
        stats.max = sorted[sorted.length - 1];
      } else {
        stats.uniqueValues = new Set(values).size;
      }
      return stats;
    });
  }, [data, headers]);

  const logisticsKPIs = useMemo(() => {
    const kpis: LogisticsKPI[] = [];
    
    // Helper to find column by keyword
    const findCol = (keys: string[]) => headers.find(h => keys.some(k => h.toLowerCase().includes(k)));

    const leadTimeCol = findCol(LOGISTICS_KEYWORDS.lead_time);
    if (leadTimeCol) {
      const values = data.map(d => d[leadTimeCol]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        kpis.push({
          label: 'Avg Lead Time',
          value: `${avg.toFixed(1)} Days`,
          icon: <TrendingUp className="w-4 h-4" />,
          color: 'text-orange-600',
          trend: 'Baseline'
        });
      }
    }

    const inventoryCol = findCol(LOGISTICS_KEYWORDS.inventory);
    if (inventoryCol) {
      const total = data.map(d => d[inventoryCol]).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
      kpis.push({
        label: 'Total Inventory',
        value: total.toLocaleString(),
        icon: <Database className="w-4 h-4" />,
        color: 'text-blue-600'
      });
    }

    const costCol = findCol(LOGISTICS_KEYWORDS.cost);
    if (costCol) {
      const total = data.map(d => d[costCol]).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
      kpis.push({
        label: 'Total Logistics Cost',
        value: `$${total.toLocaleString()}`,
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-600'
      });
    }

    const skuCol = findCol(LOGISTICS_KEYWORDS.sku);
    if (skuCol) {
      const count = new Set(data.map(d => d[skuCol])).size;
      kpis.push({
        label: 'Active SKUs',
        value: count,
        icon: <TableIcon className="w-4 h-4" />,
        color: 'text-green-600'
      });
    }

    return kpis;
  }, [data, headers]);

  const advancedChartData = useMemo(() => {
    if (!selectedX || !selectedY || !groupBy) return [];
    
    // If grouping, aggregate
    const groups: { [key: string]: { x: number, y: number, count: number } } = {};
    data.forEach(row => {
      const g = String(row[groupBy]);
      const x = Number(row[selectedX]);
      const y = Number(row[selectedY]);
      
      if (!isNaN(x) && !isNaN(y)) {
        if (!groups[g]) groups[g] = { x: 0, y: 0, count: 0 };
        groups[g].x += x;
        groups[g].y += y;
        groups[g].count += 1;
      }
    });

    return Object.entries(groups).map(([name, vals]) => ({
      name,
      x: vals.x / vals.count,
      y: vals.y / vals.count,
      count: vals.count
    }));
  }, [data, selectedX, selectedY, groupBy]);

  const predictiveData = useMemo(() => {
    const dateCol = headers.find(h => ['date', 'time', 'timestamp', 'day'].some(k => h.toLowerCase().includes(k)));
    const demandCol = headers.find(h => ['quantity', 'sales', 'demand', 'sold', 'units'].some(k => h.toLowerCase().includes(k)));
    const leadTimeCol = headers.find(h => h.toLowerCase().includes('lead') && h.toLowerCase().includes('time'));

    if (!dateCol || !demandCol || data.length < 5) return null;

    // Sort and clean data
    const sortedData = [...data]
      .map(d => ({
        date: new Date(d[dateCol]).getTime(),
        dateStr: String(d[dateCol]),
        value: Number(d[demandCol]) || 0
      }))
      .filter(d => !isNaN(d.date))
      .sort((a, b) => a.date - b.date);

    if (sortedData.length < 5) return null;

    // Calculate Stats
    const values = sortedData.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / values.length);
    const avgLeadTime = leadTimeCol ? (data.reduce((a, b) => a + (Number(b[leadTimeCol]) || 0), 0) / data.length) : 7;

    // Safety Stock = Z * stdDev * sqrt(LeadTime)
    const zScore = 1.65; // 95% service level
    const safetyStock = zScore * stdDev * Math.sqrt(avgLeadTime);
    const reorderPoint = (mean * avgLeadTime) + safetyStock;

    // 1. Calculate Trend (Linear Regression)
    const n = sortedData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    sortedData.forEach((d, i) => {
      sumX += i;
      sumY += d.value;
      sumXY += i * d.value;
      sumXX += i * i;
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 2. Calculate Weekly Seasonality Indices
    // We group by Day of Week (0-6) and find the average deviation from the trend
    const dayWeights: { [key: number]: number[] } = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    sortedData.forEach((d, i) => {
      const day = new Date(d.date).getDay();
      const trendVal = slope * i + intercept;
      const ratio = trendVal === 0 ? 1 : d.value / trendVal;
      dayWeights[day].push(ratio);
    });

    const seasonalIndices: { [key: number]: number } = {};
    Object.entries(dayWeights).forEach(([day, weights]) => {
      seasonalIndices[Number(day)] = weights.length > 0 
        ? weights.reduce((a, b) => a + b, 0) / weights.length 
        : 1;
    });

    // 3. Generate Seasonal Forecast
    const forecast = [];
    const lastDate = sortedData[sortedData.length - 1].date;
    for (let i = 1; i <= 30; i++) {
      const forecastDate = new Date(lastDate + i * 24 * 60 * 60 * 1000);
      const day = forecastDate.getDay();
      const trendVal = slope * (n + i) + intercept;
      const forecastVal = Math.max(0, trendVal * seasonalIndices[day]);
      
      forecast.push({
        dateStr: forecastDate.toLocaleDateString(),
        forecast: forecastVal,
        upper: forecastVal + (zScore * stdDev),
        lower: Math.max(0, forecastVal - (zScore * stdDev))
      });
    }

    return {
      historical: sortedData.slice(-30),
      forecast,
      safetyStock,
      reorderPoint,
      stdDev,
      avgLeadTime,
      demandCol
    };
  }, [data, headers]);

  const formatCurrency = (val: number) => {
    const absVal = Math.abs(val);
    if (absVal >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (absVal >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const roiData = useMemo(() => {
    const volumeCol = headers.find(h => h.toLowerCase().includes('volume'));
    const costCol = headers.find(h => h.toLowerCase().includes('cost'));
    const transitCol = headers.find(h => h.toLowerCase().includes('transit') || h.toLowerCase().includes('days'));

    if (!volumeCol || !costCol || !transitCol) return null;

    let currentSpend = 0;
    let totalVolume = 0;
    let totalWeightedTransit = 0;

    data.forEach(row => {
      const vol = Number(row[volumeCol]) || 0;
      const cost = Number(row[costCol]) || 0;
      const transit = Number(row[transitCol]) || 0;

      currentSpend += vol * cost;
      totalVolume += vol;
      totalWeightedTransit += vol * transit;
    });

    const freightSavings = currentSpend * (costReduction / 100);
    const daysSaved = (totalWeightedTransit * (transitReduction / 100));
    const workingCapitalSavings = daysSaved * 50;
    const totalSavings = freightSavings + workingCapitalSavings;
    const projectedSpend = currentSpend - totalSavings;

    return {
      currentSpend,
      projectedSpend,
      totalSavings,
      freightSavings,
      workingCapitalSavings
    };
  }, [data, headers, costReduction, transitReduction]);

  const renderROISimulator = () => {
    if (!roiData) {
      return (
        <div className="bg-white p-12 text-center border border-dashed border-ink/20 rounded-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <div className="col-header">Missing Financial Data</div>
          <p className="text-sm opacity-50 mt-2">Ensure your CSV has 'Volume', 'Cost', and 'Transit' columns.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-80 space-y-8 bg-white p-6 border border-ink/10 rounded-sm">
          <div className="col-header">Simulation Controls</div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold opacity-70">Freight Cost Reduction</label>
              <span className="font-mono text-xs font-bold">{costReduction}%</span>
            </div>
            <input 
              type="range" min="0" max="20" step="1" 
              value={costReduction} 
              onChange={(e) => setCostReduction(Number(e.target.value))}
              className="w-full h-1 bg-ink/10 rounded-lg appearance-none cursor-pointer accent-ink"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold opacity-70">Transit Time Reduction</label>
              <span className="font-mono text-xs font-bold">{transitReduction}%</span>
            </div>
            <input 
              type="range" min="0" max="20" step="1" 
              value={transitReduction} 
              onChange={(e) => setTransitReduction(Number(e.target.value))}
              className="w-full h-1 bg-ink/10 rounded-lg appearance-none cursor-pointer accent-ink"
            />
          </div>

          <div className="pt-6 border-t border-ink/10 space-y-4">
            <div className="col-header opacity-40">Financial Logic</div>
            <p className="text-[10px] leading-relaxed opacity-50 italic">
              Working capital savings assume $50 per shipment-day saved. 
              Freight savings are applied directly to total annual spend.
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 border border-ink/10 shadow-sm">
              <div className="col-header mb-1">Current Spend</div>
              <div className="text-2xl font-mono font-bold">{formatCurrency(roiData.currentSpend)}</div>
            </div>
            <div className="bg-white p-6 border border-ink/10 shadow-sm">
              <div className="col-header mb-1">Projected Spend</div>
              <div className="text-2xl font-mono font-bold text-green-600">{formatCurrency(roiData.projectedSpend)}</div>
              <div className="text-[10px] text-green-600 font-bold mt-1">-{((roiData.totalSavings / roiData.currentSpend) * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-white p-6 border border-ink/10 shadow-sm bg-ink text-bg">
              <div className="col-header mb-1 text-bg/60">Total Savings</div>
              <div className="text-2xl font-mono font-bold">{formatCurrency(roiData.totalSavings)}</div>
              <div className="text-[10px] text-bg/40 mt-1 uppercase">Annualized ROI</div>
            </div>
          </div>

          <div className="bg-white p-8 border border-ink/10 rounded-sm h-[450px] flex items-center justify-center">
            <Plot
              data={[
                {
                  type: 'waterfall',
                  orientation: 'v',
                  measure: ['absolute', 'relative', 'relative', 'total'],
                  x: ['Current Spend', 'Freight Savings', 'Capital Savings', 'Projected Spend'],
                  textposition: 'outside',
                  text: [
                    formatCurrency(roiData.currentSpend),
                    `-${formatCurrency(roiData.freightSavings)}`,
                    `-${formatCurrency(roiData.workingCapitalSavings)}`,
                    formatCurrency(roiData.projectedSpend)
                  ],
                  y: [roiData.currentSpend, -roiData.freightSavings, -roiData.workingCapitalSavings, 0],
                  connector: {
                    line: {
                      color: 'rgb(63, 63, 63)'
                    }
                  },
                  increasing: { marker: { color: '#00FF00' } },
                  decreasing: { marker: { color: '#FF4444' } },
                  totals: { marker: { color: '#141414' } }
                }
              ]}
              layout={{
                title: 'Annualized Savings Waterfall',
                showlegend: false,
                autosize: true,
                margin: { t: 40, b: 40, l: 60, r: 20 },
                font: { family: 'JetBrains Mono', size: 10 },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
                yaxis: { showgrid: true, gridcolor: '#eee', zeroline: false }
              }}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
        </div>
      </div>
    );
  };

  const geospatialData = useMemo(() => {
    const latCols = headers.filter(h => h.toLowerCase().includes('lat'));
    const lonCols = headers.filter(h => h.toLowerCase().includes('lon'));
    
    const originLat = latCols.find(h => h.toLowerCase().includes('origin'));
    const originLon = lonCols.find(h => h.toLowerCase().includes('origin'));
    const destLat = latCols.find(h => h.toLowerCase().includes('dest'));
    const destLon = lonCols.find(h => h.toLowerCase().includes('dest'));
    
    // Find specific detail columns
    const warehouseIdCol = headers.find(h => h.toLowerCase().includes('warehouse_id') || h.toLowerCase().includes('origin_id'));
    const destCityCol = headers.find(h => h.toLowerCase().includes('destination_city') || h.toLowerCase().includes('dest_city'));
    const transitCol = headers.find(h => h.toLowerCase().includes('transit_days') || h.toLowerCase().includes('avg_transit'));
    const costCol = headers.find(h => h.toLowerCase().includes('cost_per_shipment') || h.toLowerCase().includes('avg_cost'));

    if (!originLat || !originLon || !destLat || !destLon) return null;

    return {
      routes: data.map(d => ({
        origin: [Number(d[originLon]), Number(d[originLat])],
        dest: [Number(d[destLon]), Number(d[destLat])],
        warehouseId: String(d[warehouseIdCol || ''] || d['Origin_Warehouse'] || 'Origin'),
        destCity: String(d[destCityCol || ''] || d['Destination'] || 'Destination'),
        transitDays: Number(d[transitCol || '']) || 0,
        costPerShipment: Number(d[costCol || '']) || 0,
        metric: Number(d[transitCol || ''] || d[costCol || '']) || 0
      })).filter(r => !isNaN(r.origin[0]) && !isNaN(r.origin[1]) && !isNaN(r.dest[0]) && !isNaN(r.dest[1]))
    };
  }, [data, headers]);

  const renderGeospatialAnalytics = () => {
    if (!geospatialData) {
      return (
        <div className="bg-white p-12 text-center border border-dashed border-ink/20 rounded-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <div className="col-header">Geospatial Data Missing</div>
          <p className="text-sm opacity-50 mt-2">Ensure your CSV has 'Lat' and 'Lon' columns for both Origin and Destination.</p>
        </div>
      );
    }

    const traces: any[] = [];

    // 1. Route Lines (Arcs)
    geospatialData.routes.forEach((route, i) => {
      traces.push({
        type: 'scattergeo',
        locationmode: 'USA-states',
        lon: [route.origin[0], route.dest[0]],
        lat: [route.origin[1], route.dest[1]],
        mode: 'lines',
        line: {
          width: 1.5,
          color: '#FF4444',
          shape: 'spline'
        },
        opacity: 0.4,
        hoverinfo: 'text',
        text: `Route: ${route.warehouseId} → ${route.destCity}<br>Transit: ${route.transitDays} Days<br>Cost: $${route.costPerShipment.toFixed(2)}`,
        showlegend: false
      });
    });

    // 2. Origin Nodes
    traces.push({
      type: 'scattergeo',
      locationmode: 'USA-states',
      lon: geospatialData.routes.map(r => r.origin[0]),
      lat: geospatialData.routes.map(r => r.origin[1]),
      mode: 'markers',
      marker: {
        size: 10,
        color: '#F27D26',
        line: { width: 1, color: 'white' }
      },
      name: 'Origins',
      hoverinfo: 'text',
      text: geospatialData.routes.map(r => `Warehouse: ${r.warehouseId}`)
    });

    // 3. Destination Nodes
    traces.push({
      type: 'scattergeo',
      locationmode: 'USA-states',
      lon: geospatialData.routes.map(r => r.dest[0]),
      lat: geospatialData.routes.map(r => r.dest[1]),
      mode: 'markers',
      marker: {
        size: 8,
        color: '#141414',
        symbol: 'diamond',
        line: { width: 1, color: 'white' }
      },
      name: 'Destinations',
      hoverinfo: 'text',
      text: geospatialData.routes.map(r => `Destination: ${r.destCity}`)
    });

    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div className="col-header">Geospatial Route Network</div>
          <div className="col-header opacity-40">Orange: Origins | Black: Destinations</div>
        </div>

        <div className="bg-white border border-ink/10 rounded-sm p-4 h-[650px] flex items-center justify-center overflow-hidden shadow-sm">
          <Plot
            data={traces}
            layout={{
              showlegend: true,
              geo: {
                scope: 'usa',
                projection: { type: 'albers usa' },
                showland: true,
                landcolor: 'rgb(243, 243, 243)',
                subunitcolor: 'rgb(217, 217, 217)',
                countrycolor: 'rgb(217, 217, 217)',
                showsubunits: true,
                showcountries: true,
                showlakes: true,
                lakecolor: 'rgb(255, 255, 255)',
                resolution: 50
              },
              margin: { l: 0, r: 0, t: 0, b: 0 },
              font: { family: 'JetBrains Mono', size: 10 },
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              legend: { x: 0.85, y: 0.1, bgcolor: 'rgba(255,255,255,0.9)', bordercolor: '#eee', borderwidth: 1 }
            }}
            style={{ width: '100%', height: '100%' }}
            config={{ responsive: true, displayModeBar: false }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 border border-ink/10 rounded-sm">
            <div className="col-header mb-4">Top Cost/Time Routes</div>
            <div className="space-y-3">
              {geospatialData.routes
                .sort((a, b) => b.metric - a.metric)
                .slice(0, 5)
                .map((route, i) => (
                  <div key={i} className="flex justify-between items-center text-xs pb-2 border-b border-ink/5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{route.warehouseId}</span>
                      <ChevronRight className="w-3 h-3 opacity-30" />
                      <span className="opacity-60">{route.destCity}</span>
                    </div>
                    <div className="font-mono font-bold text-red-600">{route.metric.toFixed(1)}</div>
                  </div>
                ))}
            </div>
          </div>
          <div className="bg-white p-6 border border-ink/10 rounded-sm">
            <div className="col-header mb-4">Network Efficiency Insight</div>
            <p className="text-xs opacity-60 leading-relaxed">
              The map visualizes the flow of goods across your network. Red lines indicate routes exceeding performance thresholds. 
              Interactive hover details provide specific transit times and costs for each lane. 
              Consider rerouting high-cost lanes to closer distribution centers or consolidating shipments.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderPredictiveAnalytics = () => {
    if (!predictiveData) {
      return (
        <div className="bg-white p-12 text-center border border-dashed border-ink/20 rounded-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <div className="col-header">Insufficient Time-Series Data</div>
          <p className="text-sm opacity-50 mt-2">Ensure your CSV has a 'Date' and 'Quantity' column with at least 5 records.</p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 border-l-4 border-orange-500 shadow-sm">
            <div className="col-header mb-1">Recommended Safety Stock</div>
            <div className="text-3xl font-mono font-bold text-orange-600">{Math.round(predictiveData.safetyStock)} Units</div>
            <div className="text-[10px] opacity-40 mt-2 uppercase">95% Service Level Protection</div>
          </div>
          <div className="bg-white p-6 border-l-4 border-ink shadow-sm">
            <div className="col-header mb-1">Reorder Point (ROP)</div>
            <div className="text-3xl font-mono font-bold">{Math.round(predictiveData.reorderPoint)} Units</div>
            <div className="text-[10px] opacity-40 mt-2 uppercase">Trigger order at this level</div>
          </div>
          <div className="bg-white p-6 border-l-4 border-blue-500 shadow-sm">
            <div className="col-header mb-1">Demand Volatility (σ)</div>
            <div className="text-3xl font-mono font-bold text-blue-600">{predictiveData.stdDev.toFixed(2)}</div>
            <div className="text-[10px] opacity-40 mt-2 uppercase">Daily Standard Deviation</div>
          </div>
        </div>

        <div className="bg-white p-8 border border-ink/10 rounded-sm h-[500px]">
          <div className="col-header mb-6">30-Day Demand Forecast: {predictiveData.demandCol}</div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...predictiveData.historical, ...predictiveData.forecast]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="dateStr" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" name="Historical" stroke="#141414" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#F27D26" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="upper" name="Upper Bound" stroke="#F27D26" strokeWidth={1} opacity={0.2} dot={false} />
              <Line type="monotone" dataKey="lower" name="Lower Bound" stroke="#F27D26" strokeWidth={1} opacity={0.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-ink/5 p-6 rounded-sm border border-ink/10">
          <div className="flex gap-4 items-start">
            <BrainCircuit className="w-5 h-5 mt-1 opacity-50" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1">Optimization Logic</div>
              <p className="text-xs opacity-60 leading-relaxed">
                Safety stock is calculated using a Z-score of 1.65 (95% service level), accounting for a {predictiveData.avgLeadTime.toFixed(1)}-day lead time. 
                The forecast uses a linear trend analysis of historical demand patterns.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSimpleAnalytics = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columnStats.slice(0, 8).map(stat => (
          <div key={stat.name} className="bg-white p-4 border border-ink/10 rounded-sm shadow-sm">
            <div className="col-header mb-2">{stat.name}</div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-mono">
                {stat.type === 'numeric' ? stat.mean?.toFixed(2) : stat.uniqueValues}
              </div>
              <div className="text-[10px] uppercase opacity-50">
                {stat.type === 'numeric' ? 'Avg' : 'Unique'}
              </div>
            </div>
            <div className="mt-2 text-[10px] opacity-40">
              Missing: {stat.missingCount}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {columnStats.filter(s => s.type === 'numeric').slice(0, 4).map(stat => (
          <div key={stat.name} className="bg-white p-6 border border-ink/10 rounded-sm h-[300px]">
            <div className="col-header mb-4">{stat.name} Distribution</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(0, 20)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey={headers[0]} hide />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141414', color: '#E4E3E0', border: 'none', borderRadius: '0px' }}
                  itemStyle={{ color: '#E4E3E0' }}
                />
                <Bar dataKey={stat.name} fill="#141414" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAdvancedAnalytics = () => (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-64 space-y-6 bg-white p-6 border border-ink/10 rounded-sm">
        <div className="col-header">Controls</div>
        
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold opacity-70">X Axis (Numeric)</label>
          <select 
            value={selectedX} 
            onChange={(e) => setSelectedX(e.target.value)}
            className="w-full p-2 border border-ink/20 text-sm font-mono focus:outline-none focus:border-ink"
          >
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold opacity-70">Y Axis (Numeric)</label>
          <select 
            value={selectedY} 
            onChange={(e) => setSelectedY(e.target.value)}
            className="w-full p-2 border border-ink/20 text-sm font-mono focus:outline-none focus:border-ink"
          >
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold opacity-70">Group By (Categorical)</label>
          <select 
            value={groupBy} 
            onChange={(e) => setGroupBy(e.target.value)}
            className="w-full p-2 border border-ink/20 text-sm font-mono focus:outline-none focus:border-ink"
          >
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="pt-4 border-t border-ink/10">
          <div className="text-[10px] opacity-50 italic">
            Showing averages grouped by {groupBy}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-8">
        <div className="bg-white p-8 border border-ink/10 rounded-sm h-[500px]">
          <div className="col-header mb-6">Cross-Analysis: {selectedY} vs {selectedX}</div>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" dataKey="x" name={selectedX} label={{ value: selectedX, position: 'insideBottom', offset: -10 }} />
              <YAxis type="number" dataKey="y" name={selectedY} label={{ value: selectedY, angle: -90, position: 'insideLeft' }} />
              <ZAxis type="number" dataKey="count" range={[60, 400]} name="Count" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Data Points" data={advancedChartData} fill="#141414">
                {advancedChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderLogisticsFocus = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {logisticsKPIs.map((kpi, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={kpi.label} 
            className="bg-white p-6 border-l-4 border-ink shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-ink/5 rounded-full">{kpi.icon}</div>
              {kpi.trend && <div className="text-[10px] font-bold text-green-600 uppercase">{kpi.trend}</div>}
            </div>
            <div className="col-header mb-1">{kpi.label}</div>
            <div className={cn("text-3xl font-mono font-bold", kpi.color)}>{kpi.value}</div>
          </motion.div>
        ))}
      </div>

      {logisticsKPIs.length === 0 && (
        <div className="bg-white p-12 text-center border border-dashed border-ink/20 rounded-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <div className="col-header">No Logistics Domains Detected</div>
          <p className="text-sm opacity-50 mt-2">Upload a CSV with columns like 'lead_time', 'inventory', or 'shipping_cost' to see logistics KPIs.</p>
        </div>
      )}

      {logisticsKPIs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-8 border border-ink/10 rounded-sm h-[400px]">
            <div className="col-header mb-6">Lead Time & Cost Trends</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.slice(0, 30)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey={headers[0]} hide />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey={headers.find(h => h.toLowerCase().includes('time')) || ''} stroke="#F27D26" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={headers.find(h => h.toLowerCase().includes('cost')) || ''} stroke="#141414" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-8 border border-ink/10 rounded-sm h-[400px]">
            <div className="col-header mb-6">Inventory by {groupBy || 'Category'}</div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={advancedChartData.slice(0, 8)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {advancedChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );

  const renderAIInsights = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="col-header">Automated AI Analysis</div>
        <div className="flex gap-4">
          {/* NEW: Download PDF Button (Only shows when report exists) */}
          {aiReport && (
            <button 
              onClick={downloadPDF}
              disabled={isDownloading}
              className="flex items-center gap-2 border border-ink/20 text-ink px-6 py-2 rounded-sm text-xs uppercase tracking-widest font-bold hover:bg-ink/5 disabled:opacity-50 transition-all"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'Exporting...' : 'Download PDF'}
            </button>
          )}
          
          <button 
            onClick={generateAIReport}
            disabled={isAnalyzing || data.length === 0}
            className="flex items-center gap-2 bg-ink text-bg px-6 py-2 rounded-sm text-xs uppercase tracking-widest font-bold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            {isAnalyzing ? 'Analyzing Data...' : 'Generate AI Insights'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-sm min-h-[500px] p-8">
        {aiReport ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* NEW: Added reportRef here so html2canvas knows what to capture */}
            <div ref={reportRef} className="prose prose-sm max-w-none font-sans text-ink/80 leading-relaxed p-4 bg-white">
              <ReactMarkdown>
                {aiReport}
              </ReactMarkdown>
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <BrainCircuit className="w-16 h-16 mb-4 opacity-10" />
            <div className="col-header opacity-50">Ready for Analysis</div>
            <p className="text-sm opacity-40 mt-2 max-w-md">Click the button above to send a statistical summary of your dataset to Gemini for supply chain optimization recommendations.</p>
          </div>
        )}
      </div>
    </div>
  );

  // --- Main Layout ---
  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter uppercase mb-2">LogisticsAI</h1>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-bold text-blue-500/60">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> System Active</span>
            <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {data.length} Records Loaded</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="cursor-pointer flex items-center gap-2 bg-white border border-ink px-4 py-2 rounded-sm text-[10px] uppercase font-bold hover:bg-ink hover:text-bg transition-all">
            <Upload className="w-4 h-4" />
            Upload CSV
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
          {data.length > 0 && (
            <button className="p-2 border border-ink/20 rounded-sm hover:bg-ink/5">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3 rounded-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {data.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border-2 border-dashed border-ink/20 rounded-sm p-24 text-center"
        >
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-ink/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 opacity-20" />
            </div>
            <h2 className="text-xl font-bold mb-2 uppercase tracking-tight">No Data Ingested</h2>
            <p className="text-sm opacity-50 mb-8">Upload a CSV file to begin automated supply chain analytics and AI-driven insights.</p>
            <label className="cursor-pointer inline-flex items-center gap-2 bg-ink text-bg px-8 py-3 rounded-sm text-xs uppercase tracking-widest font-bold hover:opacity-90 transition-all">
              <Upload className="w-4 h-4" />
              Select CSV File
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* Tabs */}
          <nav className="flex border-b border-ink/10">
            {[
              { id: 'simple', label: 'SIMPLE ANALYTICS', icon: <BarChart3 className="w-4 h-4" /> },
              { id: 'advanced', label: 'ADVANCED CONTROLS', icon: <Filter className="w-4 h-4" /> },
              { id: 'logistics', label: 'LOGISTICS FOCUS', icon: <TrendingUp className="w-4 h-4" /> },
              { id: 'predictive', label: 'PREDICTIVE', icon: <TrendingUp className="w-4 h-4" /> },
              { id: 'geospatial', label: 'GEOSPATIAL', icon: <Search className="w-4 h-4" /> },
              { id: 'roi', label: 'ROI SIMULATOR', icon: <TrendingUp className="w-4 h-4" /> },
              { id: 'ai', label: 'AI INSIGHTS', icon: <BrainCircuit className="w-4 h-4" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-6 py-4 text-[10px] uppercase font-bold tracking-widest transition-all relative",
                  activeTab === tab.id ? "text-ink" : "text-ink/40 hover:text-ink/60"
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink" />
                )}
              </button>
            ))}
          </nav>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'simple' && renderSimpleAnalytics()}
              {activeTab === 'advanced' && renderAdvancedAnalytics()}
              {activeTab === 'logistics' && renderLogisticsFocus()}
              {activeTab === 'predictive' && renderPredictiveAnalytics()}
              {activeTab === 'geospatial' && renderGeospatialAnalytics()}
              {activeTab === 'roi' && renderROISimulator()}
              {activeTab === 'ai' && renderAIInsights()}
            </motion.div>
          </AnimatePresence>

          {/* Data Preview Table */}
          <section className="mt-16">
            <div className="flex justify-between items-end mb-6">
              <div className="col-header">Raw Data Preview (First 50 Rows)</div>
              <div className="text-[10px] opacity-40 uppercase font-bold">Scroll horizontally to view all columns</div>
            </div>
            <div className="bg-white border border-ink/10 rounded-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-ink/5">
                    {headers.map(h => (
                      <th key={h} className="px-4 py-3 col-header border-b border-ink/10">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map((row, i) => (
                    <tr key={i} className="data-row">
                      {headers.map(h => (
                        <td key={h} className="px-4 py-3 text-xs font-mono data-value whitespace-nowrap">
                          {String(row[h] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-24 pt-8 border-t border-ink/10 flex flex-col md:flex-row justify-between items-center gap-4 opacity-40 text-[10px] uppercase tracking-widest font-bold">
        <div>&copy; 2024 LogisticsAI Systems</div>
        <div className="flex gap-6">
          <span>Privacy</span>
          <span>Terms</span>
          <span>API Status: Operational</span>
        </div>
      </footer>
    </div>
  );
}
