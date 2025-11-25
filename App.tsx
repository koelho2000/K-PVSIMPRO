

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProjectState, ProjectSettings, LoadProfile, RoofSegment, SystemConfig, SolarPanel, Inverter, Battery, FinancialSettings } from './types';
import { PANELS_DB, INVERTERS_DB, BATTERIES_DB, APP_VERSION, AUTHOR_NAME, AUTHOR_URL, STANDARD_LOAD_PROFILES, PORTUGAL_MUNICIPALITIES } from './constants';
import { suggestSystem } from './services/geminiService';
import { runSimulation, generateClimateData, generateScenarios, Scenario, parseEpw, generateSyntheticLoadProfile, analyzeResults, ImprovementSuggestion } from './services/solarService';
import { calculateDetailedBudget, BudgetItem } from './services/pricing';
import { calculateFinancials, FinancialResult } from './services/financialService';
import { SimulationCharts } from './components/SimulationCharts';
import { ClimateCharts } from './components/ClimateCharts';
import { LoadCharts } from './components/LoadCharts';
import { RoofDesigner } from './components/RoofDesigner';
import { ElectricalScheme } from './components/ElectricalScheme';
import { ReportView } from './components/ReportView';
import { MonitoringPlayer } from './components/MonitoringPlayer';
import { 
  LayoutDashboard, MapPin, Sun, Layout, BatteryCharging, 
  BarChart3, FileText, Settings, Upload, Download, Copy, RefreshCw, Calculator, Printer, CheckCircle, ArrowRight, AlertTriangle, PlusCircle, Trash2, Coins, TrendingUp, FileSpreadsheet, Zap, Info, ExternalLink, Cpu, Tv, Lightbulb
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, CartesianGrid, AreaChart, Area } from 'recharts';

const INITIAL_PROJECT: ProjectState = {
  id: 'new-project',
  createdDate: new Date().toISOString(),
  version: APP_VERSION,
  settings: {
    name: 'Projeto Residencial Exemplo',
    clientName: 'João Silva',
    address: 'Lisboa',
    latitude: 38.7223,
    longitude: -9.1393,
    climateDataSource: 'auto',
    climateDescription: 'Clima padrão Lisboa'
  },
  financialSettings: {
      electricityPriceEurKwh: 0.22,
      gridExportPriceEurKwh: 0.05,
      inflationRate: 3.0,
      panelDegradation: 0.5
  },
  loadProfile: {
    type: 'simplified',
    baseLoadKw: 0.5,
    peakLoadKw: 4.5,
    annualConsumptionKwh: 6500,
  },
  roofSegments: [
    { id: 'roof-1', width: 10, height: 6, azimuth: 0, tilt: 30, panelsCount: 10, edgeMargin: 0.5, verticalSpacing: 0.05, horizontalSpacing: 0.02, x: 5, y: 5 }
  ],
  systemConfig: {
    selectedPanelId: 'p1',
    selectedInverterId: 'i1',
    inverterCount: 1,
    selectedBatteryId: null,
    batteryCount: 1,
    optimizationGoal: 'autoconsumption',
    cableDcMeters: 20,
    cableAcMeters: 10,
  },
  simulationResult: null,
};

