import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line } from 'recharts';
import { SimulationResult } from '../types';
import { MONTH_NAMES } from '../constants';
import { Download } from 'lucide-react';

interface SimulationChartsProps {
  result: SimulationResult | null;
}

export const SimulationCharts: React.FC<SimulationChartsProps> = ({ result }) => {
  const [chartTab, setChartTab] = useState<'monthly' | 'dailyAvg' | 'annual' | 'sources'>('monthly');
  const [dailySubTab, setDailySubTab] = useState<'annual' | 'seasonal' | 'weektype'>('annual');
  const [sourceDay, setSourceDay] = useState<number | null>(null); // null = average

  // Hooks must always run. Do not return early before hooks.

  const downloadChartData = (data: any[], filename: string) => {
      if (!data || data.length === 0) return;
      const headers = Object.keys(data[0]);
      const csvContent = "data:text/csv;charset=utf-8," + 
          [headers.join(','), ...data.map(row => headers.map(h => row[h]).join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // 1. Monthly Data
  const monthlyData = useMemo(() => {
    if (!result) return [];
    
    const data = MONTH_NAMES.map(m => ({ 
        name: m, 
        production: 0, 
        consumption: 0, 
        gridImport: 0, 
        gridExport: 0,
        direct: 0,
        battery: 0
    }));
    
    result.hourlyProduction.forEach((val, idx) => {
      const day = Math.floor(idx / 24);
      const monthIdx = Math.floor(day / 30.5) % 12; // Approx
      if (data[monthIdx]) {
        data[monthIdx].production += val;
        data[monthIdx].consumption += result.hourlyLoad[idx];
        data[monthIdx].gridImport += result.hourlyGridImport[idx];
        data[monthIdx].gridExport += result.hourlyGridExport[idx];
        
        if (result.hourlySelfConsumptionDirect) data[monthIdx].direct += result.hourlySelfConsumptionDirect[idx];
        if (result.hourlySelfConsumptionBattery) data[monthIdx].battery += result.hourlySelfConsumptionBattery[idx];
      }
    });

    return data.map(d => ({
        ...d,
        production: Math.round(d.production),
        consumption: Math.round(d.consumption),
        gridImport: Math.round(d.gridImport),
        gridExport: Math.round(d.gridExport),
        direct: Math.round(d.direct),
        battery: Math.round(d.battery),
    }));
  }, [result]);

  // 2. Average Daily Profiles (Annual, Seasonal, Weekday)
  const dailyProfiles = useMemo(() => {
      const initHour = () => ({ prod: 0, load: 0, direct: 0, battery: 0, import: 0, count: 0 });
      // Helper for safe return if no result
      if (!result) return { 
          annual: [], spring: [], summer: [], autumn: [], winter: [], weekday: [], weekend: [] 
      };

      const annual = new Array(24).fill(0).map(initHour);
      const spring = new Array(24).fill(0).map(initHour);
      const summer = new Array(24).fill(0).map(initHour);
      const autumn = new Array(24).fill(0).map(initHour);
      const winter = new Array(24).fill(0).map(initHour);
      const weekday = new Array(24).fill(0).map(initHour);
      const weekend = new Array(24).fill(0).map(initHour);

      result.hourlyProduction.forEach((prod, idx) => {
          const h = idx % 24;
          const dayOfYear = Math.floor(idx / 24);
          const month = Math.floor(dayOfYear / 30.5) % 12;
          
          const add = (arr: any[]) => {
              arr[h].prod += prod;
              arr[h].load += result.hourlyLoad[idx];
              if (result.hourlySelfConsumptionDirect) arr[h].direct += result.hourlySelfConsumptionDirect[idx];
              if (result.hourlySelfConsumptionBattery) arr[h].battery += result.hourlySelfConsumptionBattery[idx];
              arr[h].import += result.hourlyGridImport[idx];
              arr[h].count++;
          };

          add(annual);
          if (month === 11 || month === 0 || month === 1) add(winter);
          else if (month >= 2 && month <= 4) add(spring);
          else if (month >= 5 && month <= 7) add(summer);
          else add(autumn);

          if (dayOfYear % 7 < 5) add(weekday); else add(weekend);
      });

      const avg = (arr: any[]) => arr.map((x, i) => ({
          name: `${i}h`,
          production: x.count ? parseFloat((x.prod / x.count).toFixed(3)) : 0,
          load: x.count ? parseFloat((x.load / x.count).toFixed(3)) : 0,
          direct: x.count ? parseFloat((x.direct / x.count).toFixed(3)) : 0,
          battery: x.count ? parseFloat((x.battery / x.count).toFixed(3)) : 0,
          grid: x.count ? parseFloat((x.import / x.count).toFixed(3)) : 0
      }));

      return {
          annual: avg(annual),
          spring: avg(spring),
          summer: avg(summer),
          autumn: avg(autumn),
          winter: avg(winter),
          weekday: avg(weekday),
          weekend: avg(weekend)
      };

  }, [result]);

  const seasonalData = useMemo(() => {
      if (!dailyProfiles.spring || dailyProfiles.spring.length === 0) return [];
      return dailyProfiles.spring.map((h: any, i: number) => ({
          name: h.name,
          springProd: h.production,
          summerProd: dailyProfiles.summer[i].production,
          autumnProd: dailyProfiles.autumn[i].production,
          winterProd: dailyProfiles.winter[i].production,
          load: dailyProfiles.annual[i].load
      }));
  }, [dailyProfiles]);

  const weekTypeData = useMemo(() => {
      if (!dailyProfiles.weekday || dailyProfiles.weekday.length === 0) return [];
      return dailyProfiles.weekday.map((h: any, i: number) => ({
          name: h.name,
          weekdayLoad: h.load,
          weekendLoad: dailyProfiles.weekend[i].load,
          production: dailyProfiles.annual[i].production
      }));
  }, [dailyProfiles]);

  const annualDailyData = useMemo(() => {
      if (!result) return [];
      const days = [];
      for (let d = 0; d < 365; d++) {
          let dayProd = 0;
          let dayLoad = 0;
          for (let h = 0; h < 24; h++) {
              const idx = (d * 24) + h;
              dayProd += result.hourlyProduction[idx] || 0;
              dayLoad += result.hourlyLoad[idx] || 0;
          }
          days.push({
              name: `D${d+1}`,
              production: parseFloat(dayProd.toFixed(1)),
              load: parseFloat(dayLoad.toFixed(1)),
          });
      }
      return days;
  }, [result]);

  // Source Data for specific day or average
  const sourcesChartData = useMemo(() => {
      if (!result) return [];
      if (sourceDay === null) {
          // Return Annual Average (dailyProfiles.annual is already computed)
          return dailyProfiles.annual;
      } else {
          // Specific Day
          const dayIdx = Math.max(0, Math.min(364, sourceDay - 1));
          const start = dayIdx * 24;
          const data = [];
          for (let h = 0; h < 24; h++) {
              const idx = start + h;
              data.push({
                  name: `${h}h`,
                  production: result.hourlyProduction[idx],
                  load: result.hourlyLoad[idx],
                  direct: result.hourlySelfConsumptionDirect ? result.hourlySelfConsumptionDirect[idx] : 0,
                  battery: result.hourlySelfConsumptionBattery ? result.hourlySelfConsumptionBattery[idx] : 0,
                  grid: result.hourlyGridImport[idx]
              });
          }
          return data;
      }
  }, [result, sourceDay, dailyProfiles.annual]);

  const totalConsumptionBreakdown = useMemo(() => {
      if (!result) return { direct: 0, battery: 0, grid: 0, total: 0 };
      const direct = result.hourlySelfConsumptionDirect?.reduce((a,b)=>a+b,0) || 0;
      const battery = result.hourlySelfConsumptionBattery?.reduce((a,b)=>a+b,0) || 0;
      const grid = result.totalImportKwh;
      const total = direct + battery + grid;
      return { direct, battery, grid, total };
  }, [result]);

  const sourceExportData = () => {
      if (!result) return;
      const data = [];
      // Export all 8760 hours broken down
      for(let i=0; i<8760; i++){
          data.push({
              Hora: i,
              Dia: Math.floor(i/24)+1,
              Consumo_Total: result.hourlyLoad[i].toFixed(3),
              Solar_Direto: (result.hourlySelfConsumptionDirect?.[i]||0).toFixed(3),
              Bateria: (result.hourlySelfConsumptionBattery?.[i]||0).toFixed(3),
              Rede: result.hourlyGridImport[i].toFixed(3)
          });
      }
      downloadChartData(data, 'fontes_energia_horario_8760.csv');
  };

  // --- RENDER ---
  if (!result) return <div className="text-gray-500 italic text-center p-10">Execute a simulação para ver os resultados.</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200 pb-2 overflow-x-auto">
          <button onClick={() => setChartTab('monthly')} className={`pb-2 px-2 font-medium whitespace-nowrap ${chartTab === 'monthly' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Mensal</button>
          <button onClick={() => setChartTab('dailyAvg')} className={`pb-2 px-2 font-medium whitespace-nowrap ${chartTab === 'dailyAvg' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Perfil Diário</button>
          <button onClick={() => setChartTab('annual')} className={`pb-2 px-2 font-medium whitespace-nowrap ${chartTab === 'annual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Evolução Anual</button>
          <button onClick={() => setChartTab('sources')} className={`pb-2 px-2 font-medium whitespace-nowrap ${chartTab === 'sources' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Fontes de Energia</button>
      </div>

      {chartTab === 'monthly' && (
        <div className="grid grid-cols-1 gap-6">
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
                <button onClick={() => downloadChartData(monthlyData, 'mensal_balanco.csv')} className="absolute top-4 right-4 text-gray-400 hover:text-blue-600" title="Exportar CSV"><Download size={16}/></button>
                <h3 className="text-lg font-semibold mb-4 text-slate-700">Balanço Energético Mensal (kWh)</h3>
                <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="production" name="Produção PV" fill="#eab308" />
                    <Bar dataKey="consumption" name="Consumo" fill="#3b82f6" />
                    </BarChart>
                </ResponsiveContainer>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
                <button onClick={() => downloadChartData(monthlyData, 'mensal_rede.csv')} className="absolute top-4 right-4 text-gray-400 hover:text-blue-600" title="Exportar CSV"><Download size={16}/></button>
                <h3 className="text-lg font-semibold mb-4 text-slate-700">Importação vs Injeção (kWh)</h3>
                <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="gridImport" name="Comprado à Rede" fill="#ef4444" stackId="a" />
                    <Bar dataKey="gridExport" name="Vendido à Rede" fill="#22c55e" stackId="a" />
                    </BarChart>
                </ResponsiveContainer>
                </div>
            </div>
        </div>
      )}

      {chartTab === 'dailyAvg' && (
           <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
               <button onClick={() => downloadChartData(dailySubTab === 'annual' ? dailyProfiles.annual : dailySubTab === 'seasonal' ? seasonalData : weekTypeData, `perfil_diario_${dailySubTab}.csv`)} className="absolute top-4 right-4 text-gray-400 hover:text-blue-600" title="Exportar CSV"><Download size={16}/></button>
               <div className="flex justify-between items-center mb-4 pr-8 flex-wrap gap-2">
                  <h3 className="text-lg font-semibold text-slate-700">Perfil Diário Médio (kW)</h3>
                  <div className="flex bg-gray-100 rounded p-1 text-xs">
                      <button onClick={()=>setDailySubTab('annual')} className={`px-3 py-1 rounded ${dailySubTab==='annual'?'bg-white shadow text-blue-600':''}`}>Anual</button>
                      <button onClick={()=>setDailySubTab('seasonal')} className={`px-3 py-1 rounded ${dailySubTab==='seasonal'?'bg-white shadow text-blue-600':''}`}>Sazonal</button>
                      <button onClick={()=>setDailySubTab('weektype')} className={`px-3 py-1 rounded ${dailySubTab==='weektype'?'bg-white shadow text-blue-600':''}`}>Semana vs FDS</button>
                  </div>
               </div>
               
               <div className="h-96">
                   <ResponsiveContainer width="100%" height="100%">
                       {dailySubTab === 'annual' ? (
                            <AreaChart data={dailyProfiles.annual}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Area type="monotone" dataKey="load" name="Carga Média" stroke="#3b82f6" fillOpacity={0.1} fill="#3b82f6" />
                                <Area type="monotone" dataKey="production" name="Produção Média" stroke="#eab308" fillOpacity={0.1} fill="#eab308" />
                            </AreaChart>
                       ) : dailySubTab === 'seasonal' ? (
                            <LineChart data={seasonalData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="winterProd" name="Prod. Inverno" stroke="#3b82f6" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="springProd" name="Prod. Primavera" stroke="#22c55e" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="summerProd" name="Prod. Verão" stroke="#eab308" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="autumnProd" name="Prod. Outono" stroke="#f97316" dot={false} strokeWidth={2} />
                            </LineChart>
                       ) : (
                            <LineChart data={weekTypeData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="weekdayLoad" name="Carga Dias Úteis" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="weekendLoad" name="Carga Fim-de-Semana" stroke="#9333ea" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="production" name="Produção (Ref)" stroke="#eab308" strokeDasharray="3 3" dot={false} />
                            </LineChart>
                       )}
                   </ResponsiveContainer>
               </div>
           </div>
      )}

      {chartTab === 'annual' && (
           <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
               <button onClick={() => downloadChartData(annualDailyData, 'evolucao_anual.csv')} className="absolute top-4 right-4 text-gray-400 hover:text-blue-600" title="Exportar CSV"><Download size={16}/></button>
               <h3 className="text-lg font-semibold mb-4 text-slate-700">Evolução Diária Anual (kWh/dia)</h3>
               <div className="h-96">
                   <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={annualDailyData}>
                           <CartesianGrid strokeDasharray="3 3" />
                           <XAxis dataKey="name" minTickGap={30} />
                           <YAxis />
                           <Tooltip />
                           <Legend />
                           <Line type="monotone" dataKey="production" name="Produção" stroke="#eab308" dot={false} strokeWidth={1} />
                           <Line type="monotone" dataKey="load" name="Carga" stroke="#3b82f6" dot={false} strokeWidth={1} />
                       </LineChart>
                   </ResponsiveContainer>
               </div>
           </div>
      )}

      {chartTab === 'sources' && (
          <div className="space-y-6">
              <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                      <h3 className="text-lg font-semibold text-slate-700">Cobertura da Carga - Perfil Diário (kW)</h3>
                      
                      <div className="flex items-center gap-4 bg-gray-50 p-2 rounded border">
                          <span className="text-xs font-bold text-gray-600">{sourceDay === null ? "Média Anual" : `Dia ${sourceDay}`}</span>
                          <input 
                            type="range" 
                            min="0" max="365" 
                            value={sourceDay || 0} 
                            onChange={(e) => setSourceDay(parseInt(e.target.value) === 0 ? null : parseInt(e.target.value))}
                            className="w-48 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            title="Arraste para selecionar o dia (0 = Média)"
                          />
                          <button onClick={() => downloadChartData(sourcesChartData, `perfil_fontes_${sourceDay||'media'}.csv`)} className="text-gray-400 hover:text-blue-600" title="Exportar Vista Atual"><Download size={16}/></button>
                      </div>
                  </div>
                  
                  <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sourcesChartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Area type="monotone" dataKey="direct" name="Solar Direto" stackId="1" stroke="#22c55e" fill="#22c55e" />
                              <Area type="monotone" dataKey="battery" name="Descarga Bateria" stackId="1" stroke="#3b82f6" fill="#3b82f6" />
                              <Area type="monotone" dataKey="grid" name="Rede (Import)" stackId="1" stroke="#ef4444" fill="#ef4444" />
                              {/* Reference Line for Load */}
                              <Line type="monotone" dataKey="load" name="Carga Total" stroke="#000" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Selecione um dia específico no slider acima para ver o detalhe horário.</p>
              </div>

              {/* Consumption Summary Table */}
              <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-700">Quadro Resumo de Consumo (Anual)</h3>
                    <button onClick={sourceExportData} className="text-xs flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1 rounded border border-green-200 hover:bg-green-100">
                        <Download size={14}/> Exportar Dados Horários (8760h)
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse">
                          <thead className="bg-gray-100 text-gray-600">
                              <tr>
                                  <th className="p-3">Fonte de Energia</th>
                                  <th className="p-3 text-right">Energia (kWh)</th>
                                  <th className="p-3 text-right">% do Total</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              <tr>
                                  <td className="p-3 font-medium flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Fotovoltaico Direto</td>
                                  <td className="p-3 text-right font-bold text-slate-700">{totalConsumptionBreakdown.direct.toLocaleString('pt-PT', {maximumFractionDigits:0})}</td>
                                  <td className="p-3 text-right text-slate-500">{(totalConsumptionBreakdown.direct / totalConsumptionBreakdown.total * 100).toFixed(1)}%</td>
                              </tr>
                              <tr>
                                  <td className="p-3 font-medium flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Baterias</td>
                                  <td className="p-3 text-right font-bold text-slate-700">{totalConsumptionBreakdown.battery.toLocaleString('pt-PT', {maximumFractionDigits:0})}</td>
                                  <td className="p-3 text-right text-slate-500">{(totalConsumptionBreakdown.battery / totalConsumptionBreakdown.total * 100).toFixed(1)}%</td>
                              </tr>
                              <tr>
                                  <td className="p-3 font-medium flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Rede (Importação)</td>
                                  <td className="p-3 text-right font-bold text-slate-700">{totalConsumptionBreakdown.grid.toLocaleString('pt-PT', {maximumFractionDigits:0})}</td>
                                  <td className="p-3 text-right text-slate-500">{(totalConsumptionBreakdown.grid / totalConsumptionBreakdown.total * 100).toFixed(1)}%</td>
                              </tr>
                              <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                                  <td className="p-3">TOTAL CONSUMO</td>
                                  <td className="p-3 text-right">{totalConsumptionBreakdown.total.toLocaleString('pt-PT', {maximumFractionDigits:0})}</td>
                                  <td className="p-3 text-right">100%</td>
                              </tr>
                          </tbody>
                      </table>
                  </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow border border-gray-200 relative">
                  <button onClick={() => downloadChartData(monthlyData, 'mensal_fontes.csv')} className="absolute top-4 right-4 text-gray-400 hover:text-blue-600" title="Exportar CSV"><Download size={16}/></button>
                  <h3 className="text-lg font-semibold mb-4 text-slate-700">Origem do Consumo Mensal (kWh)</h3>
                  <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="direct" name="Solar Direto" stackId="a" fill="#22c55e" />
                              <Bar dataKey="battery" name="Bateria" stackId="a" fill="#3b82f6" />
                              <Bar dataKey="gridImport" name="Rede" stackId="a" fill="#ef4444" />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};