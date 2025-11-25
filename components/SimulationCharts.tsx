import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line } from 'recharts';
import { SimulationResult } from '../types';
import { MONTH_NAMES } from '../constants';

interface SimulationChartsProps {
  result: SimulationResult | null;
}

export const SimulationCharts: React.FC<SimulationChartsProps> = ({ result }) => {
  const [chartTab, setChartTab] = useState<'monthly' | 'dailyAvg' | 'annual'>('monthly');
  const [dailySubTab, setDailySubTab] = useState<'annual' | 'seasonal' | 'weektype'>('annual');

  if (!result) return <div className="text-gray-500 italic text-center p-10">Execute a simulação para ver os resultados.</div>;

  // 1. Monthly Data
  const monthlyData = useMemo(() => {
    const data = MONTH_NAMES.map(m => ({ name: m, production: 0, consumption: 0, gridImport: 0, gridExport: 0 }));
    
    result.hourlyProduction.forEach((val, idx) => {
      const day = Math.floor(idx / 24);
      const monthIdx = Math.floor(day / 30.5) % 12; // Approx
      if (data[monthIdx]) {
        data[monthIdx].production += val;
        data[monthIdx].consumption += result.hourlyLoad[idx];
        data[monthIdx].gridImport += result.hourlyGridImport[idx];
        data[monthIdx].gridExport += result.hourlyGridExport[idx];
      }
    });

    return data.map(d => ({
        ...d,
        production: Math.round(d.production),
        consumption: Math.round(d.consumption),
        gridImport: Math.round(d.gridImport),
        gridExport: Math.round(d.gridExport),
    }));
  }, [result]);

  // 2. Average Daily Profiles (Annual, Seasonal, Weekday)
  const dailyProfiles = useMemo(() => {
      // Initialize accumulators
      const initHour = () => ({ prod: 0, load: 0, count: 0 });
      
      const annual = new Array(24).fill(0).map(initHour);
      
      // Seasons: Winter (Dec, Jan, Feb), Spring (Mar, Apr, May), Summer (Jun, Jul, Aug), Autumn (Sep, Oct, Nov)
      const spring = new Array(24).fill(0).map(initHour);
      const summer = new Array(24).fill(0).map(initHour);
      const autumn = new Array(24).fill(0).map(initHour);
      const winter = new Array(24).fill(0).map(initHour);

      const weekday = new Array(24).fill(0).map(initHour);
      const weekend = new Array(24).fill(0).map(initHour);

      result.hourlyProduction.forEach((prod, idx) => {
          const h = idx % 24;
          const dayOfYear = Math.floor(idx / 24);
          // Month approx
          const month = Math.floor(dayOfYear / 30.5) % 12;
          
          // Annual
          annual[h].prod += prod;
          annual[h].load += result.hourlyLoad[idx];
          annual[h].count++;

          // Seasonal
          // Winter: 11, 0, 1
          if (month === 11 || month === 0 || month === 1) {
             winter[h].prod += prod; winter[h].load += result.hourlyLoad[idx]; winter[h].count++;
          }
          // Spring: 2, 3, 4
          else if (month >= 2 && month <= 4) {
             spring[h].prod += prod; spring[h].load += result.hourlyLoad[idx]; spring[h].count++;
          }
          // Summer: 5, 6, 7
          else if (month >= 5 && month <= 7) {
             summer[h].prod += prod; summer[h].load += result.hourlyLoad[idx]; summer[h].count++;
          }
          // Autumn: 8, 9, 10
          else {
             autumn[h].prod += prod; autumn[h].load += result.hourlyLoad[idx]; autumn[h].count++;
          }

          // Week type (0 = Jan 1st. Assuming Jan 1st is Monday for generic simulation or using modulo)
          // Simple Modulo 7: 0-4 Weekday, 5-6 Weekend
          const dayType = dayOfYear % 7; 
          if (dayType < 5) {
              weekday[h].prod += prod; weekday[h].load += result.hourlyLoad[idx]; weekday[h].count++;
          } else {
              weekend[h].prod += prod; weekend[h].load += result.hourlyLoad[idx]; weekend[h].count++;
          }
      });

      const avg = (arr: any[]) => arr.map((x, i) => ({
          name: `${i}h`,
          production: x.count ? parseFloat((x.prod / x.count).toFixed(2)) : 0,
          load: x.count ? parseFloat((x.load / x.count).toFixed(2)) : 0
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

  // Combine for charts
  const seasonalData = useMemo(() => {
      return dailyProfiles.spring.map((h, i) => ({
          name: h.name,
          springProd: h.production,
          summerProd: dailyProfiles.summer[i].production,
          autumnProd: dailyProfiles.autumn[i].production,
          winterProd: dailyProfiles.winter[i].production,
          load: dailyProfiles.annual[i].load // Reference load
      }));
  }, [dailyProfiles]);

  const weekTypeData = useMemo(() => {
      return dailyProfiles.weekday.map((h, i) => ({
          name: h.name,
          weekdayLoad: h.load,
          weekendLoad: dailyProfiles.weekend[i].load,
          production: dailyProfiles.annual[i].production
      }));
  }, [dailyProfiles]);


  // 3. Annual Evolution (Daily Sums)
  const annualDailyData = useMemo(() => {
      const days = [];
      for (let d = 0; d < 365; d++) {
          let dayProd = 0;
          let dayLoad = 0;
          for (let h = 0; h < 24; h++) {
              const idx = (d * 24) + h;
              dayProd += result.hourlyProduction[idx];
              dayLoad += result.hourlyLoad[idx];
          }
          days.push({
              name: `D${d+1}`,
              production: parseFloat(dayProd.toFixed(1)),
              load: parseFloat(dayLoad.toFixed(1)),
          });
      }
      return days;
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200 pb-2">
          <button onClick={() => setChartTab('monthly')} className={`pb-2 px-2 font-medium ${chartTab === 'monthly' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Mensal</button>
          <button onClick={() => setChartTab('dailyAvg')} className={`pb-2 px-2 font-medium ${chartTab === 'dailyAvg' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Perfil Diário</button>
          <button onClick={() => setChartTab('annual')} className={`pb-2 px-2 font-medium ${chartTab === 'annual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Evolução Anual</button>
      </div>

      {chartTab === 'monthly' && (
        <div className="grid grid-cols-1 gap-6">
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
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
            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
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
           <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
               <div className="flex justify-between items-center mb-4">
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
               <p className="text-xs text-gray-400 mt-2">Médias calculadas com base nos dados horários da simulação.</p>
           </div>
      )}

      {chartTab === 'annual' && (
           <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
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
               <p className="text-xs text-gray-400 mt-2">Visão macro da variabilidade diária ao longo do ano.</p>
           </div>
      )}

    </div>
  );
};