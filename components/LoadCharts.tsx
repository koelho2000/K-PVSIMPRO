
import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, BarChart, Bar } from 'recharts';
import { LoadProfile } from '../types';
import { MONTH_NAMES } from '../constants';

interface LoadChartsProps {
  loadProfile: LoadProfile;
}

export const LoadCharts: React.FC<LoadChartsProps> = ({ loadProfile }) => {
  const [chartView, setChartView] = useState<'daily'|'weekly'|'annual_monthly'|'annual_hourly'>('daily');

  // Generate or Use Hourly Data
  const hourlyData = useMemo(() => {
     if (loadProfile.hourlyData && loadProfile.hourlyData.length === 8760) return loadProfile.hourlyData;
     return []; // Should handle synthetic generation if missing, but App.tsx ensures it exists
  }, [loadProfile]);

  // Metrics
  const metrics = useMemo(() => {
     if (hourlyData.length === 0) return { total: 0, max: 0, avgYear: 0, avgSun: 0 };
     
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
  }, [hourlyData]);

  // 1. Daily Profile (Average)
  const dailyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    hourlyData.forEach((val, idx) => {
        const h = idx % 24;
        hours[h] += val;
        counts[h]++;
    });
    return hours.map((sum, h) => ({
        hour: `${h}h`,
        load: parseFloat((sum / (counts[h]||1)).toFixed(3))
    }));
  }, [hourlyData]);

  // 2. Weekly Profile (Mon-Sun)
  const weeklyData = useMemo(() => {
      // 0=Sun, 1=Mon ... 6=Sat. We want Mon(1) to Sun(0)
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const sums = new Array(7).fill(0);
      const counts = new Array(7).fill(0);
      
      hourlyData.forEach((val, idx) => {
          const dayIdx = Math.floor(idx / 24) % 7; // 0 is Jan 1st. Assumed Sunday for 2023
          sums[dayIdx] += val;
          counts[dayIdx]++;
      });

      // Reorder to Mon-Sun
      const order = [1, 2, 3, 4, 5, 6, 0];
      return order.map(d => ({
          name: days[d],
          avgLoad: parseFloat((sums[d] / (counts[d]*24)).toFixed(3)) // Avg kW
      }));
  }, [hourlyData]);

  // 3. Monthly Data
  const monthlyData = useMemo(() => {
    const months = new Array(12).fill(0);
    hourlyData.forEach((val, idx) => {
        const monthIdx = Math.min(11, Math.floor(idx / 730.5));
        months[monthIdx] += val;
    });
    return MONTH_NAMES.map((m, i) => ({
        name: m,
        kwh: Math.round(months[i])
    }));
  }, [hourlyData]);

  // 4. Annual Hourly (Downsampled for performance)
  const annualHourlyData = useMemo(() => {
      // Group by day to reduce points from 8760 to 365
      const data = [];
      for(let d=0; d<365; d++) {
          let sum = 0;
          for(let h=0; h<24; h++) sum += hourlyData[d*24 + h] || 0;
          data.push({ day: d, load: sum }); // Daily kWh
      }
      return data;
  }, [hourlyData]);

  return (
    <div className="space-y-6">
      
      <div className="bg-white rounded shadow overflow-hidden">
         <h4 className="font-bold text-gray-700 p-4 bg-gray-50 border-b">Resumo do Consumo</h4>
         <table className="w-full text-sm">
             <tbody className="divide-y">
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50 w-1/3">Tipo de Perfil</td>
                     <td className="p-3">{loadProfile.profileName || 'Personalizado'}</td>
                 </tr>
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50">Consumo Anual</td>
                     <td className="p-3 font-bold">{loadProfile.annualConsumptionKwh} kWh</td>
                 </tr>
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50">Média Anual (kW)</td>
                     <td className="p-3">{metrics.avgYear.toFixed(3)} kW</td>
                 </tr>
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50 text-orange-600">Média em Horas de Sol (kW)</td>
                     <td className="p-3 text-orange-600 font-medium">{metrics.avgSun.toFixed(3)} kW</td>
                 </tr>
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50">Máximo Anual (kW)</td>
                     <td className="p-3 font-bold">{metrics.max.toFixed(3)} kW</td>
                 </tr>
             </tbody>
         </table>
      </div>

      {/* Chart Tabs */}
      <div className="flex border-b space-x-4">
          <button onClick={()=>setChartView('daily')} className={`py-2 px-4 border-b-2 ${chartView==='daily'?'border-blue-600 text-blue-600':'border-transparent text-gray-500'}`}>Diário</button>
          <button onClick={()=>setChartView('weekly')} className={`py-2 px-4 border-b-2 ${chartView==='weekly'?'border-blue-600 text-blue-600':'border-transparent text-gray-500'}`}>Semanal</button>
          <button onClick={()=>setChartView('annual_monthly')} className={`py-2 px-4 border-b-2 ${chartView==='annual_monthly'?'border-blue-600 text-blue-600':'border-transparent text-gray-500'}`}>Mensal</button>
          <button onClick={()=>setChartView('annual_hourly')} className={`py-2 px-4 border-b-2 ${chartView==='annual_hourly'?'border-blue-600 text-blue-600':'border-transparent text-gray-500'}`}>Anual</button>
      </div>

      <div className="bg-white p-4 rounded shadow border h-80">
        <ResponsiveContainer width="100%" height="100%">
            {chartView === 'daily' ? (
                <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis label={{value:'kW', angle:-90, position:'insideLeft'}}/>
                    <Tooltip />
                    <Line type="monotone" dataKey="load" name="Carga Média (kW)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
            ) : chartView === 'weekly' ? (
                <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{value:'kW Médio', angle:-90, position:'insideLeft'}}/>
                    <Tooltip />
                    <Bar dataKey="avgLoad" name="Carga Média (kW)" fill="#8b5cf6" />
                </BarChart>
            ) : chartView === 'annual_monthly' ? (
                <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{value:'kWh', angle:-90, position:'insideLeft'}}/>
                    <Tooltip />
                    <Bar dataKey="kwh" name="Consumo (kWh)" fill="#10b981" />
                </BarChart>
            ) : (
                <AreaChart data={annualHourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" label={{value:'Dia do Ano', position:'insideBottom', offset:-5}} />
                    <YAxis label={{value:'kWh/dia', angle:-90, position:'insideLeft'}}/>
                    <Tooltip />
                    <Area type="monotone" dataKey="load" name="Consumo Diário (kWh)" stroke="#f59e0b" fill="#fcd34d" />
                </AreaChart>
            )}
        </ResponsiveContainer>
      </div>

    </div>
  );
};