export default function App() {
  const [project, setProject] = useState<ProjectState>(INITIAL_PROJECT);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSimulating, setIsSimulating] = useState(false);
  const [comparisonProjects, setComparisonProjects] = useState<ProjectState[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isGeneratingScenarios, setIsGeneratingScenarios] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // Flag for changes requiring re-calc
  const [suggestions, setSuggestions] = useState<ImprovementSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadImportInputRef = useRef<HTMLInputElement>(null);
  const epwImportInputRef = useRef<HTMLInputElement>(null);
  const compareInputRef = useRef<HTMLInputElement>(null);

  // Initialize climate on mount or change if empty
  useEffect(() => {
    if (!project.climateData) {
        const climate = generateClimateData(project.settings.latitude);
        setProject(p => ({...p, climateData: climate}));
    }
  }, [project.settings.latitude]);

  // Generate initial hourly load if missing (for correct charts on first load)
  useEffect(() => {
      if (project.loadProfile.type === 'simplified' && !project.loadProfile.hourlyData) {
          const hourly = generateSyntheticLoadProfile(
              project.loadProfile.annualConsumptionKwh, 
              project.loadProfile.baseLoadKw, 
              project.loadProfile.peakLoadKw
          );
          setProject(p => ({
              ...p,
              loadProfile: { ...p.loadProfile, hourlyData: hourly }
          }));
      }
  }, []);

  // Dirty State Tracker
  useEffect(() => {
      if (project.simulationResult) {
           setIsDirty(true);
           setSuggestions([]); // Clear old suggestions
           setShowSuggestions(false);
      }
  }, [
      project.roofSegments, 
      project.systemConfig, 
      project.loadProfile, 
      project.settings.latitude,
      project.financialSettings // Re-calc needed if prices change
  ]);

  // If simulationResult is updated explicitly, clear dirty
  useEffect(() => {
      if (project.simulationResult) {
          setIsDirty(false);
      }
  }, [project.simulationResult]);


  // -- Actions --

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const cityName = e.target.value;
      const cityData = PORTUGAL_MUNICIPALITIES.find(c => c.name === cityName);
      
      if (cityData) {
          const newClimate = generateClimateData(cityData.lat);

          setProject(prev => ({
              ...prev,
              settings: {
                  ...prev.settings,
                  address: cityData.name,
                  latitude: cityData.lat,
                  longitude: cityData.lng,
                  climateDescription: `Dados climáticos gerados para ${cityData.name}`
              },
              climateData: newClimate
          }));
      }
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const result = runSimulation(project);
      setProject(prev => ({ ...prev, simulationResult: result }));
      setIsSimulating(false);
      setIsDirty(false);
      setSuggestions([]); // Reset
      setShowSuggestions(false);
      setActiveTab('results');
    }, 500); 
  };

  const handleAnalyze = () => {
      const res = analyzeResults(project);
      setSuggestions(res);
      setShowSuggestions(true);
  };

  const handleGenerateScenarios = () => {
      setIsGeneratingScenarios(true);
      setTimeout(() => {
          const generated = generateScenarios(project);
          setScenarios(generated);
          setIsGeneratingScenarios(false);
      }, 500);
  };

  const applyScenario = (s: Scenario) => {
      setProject(prev => ({
          ...prev,
          systemConfig: s.systemConfig,
          roofSegments: s.roofSegments,
          simulationResult: s.simulation // Pre-load the simulation
      }));
      setIsDirty(false);
      alert(`Cenário "${s.label}" aplicado com sucesso!`);
  };

  const updateLoadProfile = (profileId: string) => {
      const standard = STANDARD_LOAD_PROFILES.find(p => p.id === profileId);
      if (standard) {
          // Generate 8760h data that strictly matches the annual kWh
          const hourly = generateSyntheticLoadProfile(standard.annualKwh, standard.baseKw, standard.peakKw);
          
          setProject(prev => ({
              ...prev,
              loadProfile: {
                  ...prev.loadProfile,
                  type: 'simplified',
                  profileName: standard.name,
                  baseLoadKw: standard.baseKw,
                  peakLoadKw: standard.peakKw,
                  annualConsumptionKwh: standard.annualKwh,
                  hourlyData: hourly
              }
          }));
      }
  };

  // Handler for Manual Changes to Load Inputs
  const handleLoadInputChange = (field: 'annual' | 'base' | 'peak', value: number) => {
      setProject(prev => {
          const newProfile = { ...prev.loadProfile };
          if (field === 'annual') newProfile.annualConsumptionKwh = value;
          if (field === 'base') newProfile.baseLoadKw = value;
          if (field === 'peak') newProfile.peakLoadKw = value;

          // If in simplified mode, regenerate the curve immediately to keep everything in sync
          if (newProfile.type === 'simplified') {
              newProfile.hourlyData = generateSyntheticLoadProfile(
                  newProfile.annualConsumptionKwh,
                  newProfile.baseLoadKw,
                  newProfile.peakLoadKw
              );
          }
          return { ...prev, loadProfile: newProfile };
      });
  };

  const handle8760Import = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (!text) return;

          const values = text.split(/[\n,;]+/).map(v => parseFloat(v.trim())).filter(n => !isNaN(n));

          if (values.length < 8760) {
              alert(`Erro: O ficheiro contém apenas ${values.length} valores. São necessários 8760 (1 por hora).`);
              return;
          }

          const hourlyData = values.slice(0, 8760);
          const totalConsumption = hourlyData.reduce((a,b) => a+b, 0);
          const maxLoad = Math.max(...hourlyData);
          const minLoad = Math.min(...hourlyData);

          setProject(prev => ({
              ...prev,
              loadProfile: {
                  ...prev.loadProfile,
                  type: 'imported',
                  profileName: `Importado (${file.name})`,
                  annualConsumptionKwh: Math.round(totalConsumption),
                  peakLoadKw: maxLoad,
                  baseLoadKw: minLoad,
                  hourlyData: hourlyData
              }
          }));
          alert("Dados horários importados com sucesso!");
      };
      reader.readAsText(file);
      if(e.target) e.target.value = '';
  };

  const handleEpwImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (!text) return;
          
          const epwData = parseEpw(text);
          if (epwData) {
              setProject(prev => ({
                  ...prev,
                  settings: { ...prev.settings, climateDataSource: 'epw', climateDescription: `Importado: ${file.name}` },
                  climateData: epwData
              }));
              alert("Dados climáticos EPW importados com sucesso!");
          } else {
              alert("Erro ao ler ficheiro EPW. Verifique o formato.");
          }
      };
      reader.readAsText(file);
      if(e.target) e.target.value = '';
  };

  const handleLoadExportCsv = () => {
     let data = project.loadProfile.hourlyData;
     
     if (!data || data.length !== 8760) {
        data = generateSyntheticLoadProfile(
            project.loadProfile.annualConsumptionKwh,
            project.loadProfile.baseLoadKw,
            project.loadProfile.peakLoadKw
        );
     }

     const csvContent = "Hora,Consumo(kW)\n" + data.map((v, i) => `${i},${v.toFixed(4)}`).join('\n');
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.href = url;
     link.setAttribute('download', 'consumo_8760h.csv');
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const exportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `k-pvprosim-${project.settings.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>, isComparison = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const obj = JSON.parse(event.target?.result as string);
        if (isComparison) {
           if (comparisonProjects.length >= 4) {
               alert("Máximo de 5 cenários (1 atual + 4 comparações).");
               return;
           }
           setComparisonProjects(prev => [...prev, obj]);
        } else {
           setProject(obj);
        }
      } catch (err) {
        alert("Ficheiro inválido");
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const suggestInverter = () => {
     const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
     const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
     const dcPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;

     const currentInv = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
     const prefBrand = currentInv?.manufacturer;

     const sameBrand = INVERTERS_DB.filter(i => i.manufacturer === prefBrand);
     const allInvs = sameBrand.length > 0 ? sameBrand : INVERTERS_DB;

     let best = allInvs.filter(i => i.maxPowerKw >= dcPowerKw * 0.8)
                         .sort((a,b) => a.maxPowerKw - b.maxPowerKw)[0];

     let quantity = 1;

     if (!best) {
         best = allInvs.sort((a,b) => b.maxPowerKw - a.maxPowerKw)[0];
         quantity = Math.ceil((dcPowerKw * 0.8) / best.maxPowerKw);
     }

     if (best) {
         setProject(p => ({
             ...p, 
             systemConfig: {
                 ...p.systemConfig, 
                 selectedInverterId: best.id,
                 inverterCount: quantity
             }
         }));
         alert(`Inversor recomendado: ${quantity}x ${best.manufacturer} ${best.model} (${best.maxPowerKw}kW)`);
     } else {
         alert("Não foi encontrado um inversor ideal na base de dados para esta potência.");
     }
  };

  const loadStats = useMemo(() => {
     let hourlyData = project.loadProfile.hourlyData;
     
     if (!hourlyData || hourlyData.length !== 8760) {
         // Fallback generation for stats if missing
         hourlyData = generateSyntheticLoadProfile(
             project.loadProfile.annualConsumptionKwh,
             project.loadProfile.baseLoadKw,
             project.loadProfile.peakLoadKw
         );
     }
     
     const total = hourlyData.reduce((a,b)=>a+b, 0);
     const max = Math.max(...hourlyData);
     const avgYear = total / 8760;
     
     let sunSum = 0;
     let sunCount = 0;
     hourlyData.forEach((val, idx) => {
         const h = idx % 24;
         if (h >= 9 && h <= 17) {
             sunSum += val;
             sunCount++;
         }
     });
     const avgSun = sunCount > 0 ? sunSum / sunCount : 0;

     return { total, max, avgYear, avgSun };
  }, [project.loadProfile]);


  // -- Renders --

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-xl p-8 text-white shadow-lg flex items-center justify-between">
        <div>
            <h2 className="text-3xl font-bold mb-2">Bem-vindo ao K-PVPROSIM</h2>
            <p className="opacity-90">Simulador Fotovoltaico Profissional</p>
            <div className="mt-4 flex gap-4 text-sm opacity-80">
                <span>Versão: {APP_VERSION}</span>
                <span>•</span>
                <span>{new Date().toLocaleDateString('pt-PT')}</span>
            </div>
        </div>
        <img src="logo.png" alt="K-PVPROSIM" className="h-24 w-auto hidden md:block drop-shadow-lg" onError={(e) => e.currentTarget.style.display = 'none'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('location')}>
          <div className="flex items-center gap-3 mb-2 text-blue-600"><MapPin /> <h3 className="font-bold text-gray-800">1. Localização</h3></div>
          <p className="text-sm text-gray-500">Selecione o concelho e gere dados climáticos.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('load')}>
          <div className="flex items-center gap-3 mb-2 text-blue-600"><BarChart3 /> <h3 className="font-bold text-gray-800">2. Consumo</h3></div>
          <p className="text-sm text-gray-500">Perfis de carga padrão e análise gráfica.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('system')}>
          <div className="flex items-center gap-3 mb-2 text-blue-600"><Sun /> <h3 className="font-bold text-gray-800">3. Equipamento</h3></div>
          <p className="text-sm text-gray-500">Selecione Inversores, Baterias e Cablagem.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('roof')}>
          <div className="flex items-center gap-3 mb-2 text-blue-600"><Layout /> <h3 className="font-bold text-gray-800">4. Cobertura</h3></div>
          <p className="text-sm text-gray-500">Desenhe áreas, margens e layout de painéis.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('electrical')}>
          <div className="flex items-center gap-3 mb-2 text-blue-600"><Cpu /> <h3 className="font-bold text-gray-800">5. Elétrico</h3></div>
          <p className="text-sm text-gray-500">Verificação de strings e esquema unifilar.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={handleRunSimulation}>
          <div className="flex items-center gap-3 mb-2 text-green-600"><FileText /> <h3 className="font-bold text-gray-800">6. Simulação</h3></div>
          <p className="text-sm text-gray-500">Executar cálculo 8760h.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Coins className="text-yellow-600"/> Configuração Financeira (ROI)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Custo Eletricidade (€/kWh)</label>
                  <input 
                    type="number" step="0.01" 
                    className="w-full border p-2 rounded"
                    value={project.financialSettings.electricityPriceEurKwh}
                    onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, electricityPriceEurKwh: parseFloat(e.target.value)}})}
                  />
                  <p className="text-xs text-gray-400 mt-1">Preço médio de compra da rede.</p>
              </div>
              <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Venda de Excedente (€/kWh)</label>
                  <input 
                    type="number" step="0.01" 
                    className="w-full border p-2 rounded"
                    value={project.financialSettings.gridExportPriceEurKwh}
                    onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, gridExportPriceEurKwh: parseFloat(e.target.value)}})}
                  />
                  <p className="text-xs text-gray-400 mt-1">Preço venda à rede (Feed-in).</p>
              </div>
              <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Inflação Energética Anual (%)</label>
                  <input 
                    type="number" step="0.1" 
                    className="w-full border p-2 rounded"
                    value={project.financialSettings.inflationRate}
                    onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, inflationRate: parseFloat(e.target.value)}})}
                  />
                  <p className="text-xs text-gray-400 mt-1">Estimativa de aumento de preços.</p>
              </div>
          </div>
      </div>
    </div>
  );

  const renderLocation = () => (
    <div className="space-y-6 h-full pb-10">
        
        <div className="bg-white p-6 rounded-lg shadow space-y-4 border-l-4 border-blue-600">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><MapPin className="text-blue-600"/> Definição do Projeto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Nome do Projeto</label>
                    <input className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-200 outline-none" 
                           value={project.settings.name} 
                           onChange={e => setProject({...project, settings: {...project.settings, name: e.target.value}})} />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Nome Cliente</label>
                    <input className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-200 outline-none" 
                           value={project.settings.clientName} 
                           onChange={e => setProject({...project, settings: {...project.settings, clientName: e.target.value}})} />
                </div>
            </div>

            <div className="space-y-2 pt-2">
                <label className="block text-sm font-bold text-gray-700">Localização (Concelho)</label>
                <select 
                    className="w-full border rounded p-3 bg-gray-50 font-medium text-gray-800 focus:ring-2 focus:ring-blue-200 outline-none"
                    value={project.settings.address} 
                    onChange={handleCityChange}
                >
                    <option value="" disabled>Selecione um concelho...</option>
                    {PORTUGAL_MUNICIPALITIES.map(city => (
                        <option key={city.name} value={city.name}>{city.name}</option>
                    ))}
                </select>
                <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">
                        Selecionar o concelho gera automaticamente dados climáticos padrão.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={() => epwImportInputRef.current?.click()} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <Upload size={12}/> Importar EPW
                        </button>
                        <input ref={epwImportInputRef} type="file" className="hidden" accept=".epw" onChange={handleEpwImport} />
                    </div>
                </div>
            </div>

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Info size={16} className="text-blue-500" />
                    Como obter ficheiros climáticos EPW?
                </h4>
                <p className="text-xs text-slate-600 mb-3">
                    Pode encontrar ficheiros climáticos EPW de todo o mundo no site <strong>Ladybug Tools EPWMap</strong>.
                </p>
                <a href="https://www.ladybug.tools/epwmap/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded hover:bg-blue-200 transition mb-3 font-medium">
                    <ExternalLink size={12} /> Abrir Ladybug Tools EPWMap
                </a>
                <ol className="text-xs text-slate-600 list-decimal pl-4 space-y-1">
                    <li>No mapa, clique na localização desejada.</li>
                    <li>Clique no link de download (normalmente terminando em <strong>.epw</strong>) para guardar no computador.</li>
                    <li>Volte a esta página e clique em <strong>"Importar EPW"</strong> acima para carregar o ficheiro.</li>
                </ol>
            </div>

            <div className="flex gap-4 text-sm text-gray-600 bg-slate-50 p-3 rounded border border-slate-200 mt-2">
                <p><strong>Latitude:</strong> {project.settings.latitude.toFixed(4)}</p>
                <p><strong>Longitude:</strong> {project.settings.longitude.toFixed(4)}</p>
                <p><strong>Fonte:</strong> {project.settings.climateDataSource === 'epw' ? 'Ficheiro EPW' : 'Sintético (Concelho)'}</p>
            </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
             <div className="mb-4">
                 <h3 className="text-xl font-bold text-gray-800">Dados Climáticos (8760h)</h3>
                 <p className="text-sm text-gray-500">
                     {project.settings.climateDescription}
                 </p>
             </div>
             <ClimateCharts data={project.climateData} lat={project.settings.latitude} />
        </div>
    </div>
  );

  const renderSystem = () => {
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    
    const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
    const dcPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;
    const invCount = project.systemConfig.inverterCount || 1;
    const acPowerKw = (inverter?.maxPowerKw || 0) * invCount;
    const ratio = dcPowerKw / (acPowerKw || 1);
    const isUndersized = ratio > 1.3;
    const isOversized = ratio < 0.7;

    return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start">
         <h3 className="text-xl font-bold text-gray-800">Equipamento e Configuração</h3>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex flex-col md:flex-row gap-6 items-center">
          <div className="flex items-center gap-2 text-blue-800 font-bold border-r border-blue-200 pr-6 w-full md:w-auto">
              <BarChart3 size={24} />
              <span>Resumo de Consumo <br/><span className="text-xs font-normal">Para Dimensionamento</span></span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
              <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase font-bold">Consumo Anual</p>
                  <p className="font-bold text-lg">{Math.round(loadStats.total)} kWh</p>
              </div>
              <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase font-bold">Carga Máx (Pico)</p>
                  <p className="font-bold text-lg">{loadStats.max.toFixed(2)} kW</p>
              </div>
              <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase font-bold">Média Anual</p>
                  <p className="font-bold text-lg">{loadStats.avgYear.toFixed(2)} kW</p>
              </div>
              <div className="text-center bg-white rounded border p-1 shadow-sm">
                  <p className="text-xs text-orange-600 uppercase font-bold">Média Horas Sol</p>
                  <p className="font-bold text-lg text-orange-700">{loadStats.avgSun.toFixed(2)} kW</p>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded shadow">
           <h4 className="font-bold mb-3 flex items-center gap-2"><Sun className="w-4 h-4"/> Painéis Solares</h4>
           <select 
             className="w-full border p-2 rounded mb-4"
             value={project.systemConfig.selectedPanelId}
             onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedPanelId: e.target.value}})}
           >
              {PANELS_DB.map(p => <option key={p.id} value={p.id}>{p.manufacturer} {p.model} ({p.powerW}W)</option>)}
           </select>
           <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              <p>Potência: {panel?.powerW} W</p>
              <p>Eficiência: {(panel?.efficiency || 0) * 100}%</p>
              <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase">Potência Instalada (DC)</p>
                  <p className="font-bold text-blue-800">{dcPowerKw.toFixed(2)} kWp</p>
                  <p className="text-xs text-gray-500">({totalPanels} painéis)</p>
              </div>
           </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
           <h4 className="font-bold mb-3 flex items-center gap-2"><BatteryCharging className="w-4 h-4"/> Inversor</h4>
           <div className="flex gap-2 mb-2">
                <select 
                    className="w-full border p-2 rounded"
                    value={project.systemConfig.selectedInverterId}
                    onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedInverterId: e.target.value}})}
                >
                    {INVERTERS_DB.map(i => <option key={i.id} value={i.id}>{i.manufacturer} {i.model} ({i.maxPowerKw}kW)</option>)}
                </select>
                <input 
                    type="number" min="1" max="50" 
                    className="w-16 border rounded p-2 text-center" 
                    value={project.systemConfig.inverterCount || 1}
                    onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, inverterCount: Math.max(1, parseInt(e.target.value))}})}
                    title="Quantidade de Inversores"
                />
           </div>

           <button onClick={suggestInverter} className="text-xs text-blue-600 hover:underline mb-4 w-full text-left flex items-center gap-1">
               <Zap size={12}/> Recomendar Inversor Adequado
           </button>
           
           <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
               <p>Potência Máx Unit.: {inverter?.maxPowerKw} kW</p>
               <p>Fases: {inverter?.phases}</p>
               <p><strong>Total AC: {(inverter?.maxPowerKw || 0) * (project.systemConfig.inverterCount || 1)} kW</strong></p>
               <div className="mt-2 pt-2 border-t border-gray-200">
                   <p className="text-xs font-bold text-gray-500 uppercase">Rácio DC/AC Total</p>
                   <p className={`font-bold ${isUndersized || isOversized ? 'text-red-500' : 'text-green-600'}`}>{ratio.toFixed(2)}</p>
                   {isUndersized && <p className="text-xs text-red-500">Sistema subdimensionado!</p>}
                   {isOversized && <p className="text-xs text-orange-500">Sistema sobredimensionado.</p>}
               </div>
           </div>
           
           {inverter && (
               <div className="mt-3 text-xs bg-slate-100 p-2 rounded border border-slate-200">
                   <p><strong>MPPTs:</strong> {inverter.numMppts}</p>
                   <p><strong>Range MPPT:</strong> {inverter.mpptRange[0]}-{inverter.mpptRange[1]} V</p>
                   <p><strong>Max Tensão DC:</strong> {inverter.maxDcVoltage} V</p>
                   <p><strong>Max Corrente:</strong> {inverter.maxInputCurrent} A</p>
               </div>
           )}
        </div>

        <div className="bg-white p-4 rounded shadow">
           <h4 className="font-bold mb-3 flex items-center gap-2"><BatteryCharging className="w-4 h-4"/> Bateria</h4>
           <div className="flex gap-2 mb-4">
               <select 
                className="w-full border p-2 rounded"
                value={project.systemConfig.selectedBatteryId || ''}
                onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedBatteryId: e.target.value || null}})}
                >
                <option value="">Sem Bateria</option>
                {BATTERIES_DB.map(b => <option key={b.id} value={b.id}>{b.manufacturer} {b.model} ({b.capacityKwh}kWh)</option>)}
               </select>
               {project.systemConfig.selectedBatteryId && (
                   <input 
                    type="number" min="1" max="10" 
                    className="w-16 border rounded p-2" 
                    value={project.systemConfig.batteryCount || 1}
                    onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, batteryCount: parseInt(e.target.value)}})}
                   />
               )}
           </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-bold mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> Cablagem e Distâncias</h4>
        <div className="grid grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium mb-1">Distância DC (Telhado-Inversor)</label>
                <div className="flex items-center gap-2">
                    <input type="number" className="border p-2 rounded w-full" 
                        value={project.systemConfig.cableDcMeters || 15}
                        onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, cableDcMeters: parseFloat(e.target.value)}})}
                    />
                    <span className="text-gray-500 text-sm">metros</span>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Distância AC (Inversor-Q.Geral)</label>
                <div className="flex items-center gap-2">
                    <input type="number" className="border p-2 rounded w-full" 
                        value={project.systemConfig.cableAcMeters || 10}
                        onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, cableAcMeters: parseFloat(e.target.value)}})}
                    />
                    <span className="text-gray-500 text-sm">metros</span>
                </div>
            </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg shadow-inner">
          <div className="flex justify-between items-center mb-6">
              <div>
                  <h4 className="text-xl font-bold text-blue-900">Estratégias de Otimização</h4>
                  <p className="text-sm text-blue-700">Cenários baseados no <strong>painel e bateria selecionados</strong> acima.</p>
              </div>
              <button 
                  onClick={handleGenerateScenarios} 
                  disabled={isGeneratingScenarios}
                  className="bg-blue-600 text-white px-6 py-3 rounded shadow hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                  <RefreshCw className={isGeneratingScenarios ? "animate-spin" : ""} /> 
                  {isGeneratingScenarios ? 'A Gerar...' : 'Gerar 4 Cenários'}
              </button>
          </div>

          {scenarios.length > 0 && (
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                 {scenarios.map(s => (
                     <div key={s.id} className="bg-white p-4 rounded border hover:shadow-lg transition flex flex-col">
                         <div className="border-b pb-2 mb-2">
                             <h5 className="font-bold text-lg text-gray-800">{s.label}</h5>
                             <p className="text-xs text-gray-500 h-8">{s.description}</p>
                         </div>
                         
                         <div className="space-y-2 text-sm flex-1">
                             <div className="flex justify-between">
                                 <span>Potência:</span>
                                 <span className="font-bold">{s.stats.powerKw} kWp</span>
                             </div>
                             <div className="flex justify-between">
                                 <span>Painéis:</span>
                                 <span className="font-bold">{s.stats.panels} un</span>
                             </div>
                             <div className="flex justify-between">
                                 <span>Inversor:</span>
                                 <span className="font-bold text-xs">{s.stats.inverterCount}x {s.stats.inverter}</span>
                             </div>
                             <div className="flex justify-between">
                                 <span>Baterias:</span>
                                 <span className="font-bold">{s.stats.batteries} un</span>
                             </div>
                             <div className="border-t pt-2 mt-2">
                                <div className="flex justify-between text-green-700">
                                    <span>Produção:</span>
                                    <span className="font-bold">{Math.round(s.simulation.totalProductionKwh)} kWh</span>
                                </div>
                                <div className="flex justify-between text-blue-700">
                                    <span>Autoconsumo:</span>
                                    <span className="font-bold">{Math.round(s.simulation.totalProductionKwh - s.simulation.totalExportKwh)} kWh ({(s.simulation.selfConsumptionRatio * 100).toFixed(0)}%)</span>
                                </div>
                                <div className="flex justify-between text-orange-700">
                                    <span>Injeção:</span>
                                    <span className="font-bold">{Math.round(s.simulation.totalExportKwh)} kWh</span>
                                </div>
                             </div>
                         </div>

                         <button 
                             onClick={() => applyScenario(s)}
                             className="mt-4 w-full py-2 bg-gray-800 text-white rounded hover:bg-black text-sm uppercase font-bold tracking-wide"
                         >
                             Aplicar
                         </button>
                     </div>
                 ))}
             </div>
          )}
      </div>
    </div>
  )};

  const renderBudget = () => {
      const budgetItems = calculateDetailedBudget(project);
      
      const subtotal = budgetItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const ivaRate = 0.06;
      const total = subtotal * (1 + ivaRate);
      const financials = calculateFinancials(project);

      const categories = ['Modules', 'Inverter', 'Battery', 'Structure', 'Electrical', 'Labor', 'Services'];

      return (
          <div className="bg-white p-8 rounded shadow max-w-5xl mx-auto print:shadow-none print:w-full print:max-w-none">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-blue-900">Orçamento Detalhado</h1>
                    <p className="text-gray-500 text-sm">Solicitação de Cotação (RFQ)</p>
                  </div>
                  <div className="text-right">
                      <p className="font-bold text-lg">{project.settings.clientName}</p>
                      <p className="text-gray-500">{project.settings.address}</p>
                      <p className="text-sm text-gray-400 mt-1">Data: {new Date().toLocaleDateString()}</p>
                  </div>
              </div>

              <div className="mb-8">
                  <div className="grid grid-cols-4 gap-4 text-sm bg-gray-50 p-4 rounded border">
                      <div>
                          <p className="text-xs text-gray-500 font-bold uppercase">Potência Instalada</p>
                          <p className="font-bold text-lg">{(project.roofSegments.reduce((a,b) => a + (b.panelsCount * (PANELS_DB.find(p=>p.id===project.systemConfig.selectedPanelId)?.powerW||0)),0)/1000).toFixed(2)} kWp</p>
                      </div>
                      <div>
                          <p className="text-xs text-gray-500 font-bold uppercase">Armazenamento</p>
                          <p className="font-bold text-lg">{project.systemConfig.selectedBatteryId ? (BATTERIES_DB.find(b=>b.id===project.systemConfig.selectedBatteryId)?.capacityKwh || 0) * (project.systemConfig.batteryCount || 1) + ' kWh' : '0 kWh'}</p>
                      </div>
                      <div>
                          <p className="text-xs text-gray-500 font-bold uppercase">Inversor</p>
                          <p className="font-bold">{project.systemConfig.inverterCount || 1}x {INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId)?.model}</p>
                      </div>
                      <div>
                          <p className="text-xs text-gray-500 font-bold uppercase">Módulos</p>
                          <p className="font-bold">{project.roofSegments.reduce((a,b)=>a+b.panelsCount,0)}x {PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId)?.model}</p>
                      </div>
                  </div>
              </div>

              <div className="mb-8 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                      <thead>
                          <tr className="bg-gray-100 text-gray-700 border-b-2 border-gray-300">
                              <th className="py-3 px-4 text-left">Descrição / Rubrica</th>
                              <th className="py-3 px-4 text-center">Unid.</th>
                              <th className="py-3 px-4 text-center">Qtd.</th>
                              <th className="py-3 px-4 text-right">Preço Unit.</th>
                              <th className="py-3 px-4 text-right">Total (s/ IVA)</th>
                          </tr>
                      </thead>
                      <tbody>
                          {categories.map(cat => {
                              const catItems = budgetItems.filter(i => i.category === cat);
                              if (catItems.length === 0) return null;
                              return (
                                  <React.Fragment key={cat}>
                                      <tr className="bg-gray-50">
                                          <td colSpan={5} className="py-2 px-4 font-bold text-blue-800 uppercase text-xs tracking-wider border-b">{cat}</td>
                                      </tr>
                                      {catItems.map((item, idx) => (
                                          <tr key={idx} className="border-b hover:bg-gray-50">
                                              <td className="py-2 px-4">{item.description}</td>
                                              <td className="py-2 px-4 text-center text-gray-500">{item.unit}</td>
                                              <td className="py-2 px-4 text-center font-medium">{item.quantity}</td>
                                              <td className="py-2 px-4 text-right">{item.unitPrice.toLocaleString('pt-PT', {minimumFractionDigits: 2})} €</td>
                                              <td className="py-2 px-4 text-right font-medium">{item.totalPrice.toLocaleString('pt-PT', {minimumFractionDigits: 2})} €</td>
                                          </tr>
                                      ))}
                                  </React.Fragment>
                              )
                          })}
                      </tbody>
                      <tfoot>
                          <tr>
                              <td colSpan={3}></td>
                              <td className="py-4 px-4 text-right font-bold text-gray-600">Subtotal</td>
                              <td className="py-4 px-4 text-right font-bold text-lg">{subtotal.toLocaleString('pt-PT', {style: 'currency', currency: 'EUR'})}</td>
                          </tr>
                          <tr>
                              <td colSpan={3}></td>
                              <td className="py-2 px-4 text-right font-bold text-gray-600">IVA (6%)</td>
                              <td className="py-2 px-4 text-right font-bold text-gray-800">{(subtotal * 0.06).toLocaleString('pt-PT', {style: 'currency', currency: 'EUR'})}</td>
                          </tr>
                          <tr className="bg-blue-50 border-t-2 border-blue-200">
                              <td colSpan={3}></td>
                              <td className="py-4 px-4 text-right font-bold text-blue-900 text-lg">TOTAL GERAL</td>
                              <td className="py-4 px-4 text-right font-bold text-blue-900 text-2xl">{total.toLocaleString('pt-PT', {style: 'currency', currency: 'EUR'})}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
              
              {project.simulationResult && (
                  <div className="mt-8 bg-green-50 border border-green-200 p-6 rounded-lg break-inside-avoid">
                      <h3 className="text-xl font-bold text-green-900 mb-4 flex items-center gap-2"><TrendingUp/> Análise de Retorno (ROI)</h3>
                      <div className="grid grid-cols-3 gap-6 text-center">
                          <div>
                              <p className="text-xs text-green-700 uppercase font-bold">Payback Estimado</p>
                              <p className="text-3xl font-bold text-green-800">{financials.paybackPeriodYears.toFixed(1)} Anos</p>
                          </div>
                          <div>
                              <p className="text-xs text-green-700 uppercase font-bold">Poupança Acumulada (15 anos)</p>
                              <p className="text-3xl font-bold text-green-800">{financials.totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</p>
                          </div>
                          <div>
                              <p className="text-xs text-green-700 uppercase font-bold">Retorno do Investimento</p>
                              <p className="text-3xl font-bold text-green-800">{financials.roiPercent.toFixed(1)}%</p>
                          </div>
                      </div>
                      <p className="text-xs text-green-600 text-center mt-4">Considerando inflação de {project.financialSettings.inflationRate}% ao ano e degradação dos painéis.</p>
                  </div>
              )}

              <div className="flex justify-end no-print mt-6 gap-2">
                  <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 flex items-center gap-2"><FileText size={18} /> Imprimir</button>
              </div>
          </div>
      );
  };

  const renderComparison = () => {
    const getMetrics = (p: ProjectState) => {
        const panel = PANELS_DB.find(x => x.id === p.systemConfig.selectedPanelId);
        const inv = INVERTERS_DB.find(x => x.id === p.systemConfig.selectedInverterId);
        const bat = BATTERIES_DB.find(x => x.id === p.systemConfig.selectedBatteryId);
        const panelCount = p.roofSegments.reduce((a, b) => a + b.panelsCount, 0);
        const powerKw = (panelCount * (panel?.powerW || 0)) / 1000;
        const sim = p.simulationResult;
        const budget = calculateDetailedBudget(p).reduce((sum, i) => sum + i.totalPrice, 0) * 1.06;

        return {
            name: p.settings.name,
            powerKw,
            panelCount,
            inverter: `${p.systemConfig.inverterCount||1}x ${inv?.model || '-'}`,
            battery: bat ? `${bat.capacityKwh * (p.systemConfig.batteryCount || 1)} kWh` : '0 kWh',
            production: sim?.totalProductionKwh || 0,
            selfConsumption: sim ? (sim.totalProductionKwh - sim.totalExportKwh) : 0,
            injection: sim?.totalExportKwh || 0,
            autonomy: sim ? sim.autonomyRatio * 100 : 0,
            investment: budget
        };
    };

    const currentMetrics = getMetrics(project);
    const comparisonMetrics = comparisonProjects.map(getMetrics);
    
    const allScenarios = [currentMetrics, ...comparisonMetrics];

    const chartData = allScenarios.map((m, i) => ({
        name: i === 0 ? 'Atual' : `Cenário ${i}`,
        Produção: Math.round(m.production),
        Autoconsumo: Math.round(m.selfConsumption),
        Injeção: Math.round(m.injection)
    }));

    return (
        <div className="space-y-6 print:p-8 print:bg-white">
            <style>{`
            @media print {
                @page { margin: 1cm; size: A4 landscape; }
                body { background: white; }
                .no-print { display: none !important; }
            }
            `}</style>

            <div className="flex justify-between items-center no-print">
                <h3 className="text-xl font-bold flex items-center gap-2"><Copy className="text-blue-600"/> Comparativo Multi-Cenário</h3>
                <div className="flex gap-2">
                    <button onClick={() => compareInputRef.current?.click()} className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 flex items-center gap-2 text-sm">
                        <PlusCircle size={16}/> Adicionar Cenário
                    </button>
                    <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-black"><Printer size={16}/> Imprimir</button>
                    <button onClick={() => setComparisonProjects([])} className="text-red-500 text-sm border px-3 rounded hover:bg-red-50 flex items-center gap-1"><Trash2 size={14}/> Limpar</button>
                </div>
                <input ref={compareInputRef} type="file" accept=".json" onChange={(e) => importJson(e, true)} className="hidden" />
            </div>

            {comparisonProjects.length === 0 && (
                 <div className="bg-blue-50 p-4 rounded text-blue-800 text-sm mb-4 border border-blue-200">
                     Adicione até 4 ficheiros JSON de outros projetos para comparar com o atual.
                 </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse bg-white shadow rounded">
                    <thead>
                        <tr className="bg-slate-800 text-white">
                            <th className="p-3 text-left">Indicador</th>
                            <th className="p-3 text-center bg-blue-600 min-w-[150px]">Atual<br/><span className="text-[10px] font-normal">{currentMetrics.name}</span></th>
                            {comparisonMetrics.map((m, i) => (
                                <th key={i} className="p-3 text-center border-l border-slate-600 min-w-[150px]">
                                    Cenário {i+1}<br/><span className="text-[10px] font-normal">{m.name}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">Potência Instalada</td>
                            <td className="p-3 text-center font-bold text-lg">{currentMetrics.powerKw.toFixed(2)} kWp</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center font-bold text-lg border-l">{m.powerKw.toFixed(2)} kWp</td>)}
                        </tr>
                        <tr className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">Investimento Estimado</td>
                            <td className="p-3 text-center font-bold text-green-700">{currentMetrics.investment.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center font-bold text-green-700 border-l">{m.investment.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</td>)}
                        </tr>
                        <tr className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">Produção Anual</td>
                            <td className="p-3 text-center">{Math.round(currentMetrics.production).toLocaleString()} kWh</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center border-l">{Math.round(m.production).toLocaleString()} kWh</td>)}
                        </tr>
                        <tr className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">Autoconsumo</td>
                            <td className="p-3 text-center text-blue-600 font-bold">{Math.round(currentMetrics.selfConsumption).toLocaleString()} kWh</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center text-blue-600 font-bold border-l">{Math.round(m.selfConsumption).toLocaleString()} kWh</td>)}
                        </tr>
                        <tr className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">Autonomia Energética</td>
                            <td className="p-3 text-center font-bold">{currentMetrics.autonomy.toFixed(1)} %</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center font-bold border-l">{m.autonomy.toFixed(1)} %</td>)}
                        </tr>
                        <tr className="bg-gray-50">
                            <td className="p-3 font-medium text-gray-600 text-xs uppercase">Configuração</td>
                            <td colSpan={1 + comparisonMetrics.length}></td>
                        </tr>
                        <tr>
                            <td className="p-3 font-medium text-gray-600">Painéis</td>
                            <td className="p-3 text-center text-xs">{currentMetrics.panelCount} un</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center text-xs border-l">{m.panelCount} un</td>)}
                        </tr>
                        <tr>
                            <td className="p-3 font-medium text-gray-600">Inversor</td>
                            <td className="p-3 text-center text-xs">{currentMetrics.inverter}</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center text-xs border-l">{m.inverter}</td>)}
                        </tr>
                        <tr>
                            <td className="p-3 font-medium text-gray-600">Baterias</td>
                            <td className="p-3 text-center text-xs">{currentMetrics.battery}</td>
                            {comparisonMetrics.map((m, i) => <td key={i} className="p-3 text-center text-xs border-l">{m.battery}</td>)}
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="bg-white p-4 rounded shadow border h-96">
                <h5 className="font-bold text-gray-700 mb-4 text-center">Comparação de Desempenho (kWh)</h5>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="Produção" fill="#eab308" />
                        <Bar dataKey="Autoconsumo" fill="#3b82f6" />
                        <Bar dataKey="Injeção" fill="#22c55e" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
  };

  const renderResults = () => {
    const sim = project.simulationResult;
    // Calculate Injection Percentage if simulation exists
    const injectionPct = sim && sim.totalProductionKwh > 0 
        ? (sim.totalExportKwh / sim.totalProductionKwh) * 100 
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Resultados da Simulação</h3>
                <div className="flex gap-2">
                    <button 
                        onClick={handleAnalyze} 
                        disabled={!sim}
                        className="bg-yellow-500 text-white px-4 py-2 rounded shadow hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2 font-bold"
                    >
                        <Lightbulb size={18} /> Ajuda / Otimizar
                    </button>
                    <button onClick={handleRunSimulation} disabled={isSimulating} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                        {isSimulating ? 'A calcular...' : 'Recalcular'}
                        {isDirty && !isSimulating && <AlertTriangle size={18} className="text-yellow-300" />}
                    </button>
                </div>
            </div>
            
            {isDirty && !isSimulating && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-yellow-800 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Dados alterados! Os resultados apresentados podem não corresponder à configuração atual. Por favor, recalcule.
                </div>
            )}
            
            {/* Optimization Suggestions Panel */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-yellow-200 animate-in fade-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Lightbulb className="text-yellow-500" /> Assistente de Otimização
                        </h4>
                        <button onClick={() => setShowSuggestions(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <div className="space-y-3">
                        {suggestions.map((s, i) => (
                            <div key={i} className={`p-4 rounded-lg border flex gap-3 ${
                                s.type === 'warning' ? 'bg-red-50 border-red-200 text-red-900' :
                                s.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' :
                                'bg-blue-50 border-blue-200 text-blue-900'
                            }`}>
                                <div className="mt-1">
                                    {s.type === 'warning' ? <AlertTriangle size={20}/> : 
                                     s.type === 'success' ? <CheckCircle size={20}/> : <Info size={20}/>}
                                </div>
                                <div>
                                    <p className="font-bold">{s.title}</p>
                                    <p className="text-sm opacity-90">{s.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {project.simulationResult ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KPICard label="Produção Total" value={`${Math.round(project.simulationResult.totalProductionKwh)} kWh`} color="text-yellow-600" />
                        <KPICard label="Autoconsumo" value={`${(project.simulationResult.selfConsumptionRatio * 100).toFixed(1)}%`} color="text-blue-600" />
                        <KPICard label="Injeção na Rede" value={`${Math.round(project.simulationResult.totalExportKwh)} kWh (${injectionPct.toFixed(1)}%)`} color="text-green-600" />
                        <KPICard label="Autossuficiência" value={`${(project.simulationResult.autonomyRatio * 100).toFixed(1)}%`} color="text-purple-600" />
                    </div>
                    <div className="bg-white p-4 rounded shadow border border-gray-100 flex justify-between items-center px-8">
                         <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Retorno Estimado</p>
                            <p className="text-2xl font-bold text-gray-800">{calculateFinancials(project).paybackPeriodYears.toFixed(1)} Anos</p>
                         </div>
                         <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Poupança 15 Anos</p>
                            <p className="text-2xl font-bold text-green-700">{calculateFinancials(project).totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency',currency:'EUR', maximumFractionDigits:0})}</p>
                         </div>
                         <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">ROI</p>
                            <p className="text-2xl font-bold text-blue-700">{calculateFinancials(project).roiPercent.toFixed(1)} %</p>
                         </div>
                    </div>
                    <SimulationCharts result={project.simulationResult} />
                </>
            ) : (
                <div className="text-center py-20 bg-gray-50 rounded border border-dashed border-gray-300">
                    <p className="text-gray-500">Execute a simulação para visualizar os dados.</p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shadow-xl print:hidden">
        <div className="p-6 border-b border-slate-700 flex flex-col items-center text-center">
          <img src="logo.png" alt="K-PVPROSIM" className="h-16 w-auto mb-3 object-contain" onError={(e) => {e.currentTarget.style.display = 'none'}} />
          <h1 className="text-xl font-bold tracking-wider text-blue-400">K-PVPROSIM</h1>
          <p className="text-xs text-slate-400 mt-1">Professional Simulator</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Início" />
          <NavButton active={activeTab === 'location'} onClick={() => setActiveTab('location')} icon={<MapPin size={20} />} label="1. Localização" />
          <NavButton active={activeTab === 'load'} onClick={() => setActiveTab('load')} icon={<BarChart3 size={20} />} label="2. Consumo" />
          <NavButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={<Settings size={20} />} label="3. Equipamento" />
          <NavButton active={activeTab === 'roof'} onClick={() => setActiveTab('roof')} icon={<Layout size={20} />} label="4. Cobertura" />
          <NavButton active={activeTab === 'electrical'} onClick={() => setActiveTab('electrical')} icon={<Cpu size={20} />} label="5. Elétrico" />
          <NavButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={<FileText size={20} />} label="6. Simulação" warning={isDirty} />
          <NavButton active={activeTab === 'monitor'} onClick={() => setActiveTab('monitor')} icon={<Tv size={20} />} label="7. Monitorização" />
          <NavButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={<Calculator size={20} />} label="Orçamento" />
          <NavButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<Printer size={20} />} label="Relatório" />
          <NavButton active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} icon={<Copy size={20} />} label="Comparar" />
        </nav>

        <div className="p-4 border-t border-slate-700 space-y-2">
            <button onClick={exportJson} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white w-full p-2 rounded hover:bg-slate-800 transition">
                <Download size={14} /> Exportar Projeto
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white w-full p-2 rounded hover:bg-slate-800 transition">
                <Upload size={14} /> Importar JSON
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".json" onChange={(e) => importJson(e)} />
        </div>

        <div className="p-4 text-xs text-center text-slate-500 bg-slate-950">
           <p>{AUTHOR_NAME}</p>
           <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="hover:text-blue-400 transition">www.koelho2000.com</a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8 relative print:p-0 print:overflow-visible">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'location' && renderLocation()}
        
        {activeTab === 'load' && (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="bg-white p-6 rounded shadow border">
                <h3 className="text-xl font-bold mb-6">Configuração de Consumo</h3>
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
                    <label className="block text-sm font-bold text-blue-900 mb-2">Perfis Padrão (Tipos de Edifício)</label>
                    <select 
                        className="w-full p-2 border rounded"
                        onChange={(e) => updateLoadProfile(e.target.value)}
                        value="" 
                    >
                        <option value="" disabled>Selecione um perfil para carregar dados automaticamente...</option>
                        {STANDARD_LOAD_PROFILES.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.annualKwh} kWh/ano)</option>
                        ))}
                    </select>
                </div>
                
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded">
                    <label className="block text-sm font-bold text-green-900 mb-2 flex items-center gap-2">
                        <FileSpreadsheet size={16}/> Gestão de Dados Horários (8760h)
                    </label>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <p className="text-xs text-gray-600 mb-2">Importar ficheiro TXT/CSV (coluna única de valores).</p>
                            <button 
                                onClick={() => loadImportInputRef.current?.click()}
                                className="w-full bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 text-sm flex justify-center items-center gap-2"
                            >
                                <Upload size={14}/> Carregar CSV
                            </button>
                            <input ref={loadImportInputRef} type="file" className="hidden" accept=".csv,.txt" onChange={handle8760Import} />
                        </div>
                        <div className="flex-1 border-l pl-4 border-green-200">
                             <p className="text-xs text-gray-600 mb-2">Exportar o perfil de carga atual.</p>
                             <button 
                                onClick={handleLoadExportCsv}
                                className="w-full bg-white border border-green-600 text-green-600 px-4 py-2 rounded shadow hover:bg-green-50 text-sm flex justify-center items-center gap-2"
                            >
                                <Download size={14}/> Exportar CSV
                            </button>
                        </div>
                    </div>
                    {project.loadProfile.type === 'imported' && (
                        <p className="mt-2 text-sm text-green-700 font-bold">✓ Dados importados: {project.loadProfile.hourlyData?.length} registos.</p>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium mb-1">Consumo Anual (kWh)</label>
                        <input 
                            type="number" className="w-full border p-2 rounded" 
                            value={project.loadProfile.annualConsumptionKwh} 
                            onChange={(e) => handleLoadInputChange('annual', parseFloat(e.target.value))} 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Carga Base (kW)</label>
                        <input 
                            type="number" className="w-full border p-2 rounded" 
                            value={project.loadProfile.baseLoadKw} 
                            onChange={(e) => handleLoadInputChange('base', parseFloat(e.target.value))} 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Carga de Pico (kW)</label>
                        <input 
                            type="number" className="w-full border p-2 rounded" 
                            value={project.loadProfile.peakLoadKw} 
                            onChange={(e) => handleLoadInputChange('peak', parseFloat(e.target.value))} 
                        />
                    </div>
                </div>
             </div>
             <LoadCharts loadProfile={project.loadProfile} />
          </div>
        )}

        {activeTab === 'roof' && (
             <div className="h-full">
                <div className="flex justify-between items-end mb-4">
                  <h3 className="text-xl font-bold">Design da Cobertura</h3>
                  <p className="text-sm text-gray-500">Equipamento selecionado: {PANELS_DB.find(p=>p.id===project.systemConfig.selectedPanelId)?.model}</p>
                </div>
                <RoofDesigner 
                    roofSegments={project.roofSegments} 
                    onChange={(segs) => setProject({...project, roofSegments: segs})} 
                    selectedPanelId={project.systemConfig.selectedPanelId}
                    latitude={project.settings.latitude}
                />
             </div>
        )}

        {activeTab === 'electrical' && (
            <div className="space-y-6">
                <h3 className="text-xl font-bold">Esquema Elétrico e Strings</h3>
                <ElectricalScheme project={project} onUpdateProject={setProject} />
            </div>
        )}

        {activeTab === 'system' && renderSystem()}

        {activeTab === 'results' && renderResults()}

        {activeTab === 'budget' && renderBudget()}
        {activeTab === 'report' && <ReportView project={project} />}
        {activeTab === 'compare' && renderComparison()}
        {activeTab === 'monitor' && <MonitoringPlayer project={project} />}

      </main>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label, warning }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded transition-colors text-left relative ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
  >
    {icon}
    <span className="font-medium">{label}</span>
    {warning && <span className="absolute right-2 top-3 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>}
  </button>
);

const KPICard = ({ label, value, color }: any) => (
  <div className="bg-white p-4 rounded shadow border border-gray-100">
     <p className="text-xs text-gray-500 uppercase font-bold">{label}</p>
     <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
  </div>
);
