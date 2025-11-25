import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { LoadProfile } from '../types';
import { MONTH_NAMES } from '../constants';

interface LoadChartsProps {
  loadProfile: LoadProfile;
}

export const LoadCharts: React.FC<LoadChartsProps> = ({ loadProfile }) => {
  
  // Calculate Full Year Synthetic Data if hourlyData is missing for metrics
  const hourlyData = useMemo(() => {
     if (loadProfile.hourlyData && loadProfile.hourlyData.length === 8760) return loadProfile.hourlyData;
     
     const generated = [];
     for (let d = 0; d < 365; d++) {
        const isWeekend = (d % 7) === 0 || (d % 7) === 6;
        for (let h = 0; h < 24; h++) {
           const base = loadProfile.baseLoadKw;
           const peak = loadProfile.peakLoadKw;
           let factor = 0.1;
           if (!isWeekend) {
               if ((h >= 7 && h <= 9) || (h >= 18 && h <= 22)) factor = 0.9;
               else if (h > 9 && h < 18) factor = 0.4;
           } else {
               if (h > 9 && h < 22) factor = 0.6;
           }
           generated.push(base + (peak - base) * factor);
        }
     }
     return generated;
  }, [loadProfile]);

  // Metrics
  const metrics = useMemo(() => {
     const total = hourlyData.reduce((a,b)=>a+b, 0);
     const max = Math.max(...hourlyData);
     const avgYear = total / 8760;
     
     // Avg during sun hours (approx 9h to 17h for simplicity across year)
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

  // Prepare Daily Profile (0-23h)
  const dailyData = useMemo(() => {
    // If we have imported data, we average the 8760h to get a representative daily curve
    if (loadProfile.type === 'imported' && loadProfile.hourlyData) {
        const hours = new Array(24).fill(0);
        const counts = new Array(24).fill(0);
        loadProfile.hourlyData.forEach((val, idx) => {
            const h = idx % 24;
            hours[h] += val;
            counts[h]++;
        });
        return hours.map((sum, h) => ({
            hour: `${h}h`,
            load: parseFloat((sum / counts[h]).toFixed(3))
        }));
    }

    // Default simplified gen
    const data = [];
    const base = loadProfile.baseLoadKw;
    const peak = loadProfile.peakLoadKw;
    for (let h = 0; h < 24; h++) {
        let val = base;
        if ((h >= 7 && h <= 9) || (h >= 18 && h <= 22)) val += (peak - base) * 0.9;
        else if (h > 9 && h < 18) val += (peak - base) * 0.4;
        data.push({ hour: `${h}h`, load: val });
    }
    return data;
  }, [loadProfile]);

  // Prepare Monthly/Annual Data
  const monthlyData = useMemo(() => {
    if (loadProfile.type === 'imported' && loadProfile.hourlyData) {
        const months = new Array(12).fill(0);
        // Approx 730 hours per month
        loadProfile.hourlyData.forEach((val, idx) => {
            const monthIdx = Math.min(11, Math.floor(idx / 730.5));
            months[monthIdx] += val;
        });
        return MONTH_NAMES.map((m, i) => ({
            name: m,
            kwh: Math.round(months[i])
        }));
    }

    const avgMonth = loadProfile.annualConsumptionKwh / 12;
    return MONTH_NAMES.map((m, i) => {
        const factor = 1 + (Math.cos(2 * Math.PI * i / 12) * 0.2); 
        return { name: m, kwh: Math.round(avgMonth * factor) };
    });
  }, [loadProfile]);

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
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50">Potência de Ponta Config.</td>
                     <td className="p-3">{loadProfile.peakLoadKw} kW</td>
                 </tr>
                 <tr>
                     <td className="p-3 font-semibold bg-gray-50">Potência de Vazio Config.</td>
                     <td className="p-3">{loadProfile.baseLoadKw} kW</td>
                 </tr>
             </tbody>
         </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily Curve */}
        <div className="bg-white p-4 rounded shadow border">
          <h4 className="font-bold text-gray-700 mb-4">Perfil Diário Médio (kW)</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="load" stroke="#8884d8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Annual Curve */}
        <div className="bg-white p-4 rounded shadow border">
          <h4 className="font-bold text-gray-700 mb-4">Consumo Mensal (kWh)</h4>
          <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="kwh" stroke="#3b82f6" fill="#3b82f6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
};