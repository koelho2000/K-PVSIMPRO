


import React, { useState, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart } from 'recharts';
import { ClimateData } from '../types';
import { MONTH_NAMES } from '../constants';

interface ClimateChartsProps {
  data?: ClimateData;
  lat: number;
}

export const ClimateCharts: React.FC<ClimateChartsProps> = ({ data, lat }) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'hourly'>('monthly');
  const [selectedDay, setSelectedDay] = useState(150); // Default to a day in June approx

  if (!data) return <div className="text-gray-400 p-4">Carregue a localização para ver os dados climáticos.</div>;

  const chartData = MONTH_NAMES.map((name, i) => ({
    name,
    temp: Math.round(data.monthlyTemp[i] * 10) / 10,
    rad: Math.round(data.monthlyRad[i]),
    hum: Math.round(data.monthlyHum[i])
  }));

  // Annual Averages
  const averages = useMemo(() => {
      const avgT = data.monthlyTemp.reduce((a,b)=>a+b,0) / 12;
      const avgR = data.monthlyRad.reduce((a,b)=>a+b,0) / 12;
      const avgH = data.monthlyHum.reduce((a,b)=>a+b,0) / 12;
      return { temp: avgT.toFixed(1), rad: avgR.toFixed(1), hum: avgH.toFixed(0) };
  }, [data]);

  // Hourly Data Logic
  const hourlyChartData = useMemo(() => {
     if (!data.hourlyTemp || data.hourlyTemp.length === 0) return [];
     
     const startIdx = (selectedDay - 1) * 24;
     const dayData = [];
     for(let h=0; h<24; h++) {
         const idx = startIdx + h;
         dayData.push({
             hour: `${h}h`,
             temp: data.hourlyTemp[idx] ? parseFloat(data.hourlyTemp[idx].toFixed(1)) : 0,
             rad: data.hourlyRad[idx] ? Math.round(data.hourlyRad[idx]) : 0,
             hum: data.hourlyHum && data.hourlyHum[idx] ? Math.round(data.hourlyHum[idx]) : 0
         });
     }
     return dayData;
  }, [data, selectedDay]);

  const getDateString = (dayOfYear: number) => {
      const date = new Date(2023, 0, dayOfYear); // Non-leap year base
      return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
  };

  return (
    <div className="space-y-6">
      
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 pb-2">
          <button onClick={() => setViewMode('monthly')} className={`pb-2 px-2 font-medium ${viewMode === 'monthly' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Mensal
          </button>
          <button onClick={() => setViewMode('hourly')} className={`pb-2 px-2 font-medium ${viewMode === 'hourly' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Horário (Detalhe Diário)
          </button>
      </div>

      {viewMode === 'monthly' ? (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded shadow border">
                <h4 className="font-bold text-gray-700 mb-4">Temperatura Média (°C) & Humidade (%)</h4>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" orientation="left" stroke="#ef4444" label={{ value: '°C', position: 'insideLeft', angle: -90, offset: 10 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" label={{ value: '%', position: 'insideRight', angle: 90, offset: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#ef4444" strokeWidth={2} />
                        <Bar yAxisId="right" dataKey="hum" name="Humidade (%)" fill="#3b82f6" opacity={0.5} />
                    </ComposedChart>
                    </ResponsiveContainer>
                </div>
                </div>

                <div className="bg-white p-4 rounded shadow border">
                <h4 className="font-bold text-gray-700 mb-4">Radiação Global (kWh/m²/dia)</h4>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="rad" name="Irradiação" stroke="#eab308" fill="#eab308" />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
                </div>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <h4 className="font-bold text-gray-700 p-4 bg-gray-50 border-b">Resumo Climático - {lat.toFixed(4)}°</h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                    <thead className="bg-gray-100">
                        <tr>
                        <th className="p-2 text-left">Mês</th>
                        {MONTH_NAMES.map(m => <th key={m} className="p-2">{m}</th>)}
                        <th className="p-2 bg-blue-100 font-bold border-l">Média Ano</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr>
                            <td className="p-2 font-semibold text-left">Temp (°C)</td>
                            {chartData.map((d, i) => <td key={i} className="p-2">{d.temp}</td>)}
                            <td className="p-2 bg-blue-50 font-bold border-l">{averages.temp}</td>
                        </tr>
                        <tr>
                            <td className="p-2 font-semibold text-left">Rad (kWh/m²/dia)</td>
                            {chartData.map((d, i) => <td key={i} className="p-2">{d.rad}</td>)}
                            <td className="p-2 bg-blue-50 font-bold border-l">{averages.rad}</td>
                        </tr>
                        <tr>
                            <td className="p-2 font-semibold text-left">Humidade (%)</td>
                            {chartData.map((d, i) => <td key={i} className="p-2">{d.hum}</td>)}
                            <td className="p-2 bg-blue-50 font-bold border-l">{averages.hum}</td>
                        </tr>
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded shadow border space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h4 className="font-bold text-gray-700">Perfil Horário: {getDateString(selectedDay)}</h4>
                <div className="flex items-center gap-4 w-full md:w-1/2">
                    <span className="text-sm font-bold text-gray-500">Dia {selectedDay}</span>
                    <input 
                        type="range" 
                        min="1" max="365" 
                        value={selectedDay} 
                        onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hourlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        
                        {/* Left Axis: Temp & Hum */}
                        <YAxis yAxisId="left" label={{ value: '°C / %', angle: -90, position: 'insideLeft' }} />
                        
                        {/* Right Axis: Radiation */}
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'W/m²', angle: 90, position: 'insideRight' }} />
                        
                        <Tooltip />
                        <Legend />
                        
                        <Area yAxisId="right" type="monotone" dataKey="rad" name="Radiação (W/m²)" fill="#fef08a" stroke="#eab308" fillOpacity={0.6} />
                        <Line yAxisId="left" type="monotone" dataKey="temp" name="Temperatura (°C)" stroke="#ef4444" strokeWidth={2} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="hum" name="Humidade (%)" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-gray-500">Arraste a barra para visualizar as variações diárias ao longo do ano.</p>
        </div>
      )}

    </div>
  );
};
