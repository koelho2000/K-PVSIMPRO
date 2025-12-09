

// ... imports ...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProjectState, ProjectSettings, LoadProfile, RoofSegment, SystemConfig, SolarPanel, Inverter, Battery, FinancialSettings, BudgetItem } from './types';
import { PANELS_DB, INVERTERS_DB, BATTERIES_DB, APP_VERSION, AUTHOR_NAME, AUTHOR_URL, STANDARD_LOAD_PROFILES, PORTUGAL_MUNICIPALITIES } from './constants';
import { suggestSystem } from './services/geminiService';
import { runSimulation, generateClimateData, generateScenarios, Scenario, parseEpw, generateSyntheticLoadProfile, analyzeResults, ImprovementSuggestion } from './services/solarService';
import { calculateDetailedBudget, BudgetItem as PricingBudgetItem } from './services/pricing';
import { calculateFinancials, FinancialResult } from './services/financialService';
import { SimulationCharts } from './components/SimulationCharts';
import { ClimateCharts } from './components/ClimateCharts';
import { LoadCharts } from './components/LoadCharts';
import { RoofDesigner } from './components/RoofDesigner';
import { ElectricalScheme } from './components/ElectricalScheme';
import { ReportView } from './components/ReportView';
import { MonitoringPlayer } from './components/MonitoringPlayer';
import { OptimizationAnalysis } from './components/OptimizationAnalysis';
import { BudgetEditor } from './components/BudgetEditor';
import { Logo } from './components/Logo';
import { 
  LayoutDashboard, MapPin, Sun, Layout, BatteryCharging, 
  BarChart3, FileText, Settings, Upload, Download, Copy, RefreshCw, Calculator, Printer, CheckCircle, ArrowRight, AlertTriangle, PlusCircle, Trash2, Coins, TrendingUp, FileSpreadsheet, Zap, Info, ExternalLink, Cpu, Tv, Lightbulb, Scale, Maximize, Activity, FileType, FileCode, Compass, X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, CartesianGrid, AreaChart, Area } from 'recharts';

// ... (Constants & Initial State - Preserved)
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
  budget: [] 
};

