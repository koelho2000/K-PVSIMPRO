
import React, { useMemo, useRef } from 'react';
import { ProjectState } from '../types';
import { PANELS_DB, INVERTERS_DB, BATTERIES_DB, APP_VERSION, MONTH_NAMES } from '../constants';
import { calculateStringing } from '../services/electricalService';
import { calculateDetailedBudget } from '../services/pricing';
import { calculateFinancials } from '../services/financialService';
import { Logo } from './Logo';
import { 
  MapPin, User, AlertTriangle, Zap, BarChart3, Sun, Battery, 
  TrendingUp, FileText, Printer, ShieldCheck, FileCode, FileType
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, Area, ComposedChart, AreaChart
} from 'recharts';

interface ReportViewProps {
  project: ProjectState;
}

// -- Text Generators --

const generateLocationText = (p: ProjectState) => {
    return `O projeto está situado no concelho de ${p.settings.address} (Lat: ${p.settings.latitude.toFixed(4)}, Long: ${p.settings.longitude.toFixed(4)}). 
    Para a modelação energética, foram utilizados dados climáticos ${p.settings.climateDataSource === 'epw' ? 'importados de fonte certificada (EPW)' : 'sintéticos ajustados à latitude'}, com resolução horária (8760h). 
    A análise da irradiação local e dos perfis de temperatura é fundamental para calcular as perdas térmicas dos painéis e a produção fotovoltaica real esperada ao longo das estações do ano.`;
};

const generateConsumptionText = (p: ProjectState) => {
    return `A instalação foi dimensionada para responder a um perfil de consumo do tipo "${p.loadProfile.profileName || 'Personalizado'}". 
    O consumo anual de referência é de ${p.loadProfile.annualConsumptionKwh.toLocaleString()} kWh, com uma potência de ponta estimada de ${p.loadProfile.peakLoadKw} kW. 
    A análise do perfil diário permite identificar os períodos de maior necessidade energética, essencial para o correto dimensionamento do binómio produção/baterias.`;
};