export default function App() {
  const [project, setProject] = useState<ProjectState>(INITIAL_PROJECT);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSimulating, setIsSimulating] = useState(false);
  const [comparisonProjects, setComparisonProjects] = useState<ProjectState[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isGeneratingScenarios, setIsGeneratingScenarios] = useState(false);
  const [isDirty, setIsDirty] = useState(false); 
  const [suggestions, setSuggestions] = useState<ImprovementSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const [importState, setImportState] = useState<{
      isOpen: boolean;
      content: string;
      filename: string;
      startLine: number;
      column: number;
  }>({ isOpen: false, content: '', filename: '', startLine: 1, column: 1 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadImportInputRef = useRef<HTMLInputElement>(null);
  const epwImportInputRef = useRef<HTMLInputElement>(null);
  const compareInputRef = useRef<HTMLInputElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  // Initialize Budget if empty on first load (legacy support)
  useEffect(() => {
     if (!project.budget || project.budget.length === 0) {
         const autoBudget = calculateDetailedBudget(project);
         // Do not trigger setProject loop, just ensure it's there if needed for other components
         // However, since we want user control, we only set it if explicitly needed.
         // Let's assume BudgetEditor handles the initial auto-fill if empty.
     }
  }, []);

  useEffect(() => {
    if (!project.climateData) {
        const climate = generateClimateData(project.settings.latitude);
        setProject(p => ({...p, climateData: climate}));
    }
  }, [project.settings.latitude]);

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

  useEffect(() => {
      if (project.simulationResult) {
           setIsDirty(true);
           setSuggestions([]); 
           setShowSuggestions(false);
      }
  }, [
      project.roofSegments, 
      project.systemConfig, 
      project.loadProfile, 
      project.settings.latitude,
      project.financialSettings 
  ]);

  useEffect(() => {
      if (project.simulationResult) {
          setIsDirty(false);
      }
  }, [project.simulationResult]);


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
                  climateDataSource: 'auto', 
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
      setSuggestions([]); 
      setShowSuggestions(false);
      setActiveTab('results');
    }, 500); 
  };
  
  const handleBudgetUpdate = (newBudget: BudgetItem[]) => {
      setProject(prev => ({ ...prev, budget: newBudget }));
  };

  // ... (Other handlers preserved: handleAnalyze, handleGenerateScenarios, applyScenario, updateLoadProfile, handleLoadInputChange, handle8760Import, processImport, handleEpwImport, handleLoadExportCsv, exportJson, importJson, handleExportComparisonHTML, handleExportComparisonWord, suggestInverter, loadStats) ...
  
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
          simulationResult: s.simulation 
      }));
      setIsDirty(false);
      alert(`Cenário "${s.label}" aplicado com sucesso!`);
  };

  const updateLoadProfile = (profileId: string) => {
      const standard = STANDARD_LOAD_PROFILES.find(p => p.id === profileId);
      if (standard) {
          const hourly = generateSyntheticLoadProfile(
              standard.annualKwh, 
              standard.baseKw, 
              standard.peakKw,
              standard.behavior
          );
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

  const handleLoadInputChange = (field: 'annual' | 'base' | 'peak', value: number) => {
      setProject(prev => {
          const newProfile = { ...prev.loadProfile };
          if (field === 'annual') newProfile.annualConsumptionKwh = value;
          if (field === 'base') newProfile.baseLoadKw = value;
          if (field === 'peak') newProfile.peakLoadKw = value;

          if (newProfile.type === 'simplified') {
              const currentStd = STANDARD_LOAD_PROFILES.find(p => p.name === newProfile.profileName);
              const behavior = currentStd?.behavior || 'default';
              newProfile.hourlyData = generateSyntheticLoadProfile(
                  newProfile.annualConsumptionKwh,
                  newProfile.baseLoadKw,
                  newProfile.peakLoadKw,
                  behavior
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
          setImportState({
              isOpen: true,
              content: text,
              filename: file.name,
              startLine: 1,
              column: 1
          });
      };
      reader.readAsText(file);
      if(e.target) e.target.value = '';
  };

  const processImport = () => {
      const { content, startLine, column } = importState;
      const lines = content.split(/\r?\n/);
      if (startLine > lines.length) { alert("A linha inicial é superior ao número total de linhas do ficheiro."); return; }
      const dataRows = lines.slice(startLine - 1);
      const values: number[] = [];
      for (const line of dataRows) {
          if (!line.trim()) continue;
          let separator = ',';
          if (line.includes(';')) separator = ';'; else if (line.includes('\t')) separator = '\t';
          const cols = line.split(separator);
          if (cols.length >= column) {
              const valStr = cols[column - 1];
              const cleanVal = valStr.replace(',', '.').replace(/[^0-9.-]/g, '').trim(); 
              const num = parseFloat(cleanVal);
              if (!isNaN(num)) values.push(num);
          }
      }
      const count = values.length;
      let finalData = values;
      if (count === 8760) { alert(`Sucesso: 8760 valores importados corretamente.`); } 
      else {
          if (count > 8760) { alert(`Aviso: Foram encontrados ${count} dados. O sistema irá utilizar apenas os primeiros 8760.`); finalData = values.slice(0, 8760); } 
          else { alert(`Aviso: Foram encontrados apenas ${count} dados. (Necessário: 8760h). \nOs dados em falta serão preenchidos com zero para permitir a simulação.`); while (finalData.length < 8760) finalData.push(0); }
      }
      const totalConsumption = finalData.reduce((a,b) => a+b, 0);
      const maxLoad = Math.max(...finalData);
      const avgLoad = totalConsumption / 8760;
      setProject(prev => ({
          ...prev,
          loadProfile: { 
              ...prev.loadProfile, 
              type: 'imported', 
              profileName: `Importado (${importState.filename})`, 
              annualConsumptionKwh: Math.round(totalConsumption), 
              peakLoadKw: parseFloat(maxLoad.toFixed(2)), 
              baseLoadKw: parseFloat(avgLoad.toFixed(3)),
              hourlyData: finalData 
          }
      }));
      setImportState(prev => ({ ...prev, isOpen: false }));
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
              setProject(prev => ({ ...prev, settings: { ...prev.settings, climateDataSource: 'epw', climateDescription: `Importado: ${file.name}` }, climateData: epwData }));
              alert("Dados climáticos EPW importados com sucesso!");
          } else { alert("Erro ao ler ficheiro EPW."); }
      };
      reader.readAsText(file);
      if(e.target) e.target.value = '';
  };

  const handleLoadExportCsv = () => {
     let data = project.loadProfile.hourlyData;
     if (!data || data.length !== 8760) { data = generateSyntheticLoadProfile(project.loadProfile.annualConsumptionKwh, project.loadProfile.baseLoadKw, project.loadProfile.peakLoadKw); }
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
           if (comparisonProjects.length >= 4) { alert("Máximo de 5 cenários."); return; }
           setComparisonProjects(prev => [...prev, obj]);
        } else { setProject(obj); }
      } catch (err) { alert("Ficheiro inválido"); }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleExportComparisonHTML = () => {
      if (!comparisonRef.current) return;
      const htmlContent = comparisonRef.current.innerHTML;
      const doc = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Comparativo</title><script src="https://cdn.tailwindcss.com"></script></head><body><div class="p-10">${htmlContent}</div></body></html>`;
      const blob = new Blob([doc], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Comparativo_${project.settings.name}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportComparisonWord = () => {
      if (!comparisonRef.current) return;
      const htmlContent = comparisonRef.current.innerHTML;
      const doc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>Comparativo</title></head><body>${htmlContent}</body></html>`;
      const blob = new Blob([doc], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Comparativo_${project.settings.name}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const suggestInverter = () => {
     const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
     const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
     const dcPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;
     const currentInv = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
     const sameBrand = INVERTERS_DB.filter(i => i.manufacturer === currentInv?.manufacturer);
     const allInvs = sameBrand.length > 0 ? sameBrand : INVERTERS_DB;
     let best = allInvs.filter(i => i.maxPowerKw >= dcPowerKw * 0.8).sort((a,b) => a.maxPowerKw - b.maxPowerKw)[0];
     let quantity = 1;
     if (!best) {
         best = allInvs.sort((a,b) => b.maxPowerKw - a.maxPowerKw)[0];
         quantity = Math.ceil((dcPowerKw * 0.8) / best.maxPowerKw);
     }
     if (best) {
         setProject(p => ({ ...p, systemConfig: { ...p.systemConfig, selectedInverterId: best.id, inverterCount: quantity } }));
         alert(`Inversor recomendado: ${quantity}x ${best.manufacturer} ${best.model} (${best.maxPowerKw}kW)`);
     } else { alert("Não foi encontrado um inversor ideal."); }
  };

  const loadStats = useMemo(() => {
     let hourlyData = project.loadProfile.hourlyData;
     if (!hourlyData || hourlyData.length !== 8760) {
         hourlyData = generateSyntheticLoadProfile(project.loadProfile.annualConsumptionKwh, project.loadProfile.baseLoadKw, project.loadProfile.peakLoadKw);
     }
     const total = hourlyData.reduce((a,b)=>a+b, 0);
     const max = Math.max(...hourlyData);
     const avgYear = total / 8760;
     let sunSum = 0; let sunCount = 0;
     hourlyData.forEach((val, idx) => { const h = idx % 24; if (h >= 9 && h <= 17) { sunSum += val; sunCount++; } });
     const avgSun = sunCount > 0 ? sunSum / sunCount : 0;
     return { total, max, avgYear, avgSun };
  }, [project.loadProfile]);

  // --- RENDER FUNCTIONS (Dashboard, Location, System...) preserved ---
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-xl p-8 text-white shadow-lg flex items-center justify-between">
        <div><h2 className="text-3xl font-bold mb-2 text-white">Bem-vindo ao K-PVPROSIM</h2><p className="opacity-90 text-blue-100">Simulador Fotovoltaico Profissional</p><div className="mt-4 flex gap-4 text-sm opacity-80 text-blue-100"><span>Versão: {APP_VERSION}</span><span>•</span><span>{new Date().toLocaleDateString('pt-PT')}</span></div></div>
        <div className="hidden md:block drop-shadow-lg text-white"><Logo className="h-24 w-auto text-white" /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('location')}><div className="flex items-center gap-3 mb-2 text-blue-600"><MapPin /> <h3 className="font-bold text-gray-800">1. Localização</h3></div><p className="text-sm text-gray-500">Selecione o concelho e gere dados climáticos.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('load')}><div className="flex items-center gap-3 mb-2 text-blue-600"><BarChart3 /> <h3 className="font-bold text-gray-800">2. Consumo</h3></div><p className="text-sm text-gray-500">Perfis de carga padrão e análise gráfica.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('system')}><div className="flex items-center gap-3 mb-2 text-blue-600"><Sun /> <h3 className="font-bold text-gray-800">3. Equipamento</h3></div><p className="text-sm text-gray-500">Selecione Inversores, Baterias e Cablagem.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('optimization')}><div className="flex items-center gap-3 mb-2 text-yellow-500"><Compass /> <h3 className="font-bold text-gray-800">4. Análise Solar</h3></div><p className="text-sm text-gray-500">Otimização de Inclinação e Azimute.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('roof')}><div className="flex items-center gap-3 mb-2 text-blue-600"><Layout /> <h3 className="font-bold text-gray-800">5. Cobertura</h3></div><p className="text-sm text-gray-500">Desenhe áreas, margens e layout de painéis.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('electrical')}><div className="flex items-center gap-3 mb-2 text-blue-600"><Cpu /> <h3 className="font-bold text-gray-800">6. Elétrico</h3></div><p className="text-sm text-gray-500">Verificação de strings e esquema unifilar.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={handleRunSimulation}><div className="flex items-center gap-3 mb-2 text-green-600"><FileText /> <h3 className="font-bold text-gray-800">7. Simulação</h3></div><p className="text-sm text-gray-500">Executar cálculo 8760h.</p></div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 hover:shadow-md transition cursor-pointer" onClick={() => setActiveTab('budget')}><div className="flex items-center gap-3 mb-2 text-blue-600"><Calculator /> <h3 className="font-bold text-gray-800">9. Orçamento</h3></div><p className="text-sm text-gray-500">Edição de quantidades e preços detalhados.</p></div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-100"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Coins className="text-yellow-600"/> Configuração Financeira (ROI)</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div><label className="block text-sm font-medium mb-1 text-gray-600">Custo Eletricidade (€/kWh)</label><input type="number" step="0.01" className="w-full border p-2 rounded" value={project.financialSettings.electricityPriceEurKwh} onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, electricityPriceEurKwh: parseFloat(e.target.value)}})} /></div><div><label className="block text-sm font-medium mb-1 text-gray-600">Venda de Excedente (€/kWh)</label><input type="number" step="0.01" className="w-full border p-2 rounded" value={project.financialSettings.gridExportPriceEurKwh} onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, gridExportPriceEurKwh: parseFloat(e.target.value)}})} /></div><div><label className="block text-sm font-medium mb-1 text-gray-600">Inflação Energética Anual (%)</label><input type="number" step="0.1" className="w-full border p-2 rounded" value={project.financialSettings.inflationRate} onChange={(e) => setProject({...project, financialSettings: {...project.financialSettings, inflationRate: parseFloat(e.target.value)}})} /></div></div></div>
    </div>
  );

  const renderLocation = () => {
    const totalRad = project.climateData ? Math.round(project.climateData.hourlyRad.reduce((a, b) => a + b, 0) / 1000) : 0;
    return (
    <div className="space-y-6 h-full pb-10">
        <div className="bg-white p-6 rounded-lg shadow space-y-4 border-l-4 border-blue-600">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><MapPin className="text-blue-600"/> Definição do Projeto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><label className="block text-sm font-medium text-gray-700">Nome do Projeto</label><input className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-200 outline-none" value={project.settings.name} onChange={e => setProject({...project, settings: {...project.settings, name: e.target.value}})} /></div>
                <div className="space-y-2"><label className="block text-sm font-medium text-gray-700">Nome Cliente</label><input className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-200 outline-none" value={project.settings.clientName} onChange={e => setProject({...project, settings: {...project.settings, clientName: e.target.value}})} /></div>
            </div>
            <div className="space-y-2 pt-2">
                <label className="block text-sm font-bold text-gray-700">Localização (Concelho)</label>
                <select className="w-full border rounded p-3 bg-gray-50 font-medium text-gray-800 focus:ring-2 focus:ring-blue-200 outline-none" value={project.settings.address} onChange={handleCityChange}><option value="" disabled>Selecione um concelho...</option>{PORTUGAL_MUNICIPALITIES.map(city => <option key={city.name} value={city.name}>{city.name}</option>)}</select>
                <div className="flex justify-between items-center mt-1"><p className="text-xs text-gray-500">Selecionar o concelho gera automaticamente dados climáticos padrão.</p><div className="flex gap-2"><button onClick={() => epwImportInputRef.current?.click()} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Upload size={12}/> Importar EPW</button><input ref={epwImportInputRef} type="file" className="hidden" accept=".epw" onChange={handleEpwImport} /></div></div>
            </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
             <div className="mb-4"><h3 className="text-xl font-bold text-gray-800">Dados Climáticos (8760h)</h3><p className="text-sm text-gray-500">{project.settings.climateDescription}</p></div>
             {project.settings.climateDataSource === 'auto' && (<div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded-r shadow-sm"><div className="flex items-start"><div className="flex-shrink-0"><AlertTriangle className="h-5 w-5 text-yellow-400" /></div><div className="ml-3"><p className="text-sm text-yellow-700"><span className="font-bold">Atenção:</span> Os dados são estimativas sintéticas baseadas na latitude. Recomenda-se EPW.</p></div></div><div className="mt-2 ml-8 text-xs text-gray-600"><p className="mb-1 font-bold">Importar Ficheiros EPW:</p><p>1. Aceda ao <a href="https://www.ladybug.tools/epwmap/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex inline-flex items-center gap-0.5 font-bold">Ladybug Tools EPWMap <ExternalLink size={10}/></a>.</p><p>2. Clique na localização desejada no mapa.</p><p>3. Descarregue o ficheiro .epw.</p><p>4. Carregue-o aqui usando o botão "Importar EPW" acima.</p></div></div>)}
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg flex justify-between items-center mb-6"><div><h4 className="font-bold text-orange-900 flex items-center gap-2"><Sun size={20}/> Produtividade Solar (GHI)</h4></div><div className="text-right"><p className="text-3xl font-extrabold text-orange-600">{totalRad.toLocaleString()}</p><p className="text-sm font-bold text-gray-600">kWh/m²/ano</p></div></div>
             <ClimateCharts data={project.climateData} lat={project.settings.latitude} />
        </div>
    </div>
  )};

  const renderSystem = () => {
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    const battery = BATTERIES_DB.find(b => b.id === project.systemConfig.selectedBatteryId);
    const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
    const dcPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;
    const invCount = project.systemConfig.inverterCount || 1;
    const acPowerKw = (inverter?.maxPowerKw || 0) * invCount;
    const ratio = dcPowerKw / (acPowerKw || 1);
    const invArea = inverter?.dimensions ? (inverter.dimensions.width * inverter.dimensions.depth / 1000000) * invCount : 0;
    const batArea = battery?.dimensions ? (battery.dimensions.width * battery.dimensions.depth / 1000000) * (project.systemConfig.batteryCount || 1) : 0;

    return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start"><h3 className="text-xl font-bold text-gray-800">Equipamento e Configuração</h3></div>
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex flex-col md:flex-row gap-6 items-center"><div className="flex items-center gap-2 text-blue-800 font-bold border-r border-blue-200 pr-6 w-full md:w-auto"><BarChart3 size={24} /><span>Resumo de Consumo <br/><span className="text-xs font-normal">Para Dimensionamento</span></span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full"><div className="text-center"><p className="text-xs text-gray-500 uppercase font-bold">Consumo Anual</p><p className="font-bold text-lg">{Math.round(loadStats.total)} kWh</p></div><div className="text-center"><p className="text-xs text-gray-500 uppercase font-bold">Carga Máx (Pico)</p><p className="font-bold text-lg">{loadStats.max.toFixed(2)} kW</p></div><div className="text-center"><p className="text-xs text-gray-500 uppercase font-bold">Média Anual</p><p className="font-bold text-lg">{loadStats.avgYear.toFixed(2)} kW</p></div><div className="text-center bg-white rounded border p-1 shadow-sm"><p className="text-xs text-orange-600 uppercase font-bold">Média Horas Sol</p><p className="font-bold text-lg text-orange-700">{loadStats.avgSun.toFixed(2)} kW</p></div></div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded shadow"><h4 className="font-bold mb-3 flex items-center gap-2"><Sun className="w-4 h-4"/> Painéis Solares</h4><select className="w-full border p-2 rounded mb-4" value={project.systemConfig.selectedPanelId} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedPanelId: e.target.value}})}>{PANELS_DB.map(p => <option key={p.id} value={p.id}>{p.manufacturer} {p.model} ({p.powerW}W)</option>)}</select><div className="text-sm text-gray-600 bg-gray-50 p-3 rounded space-y-2"><div className="flex justify-between"><span>Potência:</span> <strong>{panel?.powerW} W</strong></div><div className="flex justify-between"><span>Eficiência:</span> <strong>{(panel?.efficiency || 0) * 100}%</strong></div><div className="grid grid-cols-2 gap-2 text-xs border-t pt-1"><div>Voc: <strong>{panel?.voc} V</strong></div><div>Isc: <strong>{panel?.isc} A</strong></div></div><div className="flex justify-between text-xs"><span>Dim:</span><span className="font-mono">{panel?.widthMm}x{panel?.heightMm}</span></div><div className="flex justify-between text-xs"><span>Peso:</span><strong>{panel?.weightKg} kg</strong></div><div className="mt-2 pt-2 border-t border-gray-200"><p className="text-xs font-bold text-gray-500 uppercase">Potência DC</p><p className="font-bold text-blue-800">{dcPowerKw.toFixed(2)} kWp</p></div></div></div>
        <div className="bg-white p-4 rounded shadow"><h4 className="font-bold mb-3 flex items-center gap-2"><Zap className="w-4 h-4"/> Inversor</h4><div className="flex gap-2 mb-2"><select className="w-full border p-2 rounded" value={project.systemConfig.selectedInverterId} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedInverterId: e.target.value}})}>{INVERTERS_DB.map(i => <option key={i.id} value={i.id}>{i.manufacturer} {i.model} ({i.maxPowerKw}kW)</option>)}</select><input type="number" min="1" max="50" className="w-16 border rounded p-2 text-center" value={project.systemConfig.inverterCount || 1} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, inverterCount: Math.max(1, parseInt(e.target.value))}})} /></div><button onClick={suggestInverter} className="text-xs text-blue-600 hover:underline mb-4 w-full text-left flex items-center gap-1"><Zap size={12}/> Recomendar Inversor</button><div className="text-sm text-gray-600 bg-gray-50 p-3 rounded space-y-2"><div className="flex justify-between"><span>Potência Máx:</span> <strong>{inverter?.maxPowerKw} kW</strong></div><div className="flex justify-between"><span>Fases:</span> <strong>{inverter?.phases}</strong></div><div className="flex justify-between text-xs"><span>Dimensões:</span><span className="font-mono">{inverter?.dimensions?.width}x{inverter?.dimensions?.height}x{inverter?.dimensions?.depth} mm</span></div><div className="flex justify-between text-xs"><span>Peso Unitário:</span><strong>{inverter?.weightKg} kg</strong></div><div className="flex justify-between text-xs"><span>Área Implantação:</span><strong>{invArea.toFixed(2)} m²</strong></div><div className="text-xs bg-slate-100 p-2 rounded border mt-2 space-y-1"><p className="flex justify-between"><span>MPPTs:</span> <strong>{inverter?.numMppts}</strong></p><p className="flex justify-between"><span>Range:</span> <strong>{inverter?.mpptRange[0]}-{inverter?.mpptRange[1]} V</strong></p><p className="flex justify-between"><span>Max DC:</span> <strong>{inverter?.maxDcVoltage} V</strong></p></div><div className="mt-2 pt-2 border-t border-gray-200"><p className="text-xs font-bold text-gray-500 uppercase">Potência AC Total</p><p className="font-bold">{(inverter?.maxPowerKw || 0) * (project.systemConfig.inverterCount || 1)} kW</p><span className="text-xs text-gray-500">Rácio DC/AC: {ratio.toFixed(2)}</span></div></div></div>
        <div className="bg-white p-4 rounded shadow"><h4 className="font-bold mb-3 flex items-center gap-2"><BatteryCharging className="w-4 h-4"/> Bateria</h4><div className="flex gap-2 mb-4"><select className="w-full border p-2 rounded" value={project.systemConfig.selectedBatteryId || ''} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, selectedBatteryId: e.target.value || null}})}><option value="">Sem Bateria</option>{BATTERIES_DB.map(b => <option key={b.id} value={b.id}>{b.manufacturer} {b.model} ({b.capacityKwh}kWh)</option>)}</select>{project.systemConfig.selectedBatteryId && (<input type="number" min="1" className="w-16 border rounded p-2" value={project.systemConfig.batteryCount || 1} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, batteryCount: parseInt(e.target.value)}})} />)}</div>{battery ? (<div className="text-sm text-gray-600 bg-gray-50 p-3 rounded space-y-2"><div className="flex justify-between"><span>Capacidade:</span> <strong>{battery.capacityKwh} kWh</strong></div><div className="flex justify-between"><span>Tecnologia:</span> <strong>LiFePO4</strong></div><div className="flex justify-between"><span>Voltagem Nom.:</span> <strong>{battery.nominalVoltage} V</strong></div><div className="flex justify-between text-xs"><span>Dimensões:</span><span className="font-mono">{battery.dimensions?.width}x{battery.dimensions?.height}x{battery.dimensions?.depth} mm</span></div><div className="flex justify-between text-xs"><span>Peso:</span><strong>{battery.weightKg} kg</strong></div><div className="flex justify-between text-xs"><span>Área Implantação:</span><strong>{batArea.toFixed(2)} m²</strong></div><div className="mt-2 pt-2 border-t border-gray-200"><p className="text-xs font-bold text-gray-500 uppercase">Capacidade Total</p><p className="font-bold text-green-700">{(battery.capacityKwh * (project.systemConfig.batteryCount || 1)).toFixed(1)} kWh</p></div></div>) : <div className="p-4 border border-dashed rounded text-center text-gray-400 text-sm h-32 flex items-center justify-center">Sem Bateria</div>}</div>
      </div>
      <div className="bg-white p-4 rounded shadow"><h4 className="font-bold mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> Cablagem</h4><div className="grid grid-cols-2 gap-6"><div><label className="block text-sm font-medium mb-1">Distância DC (m)</label><input type="number" className="border p-2 rounded w-full" value={project.systemConfig.cableDcMeters || 15} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, cableDcMeters: parseFloat(e.target.value)}})} /></div><div><label className="block text-sm font-medium mb-1">Distância AC (m)</label><input type="number" className="border p-2 rounded w-full" value={project.systemConfig.cableAcMeters || 10} onChange={(e) => setProject({...project, systemConfig: {...project.systemConfig, cableAcMeters: parseFloat(e.target.value)}})} /></div></div></div>
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg shadow-inner"><div className="flex justify-between items-center mb-6"><div><h4 className="text-xl font-bold text-blue-900">Estratégias de Otimização</h4></div><button onClick={handleGenerateScenarios} disabled={isGeneratingScenarios} className="bg-blue-600 text-white px-6 py-3 rounded shadow hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"><RefreshCw className={isGeneratingScenarios ? "animate-spin" : ""} /> {isGeneratingScenarios ? 'A Gerar...' : 'Gerar 4 Cenários'}</button></div>{scenarios.length > 0 && (<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{scenarios.map(s => (<div key={s.id} className="bg-white p-4 rounded border hover:shadow-lg transition flex flex-col"><div className="border-b pb-2 mb-2"><h5 className="font-bold text-lg text-gray-800">{s.label}</h5><p className="text-xs text-gray-500 h-8">{s.description}</p></div><div className="space-y-2 text-sm flex-1"><div className="flex justify-between"><span>Potência:</span><span className="font-bold">{s.stats.powerKw} kWp</span></div><div className="flex justify-between"><span>Painéis:</span><span className="font-bold">{s.stats.panels} un</span></div><div className="flex justify-between"><span>Inversor:</span><span className="font-bold text-xs">{s.stats.inverterCount}x {s.stats.inverter}</span></div><div className="flex justify-between"><span>Baterias:</span><span className="font-bold">{s.stats.batteries} un</span></div><div className="border-t pt-2 mt-2"><div className="flex justify-between text-green-700"><span>Produção:</span><span className="font-bold">{Math.round(s.simulation.totalProductionKwh)} kWh</span></div><div className="flex justify-between text-blue-700"><span>Autoconsumo:</span><span className="font-bold">{Math.round(s.simulation.totalProductionKwh - s.simulation.totalExportKwh)} kWh</span></div></div></div><button onClick={() => applyScenario(s)} className="mt-4 w-full py-2 bg-gray-800 text-white rounded hover:bg-black text-sm uppercase font-bold tracking-wide">Aplicar</button></div>))}</div>)}</div>
    </div>
  )};

  const renderResults = () => {
    const sim = project.simulationResult;
    const injectionPct = sim && sim.totalProductionKwh > 0 ? (sim.totalExportKwh / sim.totalProductionKwh) * 100 : 0;
    const selfConsumptionKwh = sim ? sim.totalProductionKwh - sim.totalExportKwh : 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Resultados da Simulação</h3>
                <div className="flex gap-2">
                    <button onClick={handleAnalyze} disabled={!sim} className="bg-yellow-500 text-white px-4 py-2 rounded shadow hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2 font-bold"><Lightbulb size={18} /> Ajuda / Otimizar</button>
                    <button onClick={handleRunSimulation} disabled={isSimulating} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">{isSimulating ? 'A calcular...' : 'Recalcular'}{isDirty && !isSimulating && <AlertTriangle size={18} className="text-yellow-300" />}</button>
                </div>
            </div>
            {isDirty && !isSimulating && <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-yellow-800 text-sm flex items-center gap-2"><AlertTriangle size={16} /> Dados alterados! Recalcule.</div>}
            {showSuggestions && suggestions.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-yellow-200">
                    <div className="flex justify-between items-center mb-4 border-b pb-2"><h4 className="text-lg font-bold text-gray-800">Assistente de Otimização</h4><button onClick={() => setShowSuggestions(false)}>✕</button></div>
                    <div className="space-y-3">{suggestions.map((s, i) => <div key={i} className={`p-4 rounded-lg border ${s.type==='warning'?'bg-red-50 border-red-200':s.type==='success'?'bg-green-50 border-green-200':'bg-blue-50 border-blue-200'}`}><p className="font-bold">{s.title}</p><p className="text-sm">{s.message}</p></div>)}</div>
                </div>
            )}
            {project.simulationResult ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KPICard label="Produção Total" value={`${Math.round(project.simulationResult.totalProductionKwh)} kWh`} color="text-yellow-600" />
                        <KPICard label="Autoconsumo" value={`${Math.round(selfConsumptionKwh)} kWh (${(project.simulationResult.selfConsumptionRatio * 100).toFixed(1)}%)`} color="text-blue-600" />
                        <KPICard label="Injeção na Rede" value={`${Math.round(project.simulationResult.totalExportKwh)} kWh (${injectionPct.toFixed(1)}%)`} color="text-green-600" />
                        <KPICard label="Autossuficiência" value={`${(project.simulationResult.autonomyRatio * 100).toFixed(1)}%`} color="text-purple-600" />
                    </div>
                    {/* New Autonomy Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KPICard label="Dias Autónomos (0 Import)" value={`${project.simulationResult.autonomousDaysCount} Dias`} color="text-indigo-600" />
                        <KPICard label="Max. Autonomia Contínua" value={`${project.simulationResult.maxAutonomousHoursStreak} Horas`} color="text-teal-600" />
                        <div className="md:col-span-2 bg-white p-4 rounded shadow border border-gray-100 flex justify-between items-center px-8">
                             <div><p className="text-xs text-gray-500 uppercase font-bold">Retorno Estimado</p><p className="text-2xl font-bold text-gray-800">{calculateFinancials(project).paybackPeriodYears.toFixed(1)} Anos</p></div>
                             <div><p className="text-xs text-gray-500 uppercase font-bold">Poupança 15 Anos</p><p className="text-2xl font-bold text-green-700">{calculateFinancials(project).totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency',currency:'EUR', maximumFractionDigits:0})}</p></div>
                        </div>
                    </div>

                    {project.simulationResult.totalShadingLossKwh > 0 && (
                        <div className="bg-red-50 border border-red-100 p-3 rounded flex justify-between items-center px-6">
                            <div><p className="text-xs text-red-700 uppercase font-bold">Perdas por Sombra</p><p className="text-lg font-bold text-red-800">-{Math.round(project.simulationResult.totalShadingLossKwh)} kWh</p></div>
                            <div className="text-right text-sm text-red-600 font-medium">Impacto: {project.simulationResult.shadingLossPercent?.toFixed(1)}%</div>
                        </div>
                    )}
                    <SimulationCharts result={project.simulationResult} />
                </>
            ) : <div className="text-center py-20 bg-gray-50 rounded border border-dashed border-gray-300"><p className="text-gray-500">Execute a simulação.</p></div>}
        </div>
    );
  };

  const renderComparison = () => {
      const allProjects = [project, ...comparisonProjects];
      const chartData = allProjects.map((p, i) => {
          const sim = p.simulationResult;
          const fin = calculateFinancials(p);
          // Recalculate budget if dynamic, or use stored if exists
          let investment = 0;
          if (p.budget && p.budget.length > 0) {
              investment = p.budget.reduce((s,x)=>s+x.totalPrice,0) * 1.06;
          } else {
              investment = calculateDetailedBudget(p).reduce((s,x)=>s+x.totalPrice,0) * 1.06;
          }
          
          return {
              name: i === 0 ? 'Atual' : `C${i}`,
              fullName: i === 0 ? 'Atual' : `Cenário ${i}`,
              production: sim ? Math.round(sim.totalProductionKwh) : 0,
              load: sim ? Math.round(sim.totalLoadKwh) : 0,
              investment: Math.round(investment),
              savings: Math.round(fin.totalSavings15YearsEur),
              autoconsumption: sim ? parseFloat((sim.selfConsumptionRatio*100).toFixed(1)) : 0,
              autonomy: sim ? parseFloat((sim.autonomyRatio*100).toFixed(1)) : 0,
              roi: parseFloat(fin.roiPercent.toFixed(1))
          };
      });

      return (
          <div className="space-y-6 print:p-0 print:space-y-2">
              <div className="flex justify-between items-center bg-slate-800 p-6 rounded-lg text-white print:hidden"><div><h3 className="text-xl font-bold text-white">Comparativo de Cenários</h3><p className="text-sm text-slate-300">Analise até 5 configurações diferentes lado a lado.</p></div><div className="flex gap-2"><button onClick={() => compareInputRef.current?.click()} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 flex items-center gap-2 text-sm"><Upload size={16}/> JSON</button><input ref={compareInputRef} type="file" className="hidden" accept=".json" onChange={(e) => importJson(e, true)} /><button onClick={handleExportComparisonWord} className="bg-white text-blue-900 px-3 py-2 rounded shadow hover:bg-gray-100 flex items-center gap-2 text-sm font-bold"><FileType size={16}/> Word</button><button onClick={handleExportComparisonHTML} className="bg-white text-orange-700 px-3 py-2 rounded shadow hover:bg-gray-100 flex items-center gap-2 text-sm font-bold"><FileCode size={16}/> HTML</button><button onClick={() => window.print()} className="bg-slate-600 text-white px-4 py-2 rounded shadow hover:bg-slate-700 flex items-center gap-2 text-sm"><Printer size={16}/> Print</button></div></div>
              {allProjects.length === 1 && <div className="p-10 text-center text-gray-400 italic border-dashed border-2 rounded print:hidden">Carregue ficheiros JSON de outros projetos para comparar.</div>}
              {allProjects.length > 0 && (
                <div ref={comparisonRef}>
                  <div className="overflow-x-auto print:overflow-visible">
                      <table className="w-full text-sm text-left border-collapse bg-white shadow rounded-lg overflow-hidden print:shadow-none print:border">
                          <thead className="bg-slate-100 text-slate-600 uppercase text-xs print:bg-slate-200"><tr><th className="p-4 border-b">Parâmetro</th>{allProjects.map((p, i) => (<th key={i} className={`p-4 border-b min-w-[150px] ${i===0 ? 'bg-blue-50 border-blue-200' : ''}`}>{i===0 ? 'Projeto Atual' : `Cenário ${i}`}<div className="text-xs font-normal normal-case mt-1 text-gray-500">{p.settings.name}</div></th>))}</tr></thead>
                          <tbody className="divide-y">
                              <tr className="bg-slate-50 font-bold text-slate-500"><td colSpan={allProjects.length + 1} className="p-2 px-4 text-xs uppercase tracking-wider">Especificações do Sistema</td></tr>
                              <tr><td className="p-4 font-bold">Potência (kWp)</td>{allProjects.map((p, i) => { const panels = p.roofSegments.reduce((a,b)=>a+b.panelsCount,0); const panel = PANELS_DB.find(x=>x.id===p.systemConfig.selectedPanelId); const kwp = (panels * (panel?.powerW||0)) / 1000; return <td key={i} className="p-4">{kwp.toFixed(2)} kWp</td>})}</tr>
                              <tr><td className="p-4 font-bold">Baterias (kWh)</td>{allProjects.map((p, i) => { const bat = BATTERIES_DB.find(b=>b.id===p.systemConfig.selectedBatteryId); const cap = bat ? bat.capacityKwh * (p.systemConfig.batteryCount||1) : 0; return <td key={i} className="p-4">{cap.toFixed(1)} kWh</td>})}</tr>
                              <tr><td className="p-4 font-bold">Investimento Estimado</td>{allProjects.map((p, i) => { 
                                  // Use stored or calc
                                  let budget = 0;
                                  if(p.budget && p.budget.length>0) budget = p.budget.reduce((s,x)=>s+x.totalPrice,0) * 1.06;
                                  else budget = calculateDetailedBudget(p).reduce((s,x)=>s+x.totalPrice,0) * 1.06; 
                                  return <td key={i} className="p-4">{budget.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</td>
                                  })}</tr>
                              <tr className="bg-slate-50 font-bold text-slate-500"><td colSpan={allProjects.length + 1} className="p-2 px-4 text-xs uppercase tracking-wider">Financeiro (15 Anos)</td></tr>
                              <tr><td className="p-4 font-bold">Poupança Total</td>{allProjects.map((p, i) => <td key={i} className="p-4 text-green-700 font-bold">{calculateFinancials(p).totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</td>)}</tr>
                              <tr><td className="p-4 font-bold">Payback (Anos)</td>{allProjects.map((p, i) => <td key={i} className="p-4">{calculateFinancials(p).paybackPeriodYears.toFixed(1)}</td>)}</tr>
                          </tbody>
                      </table>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 print:grid-cols-2 print:gap-4 print:break-inside-avoid">
                      <div className="bg-white p-4 rounded shadow border"><h4 className="font-bold text-gray-700 mb-4 text-sm text-center">Balanço Energético (kWh)</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} /><RechartsTooltip /><Legend /><Bar dataKey="production" name="Produção" fill="#eab308" radius={[4,4,0,0]} /><Bar dataKey="load" name="Carga" fill="#94a3b8" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>
                      <div className="bg-white p-4 rounded shadow border"><h4 className="font-bold text-gray-700 mb-4 text-sm text-center">Análise Financeira (€)</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} /><RechartsTooltip formatter={(val: number) => val.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})} /><Legend /><Bar dataKey="investment" name="Investimento" fill="#ef4444" radius={[4,4,0,0]} /><Bar dataKey="savings" name="Poupança 15A" fill="#22c55e" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>
                      <div className="bg-white p-4 rounded shadow border"><h4 className="font-bold text-gray-700 mb-4 text-sm text-center">Eficiência do Sistema (%)</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} unit="%" /><RechartsTooltip /><Legend /><Bar dataKey="autoconsumption" name="Autoconsumo" fill="#3b82f6" radius={[4,4,0,0]} /><Bar dataKey="autonomy" name="Autonomia" fill="#a855f7" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>
                      <div className="bg-white p-4 rounded shadow border"><h4 className="font-bold text-gray-700 mb-4 text-sm text-center">Retorno do Investimento (ROI %)</h4><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} unit="%" /><RechartsTooltip /><Bar dataKey="roi" name="ROI %" fill="#10b981" radius={[4,4,0,0]} label={{ position: 'top', fill: '#10b981', fontSize: 12 }} /></BarChart></ResponsiveContainer></div></div>
                  </div>
                </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shadow-xl print:hidden">
        <div className="p-6 border-b border-slate-700 flex flex-col items-center text-center"><div className="mb-3"><Logo className="h-16 w-auto text-blue-400" /></div><h1 className="text-xl font-bold tracking-wider text-blue-400">K-PVPROSIM</h1></div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Início" />
          <NavButton active={activeTab === 'location'} onClick={() => setActiveTab('location')} icon={<MapPin size={20} />} label="1. Localização" />
          <NavButton active={activeTab === 'load'} onClick={() => setActiveTab('load')} icon={<BarChart3 size={20} />} label="2. Consumo" />
          <NavButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={<Settings size={20} />} label="3. Equipamento" />
          <NavButton active={activeTab === 'optimization'} onClick={() => setActiveTab('optimization')} icon={<Compass size={20} />} label="4. Análise Solar" />
          <NavButton active={activeTab === 'roof'} onClick={() => setActiveTab('roof')} icon={<Layout size={20} />} label="5. Cobertura" />
          <NavButton active={activeTab === 'electrical'} onClick={() => setActiveTab('electrical')} icon={<Cpu size={20} />} label="6. Elétrico" />
          <NavButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={<FileText size={20} />} label="7. Simulação" warning={isDirty} />
          <NavButton active={activeTab === 'monitor'} onClick={() => setActiveTab('monitor')} icon={<Tv size={20} />} label="8. Monitorização" />
          <NavButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={<Calculator size={20} />} label="9. Orçamento" />
          <NavButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<Printer size={20} />} label="Relatório" />
          <NavButton active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} icon={<Copy size={20} />} label="Comparar" />
        </nav>
        <div className="p-4 border-t border-slate-700 bg-slate-950">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Projeto</p>
            <div className="flex gap-2">
                <button onClick={exportJson} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white p-2 rounded flex flex-col items-center gap-1 text-xs transition-colors" title="Gravar Projeto JSON"><Download size={18} /><span>Gravar</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white p-2 rounded flex flex-col items-center gap-1 text-xs transition-colors" title="Abrir Projeto JSON"><Upload size={18} /><span>Abrir</span></button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".json" onChange={(e) => importJson(e)} />
            </div>
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
                    <select className="w-full p-2 border rounded" onChange={(e) => updateLoadProfile(e.target.value)} value="">
                        <option value="" disabled>Selecione um perfil...</option>
                        {STANDARD_LOAD_PROFILES.map(p => <option key={p.id} value={p.id}>{p.name} ({p.annualKwh} kWh/ano)</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-gray-50 rounded border text-center"><button onClick={() => loadImportInputRef.current?.click()} className="text-sm font-bold text-blue-600 hover:underline flex items-center justify-center gap-2 mx-auto mb-2"><Upload size={16}/> Importar Consumo (8760h)</button><p className="text-xs text-gray-400">Suporta .txt ou .csv (lista de valores)</p><input ref={loadImportInputRef} type="file" className="hidden" accept=".csv,.txt" onChange={handle8760Import} /></div>
                    <div className="p-4 bg-gray-50 rounded border text-center"><button onClick={handleLoadExportCsv} className="text-sm font-bold text-green-600 hover:underline flex items-center justify-center gap-2 mx-auto mb-2"><Download size={16}/> Exportar CSV (8760h)</button><p className="text-xs text-gray-400">Download do perfil atual</p></div>
                </div>
                {project.loadProfile.type === 'imported' && project.loadProfile.hourlyData && (
                    <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-sm">
                        <div className="flex items-center justify-between"><div><h4 className="font-bold text-green-800 flex items-center gap-2"><CheckCircle size={18}/> Importação Concluída</h4><p className="text-sm text-green-700 mt-1">Ficheiro: <strong>{project.loadProfile.profileName?.replace('Importado (','').replace(')','')}</strong></p></div><div className="text-right"><span className="text-2xl font-bold text-green-700">{project.loadProfile.hourlyData.length}</span><p className="text-xs font-bold text-green-600 uppercase">Pontos de Dados</p></div></div>
                    </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6"><div><label className="block text-sm font-medium mb-1">Consumo Anual (kWh)</label><input type="number" className="w-full border p-2 rounded" value={project.loadProfile.annualConsumptionKwh} onChange={(e) => handleLoadInputChange('annual', parseFloat(e.target.value))} /></div><div><label className="block text-sm font-medium mb-1">Carga Base (kW)</label><input type="number" className="w-full border p-2 rounded" value={project.loadProfile.baseLoadKw} onChange={(e) => handleLoadInputChange('base', parseFloat(e.target.value))} /></div><div><label className="block text-sm font-medium mb-1">Carga de Pico (kW)</label><input type="number" className="w-full border p-2 rounded" value={project.loadProfile.peakLoadKw} onChange={(e) => handleLoadInputChange('peak', parseFloat(e.target.value))} /></div></div>
             </div>
             <LoadCharts loadProfile={project.loadProfile} />
          </div>
        )}
        {activeTab === 'optimization' && <OptimizationAnalysis lat={project.settings.latitude} />}
        {activeTab === 'roof' && <div className="h-full"><RoofDesigner roofSegments={project.roofSegments} onChange={(segs) => setProject({...project, roofSegments: segs})} selectedPanelId={project.systemConfig.selectedPanelId} latitude={project.settings.latitude}/></div>}
        {activeTab === 'electrical' && <ElectricalScheme project={project} onUpdateProject={setProject} />}
        {activeTab === 'system' && renderSystem()}
        {activeTab === 'results' && renderResults()}
        {activeTab === 'budget' && <BudgetEditor project={project} onUpdate={handleBudgetUpdate} />}
        {activeTab === 'report' && <ReportView project={project} />}
        {activeTab === 'compare' && renderComparison()}
        {activeTab === 'monitor' && <MonitoringPlayer project={project} />}
      </main>
      {/* Import Modal */}
      {importState.isOpen && (<div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white p-6 rounded-xl shadow-2xl w-96 max-w-full border border-gray-200"><div className="flex justify-between items-center mb-6 border-b pb-2"><h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Upload size={20} className="text-blue-600"/> Configurar Importação</h3><button onClick={() => setImportState(s => ({...s, isOpen: false}))} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div><div className="bg-blue-50 p-3 rounded mb-4 text-xs text-blue-800 flex items-start gap-2"><Info size={16} className="shrink-0 mt-0.5"/><p>Ficheiro selecionado: <strong>{importState.filename}</strong></p></div><div className="space-y-5"><div><label className="block text-sm font-bold text-gray-700 mb-1">Linha Inicial dos Dados</label><input type="number" min="1" className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={importState.startLine} onChange={e => setImportState(s => ({...s, startLine: Math.max(1, parseInt(e.target.value)||1)}))} /><p className="text-[10px] text-gray-500 mt-1">Indique a linha do primeiro valor numérico (ignorando cabeçalhos).</p></div><div><label className="block text-sm font-bold text-gray-700 mb-1">Coluna dos Dados</label><input type="number" min="1" className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={importState.column} onChange={e => setImportState(s => ({...s, column: Math.max(1, parseInt(e.target.value)||1)}))} /><p className="text-[10px] text-gray-500 mt-1">Indique o nº da coluna onde estão os valores (1=A, 2=B, etc).</p></div><div className="pt-2"><button onClick={processImport} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 shadow transition-colors flex justify-center items-center gap-2"><CheckCircle size={18}/> Confirmar e Importar</button></div></div></div></div>)}
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label, warning }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded transition-colors text-left relative ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
    {icon}<span className="font-medium">{label}</span>{warning && <span className="absolute right-2 top-3 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>}
  </button>
);

const KPICard = ({ label, value, color }: any) => (
  <div className="bg-white p-4 rounded shadow border border-gray-100"><p className="text-xs text-gray-500 uppercase font-bold">{label}</p><p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p></div>
);