const generateEquipmentText = (p: ProjectState) => {
    const panel = PANELS_DB.find(x => x.id === p.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(x => x.id === p.systemConfig.selectedInverterId);
    const battery = BATTERIES_DB.find(x => x.id === p.systemConfig.selectedBatteryId);
    const totalPanels = p.roofSegments.reduce((a,b)=>a+b.panelsCount,0);

    let text = `O campo solar é constituído por ${totalPanels} módulos ${panel?.manufacturer} ${panel?.model} (${panel?.powerW}Wp), totalizando ${((totalPanels * (panel?.powerW||0))/1000).toFixed(2)} kWp. 
    A inversão é assegurada por ${p.systemConfig.inverterCount||1} unidade(s) ${inverter?.manufacturer} ${inverter?.model} (${inverter?.maxPowerKw}kW), equipamento com ${inverter?.numMppts} MPPTs para gestão otimizada de sombras.`;

    if (battery) {
        text += ` Foi incluído um sistema de armazenamento ${battery.manufacturer} com ${(battery.capacityKwh * (p.systemConfig.batteryCount||1)).toFixed(1)} kWh úteis, permitindo deslocar a produção diurna para o consumo noturno.`;
    } else {
        text += ` O sistema opera em regime de autoconsumo instantâneo, sem baterias, privilegiando o consumo direto durante as horas de sol.`;
    }
    return text;
};

const generateElectricalText = (elec: any, inverter: any) => {
    if (!elec.valid) return "O dimensionamento elétrico requer revisão urgente devido a incompatibilidades de tensão ou corrente detetadas.";

    return `A configuração elétrica valida a compatibilidade entre as strings fotovoltaicas e o inversor. 
    A tensão máxima de circuito aberto (${elec.metrics.maxStringVoltage.toFixed(0)}V @ -10°C) respeita o limite do inversor de ${inverter?.maxDcVoltage}V. 
    Foram dimensionadas as proteções contra sobrecorrentes (Fusíveis DC ${elec.protection.dcFuseA}A) e curto-circuitos na rede (Disjuntor AC ${elec.protection.acBreakerA}A), bem como as secções de cabo (${elec.cables.dcStringMm2}mm² DC / ${elec.cables.acMm2}mm² AC) para garantir a segurança e eficiência da instalação.`;
};

const generateSimulationText = (sim: any) => {
    if (!sim) return "Simulação pendente.";
    return `Os resultados da simulação horária (8760h) indicam uma produção total de ${Math.round(sim.totalProductionKwh).toLocaleString()} kWh/ano. 
    Desta produção, ${(sim.selfConsumptionRatio * 100).toFixed(1)}% será consumida diretamente no edifício (Autoconsumo), enquanto o restante será injetado na rede. 
    O sistema garante uma autonomia energética de ${(sim.autonomyRatio * 100).toFixed(1)}%, reduzindo significativamente a dependência da rede elétrica pública.`;
};

const generateEnergySourcesText = (breakdown: any) => {
    const total = breakdown.total || 1;
    const directPct = ((breakdown.direct / total) * 100).toFixed(1);
    const batPct = ((breakdown.battery / total) * 100).toFixed(1);
    const gridPct = ((breakdown.grid / total) * 100).toFixed(1);

    return `A análise das fontes de energia revela que ${directPct}% das necessidades do edifício são supridas diretamente pelo sol em tempo real. 
    ${breakdown.battery > 0 ? `O sistema de armazenamento contribui com ${batPct}%, cobrindo consumos noturnos ou picos.` : 'Não existe armazenamento em baterias.'}
    A rede elétrica pública fornece os restantes ${gridPct}%, garantindo o abastecimento contínuo quando a produção solar é insuficiente.`;
};

const generateBudgetText = (total: number) => {
    return `O investimento total estimado é de ${total.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})} (com IVA). 
    Este valor inclui todos os componentes principais (módulos, inversor, estrutura, baterias), material elétrico diverso, mão de obra especializada para instalação, e serviços de engenharia/licenciamento necessários para a legalização da unidade de produção.`;
};

const generateFinancialText = (fin: any) => {
    return `A análise económica projeta um retorno do investimento (Payback) em ${fin.paybackPeriodYears.toFixed(1)} anos. 
    Considerando a inflação energética e a degradação dos equipamentos, estima-se uma poupança acumulada líquida superior a ${fin.totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})} ao fim de 15 anos. 
    A Taxa de Rentabilidade (ROI) do projeto situa-se nos ${fin.roiPercent.toFixed(1)}%, confirmando a viabilidade financeira da solução.`;
};

// -- Layout Components --

const ReportPage = ({ title, number, icon: Icon, children, analysisText }: any) => (
    <div className="h-auto min-h-[297mm] print:h-screen print:min-h-0 print:overflow-hidden p-12 bg-white flex flex-col justify-between relative shadow-sm print:shadow-none mb-8 print:mb-0 break-after-page">
        <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-8">
                <div className="flex items-center gap-3">
                    <div className="bg-slate-800 text-white w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg">
                        {number}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">{title}</h2>
                </div>
                <div className="flex items-center gap-4">
                     <Logo className="h-8 w-auto opacity-50 grayscale text-slate-500" />
                     <div className="text-slate-300">
                        {Icon && <Icon size={32} />}
                     </div>
                </div>
            </div>
            
            {/* Content */}
            <div className="space-y-6">
                {children}
            </div>
        </div>

        {/* Footer / Analysis (Only if text provided) */}
        {analysisText && (
        <div className="mt-auto pt-8">
            <div className="bg-slate-50 border-l-4 border-blue-600 p-6 rounded-r-lg">
                <h4 className="font-bold text-blue-900 text-xs uppercase mb-2 flex items-center gap-2">
                    <FileText size={14}/> Análise Técnica do Capítulo
                </h4>
                <p className="text-justify text-slate-700 text-sm leading-relaxed">
                    {analysisText}
                </p>
            </div>
            {/* Page Number Placeholder (Optional) */}
            <div className="text-right text-xs text-slate-400 mt-4">
                Página {number + 2}
            </div>
        </div>
        )}
        
        {!analysisText && (
             <div className="mt-auto text-right text-xs text-slate-400">
                K-PVPROSIM Report
             </div>
        )}
    </div>
);

export const ReportView: React.FC<ReportViewProps> = ({ project }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
  const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
  const battery = BATTERIES_DB.find(b => b.id === project.systemConfig.selectedBatteryId);
  const inverterCount = project.systemConfig.inverterCount || 1;
  const batteryCount = project.systemConfig.batteryCount || 1;
  
  const totalPanels = project.roofSegments.reduce((sum, seg) => sum + seg.panelsCount, 0);
  const installedPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;
  
  // Area Calculation
  const singlePanelAreaM2 = (panel ? (panel.widthMm * panel.heightMm) : 0) / 1000000;
  const totalPanelAreaM2 = singlePanelAreaM2 * totalPanels;
  const totalRoofAreaM2 = project.roofSegments.reduce((sum, seg) => {
      if (seg.isPolygon && seg.vertices) {
          return sum + (seg.width * seg.height); // Simplified
      }
      return sum + (seg.width * seg.height);
  }, 0);

  // Inverter Area (Assuming Wall Mount: Width x Height)
  const totalInvAreaM2 = inverter?.dimensions 
      ? (inverter.dimensions.width * inverter.dimensions.height * inverterCount) / 1000000 
      : 0;

  // Battery Area (Assuming Floor Standing: Width x Depth)
  const totalBatAreaM2 = battery?.dimensions 
      ? (battery.dimensions.width * battery.dimensions.depth * batteryCount) / 1000000 
      : 0;

  const elec = calculateStringing(project);
  const budgetItems = calculateDetailedBudget(project);
  const financials = calculateFinancials(project);
  const sim = project.simulationResult;

  const subtotal = budgetItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalBudget = subtotal * 1.06; // VAT

  // Data Prep
  const climateData = project.climateData;
  const totalAnnualRad = climateData 
      ? Math.round(climateData.hourlyRad.reduce((a, b) => a + b, 0) / 1000) 
      : 0;

  const climateChartData = climateData ? MONTH_NAMES.map((m, i) => ({
      name: m,
      temp: parseFloat(climateData.monthlyTemp[i].toFixed(1)),
      rad: parseFloat(climateData.monthlyRad[i].toFixed(1)),
      hum: parseFloat(climateData.monthlyHum[i].toFixed(0))
  })) : [];
  
  // Consumption Data Generation
  const guaranteedHourlyLoad = useMemo(() => {
     if (project.loadProfile.hourlyData && project.loadProfile.hourlyData.length === 8760) {
         return project.loadProfile.hourlyData;
     }
     const data: number[] = [];
     for (let d = 0; d < 365; d++) {
        const isWeekend = (d % 7) === 0 || (d % 7) === 6;
        for (let h = 0; h < 24; h++) {
           const base = project.loadProfile.baseLoadKw;
           const peak = project.loadProfile.peakLoadKw;
           let factor = 0.1;
           if (!isWeekend) {
               if ((h >= 7 && h <= 9) || (h >= 18 && h <= 22)) factor = 0.9;
               else if (h > 9 && h < 18) factor = 0.4;
           } else {
               if (h > 9 && h < 22) factor = 0.6;
           }
           data.push(base + (peak - base) * factor);
        }
     }
     return data;
  }, [project.loadProfile]);

  const dailyLoadProfile = useMemo(() => {
       const hours = new Array(24).fill(0);
       const counts = new Array(24).fill(0);
       
       guaranteedHourlyLoad.forEach((val, idx) => {
           const h = idx % 24;
           hours[h] += val;
           counts[h]++;
       });
       
       return hours.map((sum, h) => ({ 
           hour: `${h}h`, 
           load: parseFloat((sum / counts[h]).toFixed(2)) 
       }));
  }, [guaranteedHourlyLoad]);

  const loadMonthlyData = useMemo(() => {
      return MONTH_NAMES.map((m, i) => {
          const start = Math.floor(i * 30.41 * 24);
          const end = Math.floor((i+1) * 30.41 * 24);
          const slice = guaranteedHourlyLoad.slice(start, Math.min(end, guaranteedHourlyLoad.length));
          const sum = slice.reduce((a,b)=>a+b,0);
          return { name: m, load: Math.round(sum) };
      });
  }, [guaranteedHourlyLoad]);

  // Annual Daily Data for Report Chart
  const annualDailyLoad = useMemo(() => {
      const data = [];
      for (let d = 0; d < 365; d++) {
          let sum = 0;
          for (let h = 0; h < 24; h++) {
              sum += guaranteedHourlyLoad[d*24 + h] || 0;
          }
          // Downsample slightly for print rendering if needed, but 365 points is fine for AreaChart
          data.push({ day: d, load: sum });
      }
      return data;
  }, [guaranteedHourlyLoad]);

  // ----------------------------------------

  const simMonthlyData = sim ? sim.hourlyProduction.reduce((acc: any[], val, idx) => {
      const monthIdx = Math.floor(idx / 730.5) % 12;
      if (!acc[monthIdx]) acc[monthIdx] = { name: idx, prod: 0, load: 0, self: 0 };
      acc[monthIdx].prod += val;
      acc[monthIdx].load += sim.hourlyLoad[idx];
      acc[monthIdx].self += (val - sim.hourlyGridExport[idx]);
      return acc;
  }, []).map((d: any, i: number) => ({
      name: MONTH_NAMES[i],
      Produção: Math.round(d.prod),
      Consumo: Math.round(d.load),
      Autoconsumo: Math.round(d.self)
  })) : [];

  const injectionRatio = sim && sim.totalProductionKwh > 0 ? (sim.totalExportKwh / sim.totalProductionKwh) : 0;
  
  const selfConsumedKwh = sim ? sim.totalProductionKwh - sim.totalExportKwh : 0;
  const selfSufficiencyKwh = sim ? sim.totalLoadKwh - sim.totalImportKwh : 0;

  // -- Annual Energy Sources Data --
  const annualSources = {
      direct: sim?.hourlySelfConsumptionDirect?.reduce((a,b)=>a+b,0) || 0,
      battery: sim?.hourlySelfConsumptionBattery?.reduce((a,b)=>a+b,0) || 0,
      grid: sim?.totalImportKwh || 0,
      total: sim?.totalLoadKwh || 0
  };

  const monthlySourcesData = sim ? MONTH_NAMES.map((m, i) => {
      // Simplified approximation for monthly indexing
      const start = Math.floor(i * 30.41 * 24);
      const end = Math.floor((i+1) * 30.41 * 24);
      
      const sliceDirect = sim.hourlySelfConsumptionDirect?.slice(start, end).reduce((a,b)=>a+b,0) || 0;
      const sliceBattery = sim.hourlySelfConsumptionBattery?.slice(start, end).reduce((a,b)=>a+b,0) || 0;
      const sliceGrid = sim.hourlyGridImport?.slice(start, end).reduce((a,b)=>a+b,0) || 0;

      return {
          name: m,
          Direct: Math.round(sliceDirect),
          Battery: Math.round(sliceBattery),
          Grid: Math.round(sliceGrid)
      };
  }) : [];

  const svgWidth = 600;
  const startX = 50;
  const startY = 20;

  // -- EXPORT HANDLERS --

  const handleExportHTML = () => {
      if (!reportRef.current) return;
      const htmlContent = reportRef.current.innerHTML;
      const doc = `
        <!DOCTYPE html>
        <html lang="pt-PT">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Relatório - ${project.settings.name}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    .break-after-page { page-break-after: always; }
                    .break-before-page { page-break-before: always; }
                }
                body { margin: 0; background: #f3f4f6; }
                .report-container { max-width: 210mm; margin: 0 auto; background: white; }
            </style>
        </head>
        <body>
            <div class="report-container">
                ${htmlContent}
            </div>
        </body>
        </html>
      `;
      const blob = new Blob([doc], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Relatorio_${project.settings.name.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportWord = () => {
      if (!reportRef.current) return;
      // Word does not support Tailwind scripts. We need basic inline CSS or style block.
      const htmlContent = reportRef.current.innerHTML;
      const doc = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <title>Relatório ${project.settings.name}</title>
            <style>
                body { font-family: 'Times New Roman', serif; }
                h1 { font-size: 24pt; font-weight: bold; color: #1e3a8a; }
                h2 { font-size: 18pt; font-weight: bold; color: #1e293b; border-bottom: 2px solid #334155; margin-bottom: 10px; }
                h3 { font-size: 14pt; font-weight: bold; color: #334155; }
                p { font-size: 11pt; line-height: 1.5; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                th { background-color: #f1f5f9; color: #334155; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .bg-slate-900 { background-color: #0f172a; color: white; padding: 20px; }
                .text-white { color: white; }
                img { max-width: 100%; height: auto; }
            </style>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
      `;
      const blob = new Blob([doc], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Relatorio_${project.settings.name.replace(/\s+/g, '_')}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="max-w-[210mm] mx-auto bg-gray-100 print:bg-white text-slate-900 leading-relaxed font-sans pb-20 print:pb-0">
        
        {/* Floating Toolbar */}
        <div className="fixed bottom-8 right-8 print:hidden z-50 flex flex-col gap-3 items-end">
            <div className="bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex flex-col gap-2">
                <button 
                    onClick={handleExportWord} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50 rounded transition-colors w-full justify-end"
                    title="Exportar para Word (Layout Simplificado)"
                >
                    Exportar Word (.doc) <FileType size={18} />
                </button>
                <button 
                    onClick={handleExportHTML} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-50 rounded transition-colors w-full justify-end"
                    title="Exportar HTML (Layout Original)"
                >
                    Exportar HTML <FileCode size={18} />
                </button>
            </div>
            <button 
                onClick={() => window.print()} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-full shadow-xl flex items-center gap-2 font-bold transition-transform hover:scale-105"
                title="Imprimir ou Guardar como PDF"
            >
                <Printer /> Imprimir / PDF
            </button>
        </div>

        {/* REPORT CONTENT REF */}
        <div ref={reportRef}>

        {/* --- PAGE 1: CAPA --- */}
        <div className="h-auto min-h-[297mm] print:h-screen print:min-h-0 print:overflow-hidden p-12 flex flex-col justify-between bg-gradient-to-br from-slate-900 to-slate-800 text-white print:shadow-none shadow-lg mb-8 print:mb-0 relative overflow-hidden break-after-page">
            <div className="absolute top-0 left-0 w-full h-4 bg-blue-600"></div>
            <div className="absolute -right-20 -top-20 w-96 h-96 bg-blue-600/20 rounded-full opacity-50 blur-3xl"></div>
            
            <div className="absolute top-12 right-12 z-20">
                <Logo className="h-16 w-auto text-white" />
            </div>

            <div className="mt-32 relative z-10">
                <div className="text-blue-400 font-bold tracking-[0.3em] uppercase mb-4 text-sm">Estudo de Viabilidade</div>
                <h1 className="text-6xl font-extrabold text-white mb-8 leading-tight">
                    Projeto <br/>Fotovoltaico
                </h1>
                <div className="w-32 h-2 bg-yellow-400 mb-12"></div>
                
                <div className="space-y-8 text-lg bg-white/10 p-8 rounded-xl backdrop-blur-sm border border-white/10">
                    <div>
                        <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Cliente</p>
                        <p className="text-3xl font-bold text-white">{project.settings.clientName}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Localização</p>
                        <p className="text-xl text-slate-200">{project.settings.address}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Capacidade</p>
                        <p className="text-xl text-slate-200 font-medium">{installedPowerKw.toFixed(2)} kWp</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-end border-t border-slate-600 pt-8">
                <div className="text-left">
                    <p className="text-slate-400 font-medium">www.koelho2000.com</p>
                </div>
                <div className="text-right">
                    <p className="font-bold text-white text-xl">K-PVPROSIM</p>
                    <p className="text-slate-400">{new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="text-slate-500 text-xs mt-2">Versão {APP_VERSION}</p>
                </div>
            </div>
        </div>

        {/* --- PAGE 2: INDICE & RESUMO --- */}
        <div className="h-auto min-h-[297mm] print:h-screen print:min-h-0 print:overflow-hidden p-12 bg-white flex flex-col justify-between break-after-page shadow-sm print:shadow-none mb-8 print:mb-0">
            <div>
                <h2 className="text-3xl font-bold text-slate-800 mb-12 border-b-2 border-slate-800 pb-4">Índice do Relatório</h2>
                <ul className="space-y-6 text-lg mb-16 px-4">
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><MapPin size={18} className="text-slate-400"/> Localização e Dados Climáticos</span> 
                        <span className="font-bold text-slate-600">3</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><BarChart3 size={18} className="text-slate-400"/> Perfil de Consumo</span> 
                        <span className="font-bold text-slate-600">4</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><Sun size={18} className="text-slate-400"/> Equipamento Proposto</span> 
                        <span className="font-bold text-slate-600">5</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><Zap size={18} className="text-slate-400"/> Diagrama Elétrico (Unifilar)</span> 
                        <span className="font-bold text-slate-600">6</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><Zap size={18} className="text-slate-400"/> Matriz de Strings</span> 
                        <span className="font-bold text-slate-600">7</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><TrendingUp size={18} className="text-slate-400"/> Resultados da Simulação</span> 
                        <span className="font-bold text-slate-600">8</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><TrendingUp size={18} className="text-slate-400"/> Análise de Fontes de Energia</span> 
                        <span className="font-bold text-slate-600">9</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><FileText size={18} className="text-slate-400"/> Orçamento Detalhado</span> 
                        <span className="font-bold text-slate-600">10</span>
                    </li>
                    <li className="flex justify-between items-center border-b border-dotted border-slate-300 pb-2">
                        <span className="flex items-center gap-3"><ShieldCheck size={18} className="text-slate-400"/> Análise Financeira</span> 
                        <span className="font-bold text-slate-600">11</span>
                    </li>
                </ul>

                <h2 className="text-2xl font-bold text-slate-800 mb-6">Resumo Executivo</h2>
                <div className="bg-slate-50 p-8 rounded-lg border border-slate-200 shadow-sm">
                    <p className="mb-8 text-justify leading-relaxed text-slate-700">
                        O presente estudo analisa a implementação de uma unidade de produção fotovoltaica para <strong>{project.settings.clientName}</strong>. 
                        A solução técnica foi dimensionada para maximizar a rentabilidade financeira e a independência energética. 
                        Com uma potência de <strong>{installedPowerKw.toFixed(2)} kWp</strong>, o sistema evitará a emissão de toneladas de CO2 e reduzirá significativamente a fatura elétrica mensal.
                    </p>
                    <div className="grid grid-cols-3 gap-8 text-center">
                        <div className="p-4 bg-white rounded shadow-sm border">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Autonomia</p>
                            <p className="text-3xl font-bold text-blue-600 mt-2">{sim ? (sim.autonomyRatio * 100).toFixed(0) : 0}%</p>
                        </div>
                        <div className="p-4 bg-white rounded shadow-sm border">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Payback</p>
                            <p className="text-3xl font-bold text-green-600 mt-2">{financials.paybackPeriodYears.toFixed(1)} <span className="text-sm text-slate-400">Anos</span></p>
                        </div>
                        <div className="p-4 bg-white rounded shadow-sm border">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Poupança (15A)</p>
                            <p className="text-3xl font-bold text-slate-700 mt-2">{financials.totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="text-right text-xs text-slate-400">Página 2</div>
        </div>

        {/* --- PAGE 3: LOCALIZAÇÃO --- */}
        <ReportPage title="Localização e Clima" number="1" icon={MapPin} analysisText={generateLocationText(project)}>
            <div className="grid grid-cols-2 gap-8 mb-8">
                 <div className="space-y-4">
                     <div className="bg-slate-50 p-4 rounded border">
                         <h4 className="font-bold text-sm text-slate-600 mb-2">Dados Geográficos</h4>
                         <ul className="text-sm space-y-2">
                             <li className="flex justify-between"><span>Concelho:</span> <span className="font-bold">{project.settings.address}</span></li>
                             <li className="flex justify-between"><span>Latitude:</span> <span className="font-bold">{project.settings.latitude.toFixed(4)}°</span></li>
                             <li className="flex justify-between"><span>Longitude:</span> <span className="font-bold">{project.settings.longitude.toFixed(4)}°</span></li>
                             <li className="flex justify-between"><span>Fonte Dados:</span> <span className="font-bold">{project.settings.climateDataSource === 'epw' ? 'EPW' : 'Sintético'}</span></li>
                         </ul>
                     </div>
                     {/* GHI Card */}
                     <div className="bg-orange-50 p-4 rounded border border-orange-200">
                         <h4 className="font-bold text-sm text-orange-800 mb-1 flex items-center gap-2"><Sun size={16}/> Produtividade Solar (GHI)</h4>
                         <p className="text-3xl font-extrabold text-orange-600">{totalAnnualRad.toLocaleString()} <span className="text-sm font-medium text-slate-600">kWh/m²/ano</span></p>
                     </div>
                 </div>
                 
                 <div className="h-full min-h-[14rem] border rounded p-2 flex flex-col">
                    <h5 className="text-center text-xs font-bold text-slate-500 mb-2">Temperatura Média & Radiação Global</h5>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={climateChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" interval={0} fontSize={10} />
                                <YAxis yAxisId="left" orientation="left" stroke="#ef4444" fontSize={10} label={{ value: '°C', angle: -90, position: 'insideLeft' }}/>
                                <YAxis yAxisId="right" orientation="right" stroke="#eab308" fontSize={10} label={{ value: 'kWh/m²', angle: 90, position: 'insideRight' }}/>
                                <Legend wrapperStyle={{fontSize: '10px'}}/>
                                <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#ef4444" dot={false} strokeWidth={2} />
                                <Area yAxisId="right" type="monotone" dataKey="rad" name="Radiação (kWh/m²)" fill="#fef08a" stroke="#eab308" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                 </div>
            </div>

            <div className="overflow-hidden border rounded">
                <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-slate-100 font-bold text-slate-600">
                        <tr>
                            <th className="p-2 text-left">Parâmetro</th>
                            {MONTH_NAMES.map(m => <th key={m} className="p-2 border-l">{m.substring(0,3)}</th>)}
                            <th className="p-2 border-l bg-blue-100 font-bold">Média</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr>
                            <td className="p-2 font-medium text-left bg-slate-50">Temp (°C)</td>
                            {climateChartData.map((d,i) => <td key={i} className="p-2 border-l">{d.temp}</td>)}
                            <td className="p-2 border-l bg-blue-50 font-bold">{(climateChartData.reduce((a,b)=>a+b.temp,0)/12).toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td className="p-2 font-medium text-left bg-slate-50">Rad (kWh)</td>
                            {climateChartData.map((d,i) => <td key={i} className="p-2 border-l">{d.rad}</td>)}
                            <td className="p-2 border-l bg-blue-50 font-bold">{(climateChartData.reduce((a,b)=>a+b.rad,0)/12).toFixed(1)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </ReportPage>

        {/* --- PAGE 4: CONSUMO --- */}
        <ReportPage title="Perfil de Consumo" number="2" icon={BarChart3} analysisText={generateConsumptionText(project)}>
            <div className="bg-slate-50 p-4 rounded border mb-6 flex justify-around text-center">
                 <div>
                     <p className="text-xs text-slate-500 font-bold uppercase">Consumo Anual</p>
                     <p className="text-2xl font-bold text-slate-800">{project.loadProfile.annualConsumptionKwh.toLocaleString()} kWh</p>
                 </div>
                 <div>
                     <p className="text-xs text-slate-500 font-bold uppercase">Potência Pico</p>
                     <p className="text-2xl font-bold text-slate-800">{project.loadProfile.peakLoadKw} kW</p>
                 </div>
                 <div>
                     <p className="text-xs text-slate-500 font-bold uppercase">Potência Base</p>
                     <p className="text-2xl font-bold text-slate-800">{project.loadProfile.baseLoadKw} kW</p>
                 </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="h-48 border rounded p-4 shadow-sm">
                    <h5 className="text-center text-sm font-bold text-slate-500 mb-2">Perfil Diário Médio (kW)</h5>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyLoadProfile}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="hour" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="load" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{r: 4}} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="h-48 border rounded p-4 shadow-sm">
                    <h5 className="text-center text-sm font-bold text-slate-500 mb-2">Sazonalidade Mensal (kWh)</h5>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={loadMonthlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" fontSize={10} interval={0} tickLine={false} axisLine={false}/>
                            <YAxis fontSize={10} tickLine={false} axisLine={false}/>
                            <Tooltip />
                            <Bar dataKey="load" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* NEW: Annual Hourly Chart (Daily) */}
            <div className="h-48 border rounded p-4 shadow-sm mt-4">
                <h5 className="text-center text-sm font-bold text-slate-500 mb-2">Evolução Anual do Consumo (kWh/dia)</h5>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={annualDailyLoad}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => val % 30 === 0 ? val : ''}/>
                        <YAxis fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip labelFormatter={(label) => `Dia ${label}`} />
                        <Area type="monotone" dataKey="load" stroke="#f59e0b" fill="#fcd34d" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </ReportPage>

        {/* --- PAGE 5: EQUIPAMENTO --- */}
        <ReportPage title="Equipamento Proposto" number="3" icon={Sun} analysisText={generateEquipmentText(project)}>
             <div className="space-y-6">
                {/* Modules */}
                <div className="flex gap-6 border p-6 rounded-xl bg-slate-50 shadow-sm items-start">
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0 text-blue-600">
                        <Sun size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Módulos Fotovoltaicos</h3>
                        <p className="text-blue-600 font-medium mb-3">{totalPanels}x {panel?.manufacturer} {panel?.model}</p>
                        <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                            <p>Potência Unitária: <strong>{panel?.powerW} W</strong></p>
                            <p>Tecnologia: <strong>Monocristalino PERC/TOPCon</strong></p>
                            <p>Eficiência: <strong>{(panel?.efficiency! * 100).toFixed(1)} %</strong></p>
                            <p>Garantia Prod.: <strong>25 Anos</strong></p>
                        </div>
                    </div>
                </div>

                {/* Area Metrics */}
                <div className="flex gap-6 border p-6 rounded-xl bg-slate-50 shadow-sm items-start">
                    <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center shrink-0 text-purple-600">
                        <BarChart3 size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Ocupação de Área</h3>
                        <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600 mt-2">
                             <div>
                                 <p className="text-xs font-bold text-slate-400 uppercase">Área Total Painéis</p>
                                 <p className="text-xl font-bold text-slate-800">{totalPanelAreaM2.toFixed(1)} m²</p>
                             </div>
                             <div>
                                 <p className="text-xs font-bold text-slate-400 uppercase">Área Disponível</p>
                                 <p className="text-xl font-bold text-slate-800">{totalRoofAreaM2.toFixed(1)} m²</p>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Inverter */}
                <div className="flex gap-6 border p-6 rounded-xl bg-slate-50 shadow-sm items-start">
                    <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center shrink-0 text-yellow-600">
                        <Zap size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Inversor Solar</h3>
                        <p className="text-yellow-600 font-medium mb-3">{inverterCount}x {inverter?.manufacturer} {inverter?.model}</p>
                        <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                            <p>Potência AC: <strong>{inverter?.maxPowerKw} kW</strong></p>
                            <p>MPPTs: <strong>{inverter?.numMppts}</strong></p>
                            <p>Fases: <strong>{inverter?.phases === 3 ? 'Trifásico' : 'Monofásico'}</strong></p>
                            <p>Área Parede: <strong>{totalInvAreaM2.toFixed(2)} m²</strong></p>
                        </div>
                    </div>
                </div>

                {/* Battery */}
                {battery && (
                <div className="flex gap-6 border p-6 rounded-xl bg-slate-50 shadow-sm items-start">
                    <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center shrink-0 text-green-600">
                        <Battery size={32} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Baterias de Lítio</h3>
                        <p className="text-green-600 font-medium mb-3">{project.systemConfig.batteryCount||1}x {battery.manufacturer} {battery.model}</p>
                        <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                            <p>Capacidade Total: <strong>{(battery.capacityKwh * (project.systemConfig.batteryCount||1)).toFixed(1)} kWh</strong></p>
                            <p>Tecnologia: <strong>LiFePO4</strong></p>
                            <p>Potência Descarga: <strong>{battery.maxDischargeKw} kW</strong></p>
                            <p>Área Implantação: <strong>{totalBatAreaM2.toFixed(2)} m²</strong></p>
                        </div>
                    </div>
                </div>
                )}
            </div>
        </ReportPage>

        {/* --- PAGE 6: ELÉTRICO 1 - DIAGRAMA --- */}
        <ReportPage title="Diagrama Elétrico (Unifilar)" number="4A" icon={Zap} analysisText={null}>
             <div className="border border-slate-200 rounded-lg bg-slate-50/50 p-6 flex justify-center items-center h-[200mm]">
                 <svg width={svgWidth} height={Math.max(400, (elec.strings.length * 60) + 120)} className="bg-white shadow-sm border rounded scale-90 origin-top">
                      <defs>
                          <marker id="repArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                              <path d="M0,0 L0,6 L6,3 z" fill="#64748b" />
                          </marker>
                      </defs>
                      {/* Strings */}
                      {elec.strings.map((str, idx) => {
                          const y = startY + (idx * 60);
                          return (
                              <g key={idx}>
                                  <rect x={startX} y={y} width="40" height="30" fill="#e0f2fe" stroke="#0284c7" />
                                  <line x1={startX} y1={y+30} x2={startX+40} y2={y} stroke="#0284c7" />
                                  <text x={startX+20} y={y+20} textAnchor="middle" fontSize="8" fill="#0369a1">{str.numStrings}x{str.panelsPerString}</text>
                                  <line x1={startX+40} y1={y+15} x2={startX+120} y2={y+15} stroke="#334155" />
                                  <text x={startX+80} y={y+10} textAnchor="middle" fontSize="8" fill="#64748b">{elec.cables.dcStringMm2}mm²</text>
                              </g>
                          )
                      })}
                      {/* Combiner */}
                      <g transform={`translate(${startX+120}, ${startY-10})`}>
                          <rect x="0" y="0" width="60" height={(elec.strings.length * 60) + 20} rx="4" fill="none" stroke="#94a3b8" strokeDasharray="4,2" />
                          <text x="30" y="-5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#475569">Q. DC</text>
                          {elec.strings.map((_, idx) => (
                              <g key={idx}>
                                   <rect x="20" y={idx*60 + 20} width="20" height="10" fill="#ef4444" rx="2" />
                                   <text x="30" y={idx*60 + 28} textAnchor="middle" fontSize="7" fill="white">{elec.protection.dcFuseA}A</text>
                              </g>
                          ))}
                      </g>
                      {/* Inverter Lines */}
                      {elec.strings.map((_, idx) => {
                          const y = startY + (idx * 60) + 15;
                          const midY = startY + ((elec.strings.length - 1) * 30) + 15;
                          return <path key={idx} d={`M${startX+180},${y} L${startX+220},${y} L${startX+220},${midY} L${startX+250},${midY}`} fill="none" stroke="#334155" />
                      })}
                      {/* Inverter Box */}
                      <g transform={`translate(${startX+250}, ${startY + ((elec.strings.length - 1) * 30)})`}>
                          <rect x="0" y="0" width="80" height="50" fill="#fef9c3" stroke="#eab308" strokeWidth="2" rx="4" />
                          <text x="40" y="20" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#854d0e">INV</text>
                          <text x="40" y="35" textAnchor="middle" fontSize="8" fill="#854d0e">{inverterCount}x {inverter?.model}</text>
                      </g>
                      {/* AC Side */}
                      <line x1={startX+330} y1={startY+((elec.strings.length-1)*30)+25} x2={startX+400} y2={startY+((elec.strings.length-1)*30)+25} stroke="#334155" />
                      <text x={startX+365} y={startY+((elec.strings.length-1)*30)+20} textAnchor="middle" fontSize="8" fill="#64748b">{elec.cables.acMm2}mm²</text>
                      {/* AC Box */}
                      <g transform={`translate(${startX+400}, ${startY + ((elec.strings.length - 1) * 30)})`}>
                          <rect x="0" y="0" width="40" height="50" fill="none" stroke="#94a3b8" strokeDasharray="4,2" />
                          <text x="20" y="-5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#475569">Q. AC</text>
                          <rect x="10" y="15" width="20" height="20" fill="none" stroke="#2563eb" />
                          <text x="20" y="45" textAnchor="middle" fontSize="8" fill="#2563eb" fontWeight="bold">{elec.protection.acBreakerA}A</text>
                      </g>
                      {/* Grid */}
                      <line x1={startX+440} y1={startY+((elec.strings.length-1)*30)+25} x2={startX+500} y2={startY+((elec.strings.length-1)*30)+25} stroke="#334155" markerEnd="url(#repArrow)" />
                      <text x="520" y={startY+((elec.strings.length-1)*30)+28} fontSize="10" fontWeight="bold">REDE</text>
                 </svg>
            </div>
        </ReportPage>

        {/* --- PAGE 7: ELÉTRICO 2 - TABELA --- */}
        <ReportPage title="Matriz de Strings" number="4B" icon={Zap} analysisText={generateElectricalText(elec, inverter)}>
            <div className="overflow-hidden border rounded mb-8">
                <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-slate-100 font-bold text-slate-600">
                        <tr>
                            <th className="p-3 text-left">MPPT</th>
                            <th className="p-3">Strings</th>
                            <th className="p-3">Módulos</th>
                            <th className="p-3">Voc (-10°C)</th>
                            <th className="p-3">Isc Total</th>
                            <th className="p-3">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {elec.strings.map((s, i) => (
                            <tr key={i}>
                                <td className="p-3 text-left font-bold text-blue-800">MPPT {s.mpptId}</td>
                                <td className="p-3">{s.numStrings}</td>
                                <td className="p-3">{s.panelsPerString}</td>
                                <td className="p-3">{s.vocString.toFixed(0)} V</td>
                                <td className="p-3">{s.iscString.toFixed(1)} A</td>
                                <td className="p-3 text-green-600 font-bold">OK</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-50 p-4 rounded border">
                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Cablagem DC</h4>
                    <p className="text-sm flex justify-between"><span>Secção:</span> <strong>{elec.cables.dcStringMm2} mm²</strong></p>
                    <p className="text-sm flex justify-between"><span>Fusível:</span> <strong>{elec.protection.dcFuseA} A</strong></p>
                </div>
                <div className="bg-slate-50 p-4 rounded border">
                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Cablagem AC</h4>
                    <p className="text-sm flex justify-between"><span>Secção:</span> <strong>{elec.cables.acMm2} mm²</strong></p>
                    <p className="text-sm flex justify-between"><span>Disjuntor:</span> <strong>{elec.protection.acBreakerA} A</strong></p>
                </div>
            </div>
        </ReportPage>

        {/* --- PAGE 8: SIMULAÇÃO --- */}
        <ReportPage title="Resultados da Simulação" number="5" icon={TrendingUp} analysisText={generateSimulationText(sim)}>
            {sim ? (
                <>
                <div className="grid grid-cols-2 gap-6 mb-8">
                     <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-center">
                         <p className="text-xs font-bold text-yellow-700 uppercase mb-2">Produção Total</p>
                         <p className="text-3xl font-extrabold text-slate-800">{Math.round(sim.totalProductionKwh).toLocaleString()} <span className="text-sm font-normal text-slate-500">kWh</span></p>
                     </div>
                     <div className="bg-green-50 p-6 rounded-xl border border-green-200 text-center">
                         <p className="text-xs font-bold text-green-700 uppercase mb-2">Autoconsumo Direto</p>
                         <p className="text-3xl font-extrabold text-slate-800">
                             {(sim.selfConsumptionRatio*100).toFixed(1)} <span className="text-sm font-normal text-slate-500">%</span>
                         </p>
                         <p className="text-sm font-medium text-green-800 mt-1">{Math.round(selfConsumedKwh).toLocaleString()} kWh</p>
                     </div>
                     <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 text-center">
                         <p className="text-xs font-bold text-blue-700 uppercase mb-2">Autonomia (Independência)</p>
                         <p className="text-3xl font-extrabold text-slate-800">{(sim.autonomyRatio*100).toFixed(1)} <span className="text-sm font-normal text-slate-500">%</span></p>
                         <p className="text-sm font-medium text-blue-800 mt-1">{Math.round(selfSufficiencyKwh).toLocaleString()} kWh</p>
                     </div>
                     <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 text-center">
                         <p className="text-xs font-bold text-orange-700 uppercase mb-2">Injeção na Rede</p>
                         <p className="text-3xl font-extrabold text-slate-800">{(injectionRatio*100).toFixed(1)} <span className="text-sm font-normal text-slate-500">%</span></p>
                         <p className="text-sm font-medium text-orange-800 mt-1">{Math.round(sim.totalExportKwh).toLocaleString()} kWh</p>
                     </div>
                </div>

                <div className="h-96 w-full border p-6 rounded-xl bg-white shadow-sm">
                     <h4 className="text-center font-bold text-slate-600 mb-6">Balanço Energético Mensal (kWh)</h4>
                     <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={simMonthlyData} barGap={0}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} />
                             <XAxis dataKey="name" fontSize={12} interval={0} tickLine={false} axisLine={false} />
                             <YAxis fontSize={12} tickLine={false} axisLine={false} />
                             <Legend wrapperStyle={{paddingTop: '20px'}} />
                             <Tooltip cursor={{fill: 'transparent'}} />
                             <Bar dataKey="Produção" fill="#eab308" radius={[4,4,0,0]} maxBarSize={40} />
                             <Bar dataKey="Consumo" fill="#94a3b8" radius={[4,4,0,0]} maxBarSize={40} />
                             <Bar dataKey="Autoconsumo" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={40} />
                         </BarChart>
                     </ResponsiveContainer>
                </div>
                </>
            ) : <div className="text-center p-20 text-slate-400 italic border rounded">Simulação não executada.</div>}
        </ReportPage>

        {/* --- PAGE 9: FONTES DE ENERGIA --- */}
        <ReportPage title="Análise de Fontes de Energia" number="5B" icon={BarChart3} analysisText={generateEnergySourcesText(annualSources)}>
            {sim ? (
            <div className="space-y-8">
                {/* Annual Summary Table */}
                <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="bg-slate-100 p-4 border-b">
                        <h4 className="font-bold text-slate-700">Quadro Resumo de Consumo (Anual)</h4>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600">
                                <th className="p-4 font-semibold">Fonte de Energia</th>
                                <th className="p-4 text-right font-semibold">Energia (kWh)</th>
                                <th className="p-4 text-right font-semibold">% do Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            <tr>
                                <td className="p-4 flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Fotovoltaico Direto</td>
                                <td className="p-4 text-right font-bold text-slate-700">{Math.round(annualSources.direct).toLocaleString()}</td>
                                <td className="p-4 text-right text-slate-500">{((annualSources.direct / annualSources.total)*100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td className="p-4 flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Baterias (Descarga)</td>
                                <td className="p-4 text-right font-bold text-slate-700">{Math.round(annualSources.battery).toLocaleString()}</td>
                                <td className="p-4 text-right text-slate-500">{((annualSources.battery / annualSources.total)*100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td className="p-4 flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Rede (Importação)</td>
                                <td className="p-4 text-right font-bold text-slate-700">{Math.round(annualSources.grid).toLocaleString()}</td>
                                <td className="p-4 text-right text-slate-500">{((annualSources.grid / annualSources.total)*100).toFixed(1)}%</td>
                            </tr>
                            <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                                <td className="p-4">TOTAL CONSUMO</td>
                                <td className="p-4 text-right">{Math.round(annualSources.total).toLocaleString()}</td>
                                <td className="p-4 text-right">100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Monthly Stacked Chart */}
                <div className="h-96 w-full border p-6 rounded-xl bg-white shadow-sm">
                        <h4 className="text-center font-bold text-slate-600 mb-6">Origem do Consumo Mensal (kWh)</h4>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlySourcesData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" fontSize={12} interval={0} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                <Bar dataKey="Direct" name="Solar Direto" stackId="a" fill="#22c55e" />
                                <Bar dataKey="Battery" name="Bateria" stackId="a" fill="#3b82f6" />
                                <Bar dataKey="Grid" name="Rede" stackId="a" fill="#ef4444" />
                            </BarChart>
                        </ResponsiveContainer>
                </div>
            </div>
            ) : <div className="text-center p-20 text-slate-400 italic">Simulação não executada.</div>}
        </ReportPage>

        {/* --- PAGE 10: ORÇAMENTO --- */}
        <ReportPage title="Orçamento Detalhado" number="6" icon={FileText} analysisText={generateBudgetText(totalBudget)}>
             <table className="w-full text-sm border-collapse mb-8">
                  <thead>
                      <tr className="bg-slate-800 text-white">
                          <th className="py-3 px-4 text-left rounded-tl-lg">Descrição</th>
                          <th className="py-3 px-4 text-center">Qtd.</th>
                          <th className="py-3 px-4 text-right">Preço Un.</th>
                          <th className="py-3 px-4 text-right rounded-tr-lg">Total</th>
                      </tr>
                  </thead>
                  <tbody>
                      {['Modules', 'Inverter', 'Battery', 'Structure', 'Electrical', 'Labor', 'Services'].map(cat => {
                          const items = budgetItems.filter(i => i.category === cat);
                          if (items.length === 0) return null;
                          return (
                              <React.Fragment key={cat}>
                                  <tr className="bg-slate-100 border-b border-white"><td colSpan={4} className="py-2 px-4 font-bold text-xs uppercase text-slate-500 tracking-wider">{cat}</td></tr>
                                  {items.map((item, idx) => (
                                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                                          <td className="py-3 px-4">{item.description}</td>
                                          <td className="py-3 px-4 text-center font-medium text-slate-500">{item.quantity} {item.unit}</td>
                                          <td className="py-3 px-4 text-right text-slate-600">{item.unitPrice.toLocaleString('pt-PT', {minimumFractionDigits: 2})}€</td>
                                          <td className="py-3 px-4 text-right font-bold text-slate-700">{item.totalPrice.toLocaleString('pt-PT', {minimumFractionDigits: 2})}€</td>
                                      </tr>
                                  ))}
                              </React.Fragment>
                          )
                      })}
                  </tbody>
             </table>
             
             <div className="flex justify-end">
                 <div className="w-1/2 bg-slate-50 p-6 rounded-xl">
                      <div className="flex justify-between mb-2 text-slate-600">
                          <span>Subtotal</span>
                          <span className="font-bold">{subtotal.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                      </div>
                      <div className="flex justify-between mb-4 text-slate-600">
                          <span>IVA (6%)</span>
                          <span className="font-bold">{(subtotal * 0.06).toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                      </div>
                      <div className="flex justify-between pt-4 border-t border-slate-300 text-xl font-extrabold text-blue-900">
                          <span>TOTAL</span>
                          <span>{totalBudget.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                      </div>
                 </div>
             </div>
        </ReportPage>

        {/* --- PAGE 11: FINANCEIRO --- */}
        <ReportPage title="Análise Financeira" number="7" icon={ShieldCheck} analysisText={generateFinancialText(financials)}>
             
             <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-center">
                    <p className="text-xs font-bold text-green-700 uppercase mb-2">Poupança Acumulada (15 Anos)</p>
                    <p className="text-2xl font-extrabold text-slate-800">{financials.totalSavings15YearsEur.toLocaleString('pt-PT', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Payback Estimado</p>
                    <p className="text-2xl font-extrabold text-slate-800">{financials.paybackPeriodYears.toFixed(1)} <span className="text-sm font-normal text-slate-500">Anos</span></p>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-center">
                    <p className="text-xs font-bold text-blue-700 uppercase mb-2">ROI (Retorno)</p>
                    <p className="text-2xl font-extrabold text-slate-800">{financials.roiPercent.toFixed(1)} <span className="text-sm font-normal text-slate-500">%</span></p>
                </div>
            </div>

             <div className="bg-white p-6 rounded-xl border shadow-sm mb-8">
                 <h3 className="font-bold text-slate-800 mb-6 text-center">Fluxo de Caixa Acumulado (15 Anos)</h3>
                 <div className="h-64">
                     <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={financials.yearlyData}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} />
                             <XAxis dataKey="year" fontSize={12} tickLine={false} axisLine={false} />
                             <YAxis fontSize={12} tickLine={false} axisLine={false} />
                             <Tooltip formatter={(value: number) => value.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})} cursor={{fill: 'transparent'}} />
                             <Bar dataKey="cumulativeCashflowEur" name="Cashflow Acumulado" fill="#22c55e" radius={[4, 4, 0, 0]} />
                         </BarChart>
                     </ResponsiveContainer>
                 </div>
             </div>

             <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl">
                 <h4 className="font-bold text-blue-900 mb-4">Notas Técnicas Finais</h4>
                 <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700 text-justify">
                     <li>Os valores apresentados são estimativas baseadas em simulação computacional avançada, considerando dados meteorológicos típicos.</li>
                     <li>A produção real pode variar devido a condições atmosféricas anómalas, sujidade acumulada nos módulos ou sombreamentos não previstos.</li>
                     <li>O cálculo financeiro assume a manutenção do quadro legislativo atual e as taxas de inflação energética configuradas no projeto.</li>
                 </ul>
             </div>
        </ReportPage>

        {/* --- BACK COVER --- */}
        <div className="h-auto min-h-[297mm] print:h-screen print:min-h-0 print:overflow-hidden relative p-12 flex flex-col justify-center items-center bg-slate-900 text-white break-after-page print:shadow-none shadow-lg">
             <h1 className="text-4xl font-bold mb-12 tracking-wide text-white">Energia para o Futuro.</h1>
             
             <div className="w-24 h-1 bg-blue-500 mb-12"></div>
             
             <div className="text-center space-y-6 text-slate-300">
                 <div>
                    <p className="text-2xl font-bold text-white mb-2">Koelho2000</p>
                    <p className="font-light tracking-widest text-sm uppercase text-slate-400">Soluções de Engenharia</p>
                 </div>
                 
                 <div className="pt-8 space-y-2 font-medium text-slate-200">
                     <p>www.koelho2000.com</p>
                     <p>+351 934 021 666</p>
                     <p>koelho2000@gmail.com</p>
                 </div>
             </div>

             <div className="absolute bottom-12 text-[10px] text-slate-600 uppercase tracking-widest">
                 Relatório Gerado Automaticamente por K-PVPROSIM {APP_VERSION}
             </div>
        </div>

        </div> {/* End Ref */}

        {/* Floating Export Toolbar */}
        <div className="fixed bottom-8 right-8 print:hidden z-50 flex flex-col gap-3 items-end">
            <div className="bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex flex-col gap-2">
                <button 
                    onClick={handleExportWord} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50 rounded transition-colors w-full justify-end"
                    title="Exportar para Word (Layout Simplificado)"
                >
                    Exportar Word (.doc) <FileType size={18} />
                </button>
                <button 
                    onClick={handleExportHTML} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-50 rounded transition-colors w-full justify-end"
                    title="Exportar HTML (Layout Original)"
                >
                    Exportar HTML <FileCode size={18} />
                </button>
            </div>
            <button 
                onClick={() => window.print()} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-full shadow-xl flex items-center gap-2 font-bold transition-transform hover:scale-105"
                title="Imprimir ou Guardar como PDF"
            >
                <Printer /> Imprimir / PDF
            </button>
        </div>

    </div>
  );
};
