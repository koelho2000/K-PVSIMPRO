
import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { calculateOptimizationCurves } from '../services/solarService';
import { Info, ArrowUp, ArrowDown, Compass, Sun } from 'lucide-react';

interface Props {
    lat: number;
}

export const OptimizationAnalysis: React.FC<Props> = ({ lat }) => {
    const data = useMemo(() => calculateOptimizationCurves(lat), [lat]);
    
    // Find Optimal points
    const maxTilt = data.tiltCurve.reduce((prev, curr) => curr.kwh > prev.kwh ? curr : prev);
    const maxAz = data.azimuthCurve.reduce((prev, curr) => curr.kwh > prev.kwh ? curr : prev);

    return (
        <div className="space-y-8 h-full">
            <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
                    <Sun className="text-yellow-500"/> Análise de Produtividade Solar
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Estudo da influência da inclinação e orientação na produtividade anual (kWh/kWp) para a latitude <strong>{lat.toFixed(4)}°</strong>.
                    Utilize estes gráficos para definir a geometria ideal da cobertura ou estrutura.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Tilt Chart */}
                    <div className="border rounded p-4 shadow-sm bg-slate-50">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2"><ArrowUp size={16}/> Inclinação (Tilt)</h4>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">Ideal: {maxTilt.angle}°</span>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.tiltCurve}>
                                    <defs>
                                        <linearGradient id="colorTilt" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="angle" label={{ value: 'Graus (°)', position: 'insideBottom', offset: -5 }} />
                                    <YAxis domain={['auto', 'auto']} label={{ value: 'kWh/kWp', angle: -90, position: 'insideLeft' }} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="kwh" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTilt)" />
                                    <ReferenceLine x={maxTilt.angle} stroke="green" strokeDasharray="3 3" label="Max" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-justify">
                            A inclinação ideal maximiza a captação anual. Para Portugal, situa-se tipicamente entre 30° e 35°.
                        </p>
                    </div>

                    {/* Azimuth Chart */}
                    <div className="border rounded p-4 shadow-sm bg-slate-50">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2"><Compass size={16}/> Orientação (Azimute)</h4>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">Ideal: 0° (Sul)</span>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.azimuthCurve}>
                                    <defs>
                                        <linearGradient id="colorAz" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="angle" label={{ value: 'Graus (0=Sul, -90=Este)', position: 'insideBottom', offset: -5 }} />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="kwh" stroke="#f59e0b" fillOpacity={1} fill="url(#colorAz)" />
                                    <ReferenceLine x={0} stroke="green" strokeDasharray="3 3" label="Sul" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-justify">
                            O Sul Geográfico (0°) oferece a maior produção. Desvios para Este (-90°) ou Oeste (+90°) reduzem a produção em cerca de 15-20%.
                        </p>
                    </div>
                </div>
            </div>

            {/* Shading Info */}
            <div className="bg-orange-50 border border-orange-200 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-orange-900 mb-4 flex items-center gap-2">
                    <Info size={20}/> Impacto do Sombreamento
                </h3>
                <div className="flex flex-col md:flex-row gap-8 items-center">
                    <div className="flex-1 space-y-4 text-sm text-orange-900">
                        <p>
                            O sombreamento entre filas de painéis é crítico no Solstício de Inverno (21 Dezembro), quando o sol está mais baixo.
                        </p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li><strong>Regra Prática:</strong> A distância entre filas deve ser aprox. 2 a 2.5 vezes a altura vertical do painel.</li>
                            <li><strong>Consequência:</strong> Uma pequena sombra na base do painel pode ativar os díodos de bypass e anular a produção de 30% a 100% desse módulo.</li>
                            <li><strong>No Menu Cobertura (4):</strong> O sistema calcula automaticamente a distância recomendada para a latitude do projeto.</li>
                        </ul>
                    </div>
                    
                    {/* Visual Aid */}
                    <div className="w-full md:w-1/3 h-40 bg-white border border-orange-100 rounded relative overflow-hidden flex items-end justify-center pb-2">
                        {/* Sun Beam */}
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-yellow-200/50 to-transparent pointer-events-none"></div>
                        
                        {/* Row 1 */}
                        <div className="w-4 h-16 bg-blue-600 transform -skew-x-12 origin-bottom mr-12 relative z-10"></div>
                        {/* Shadow */}
                        <div className="w-12 h-1 bg-black/20 absolute bottom-2 right-[calc(50%+20px)]"></div>
                        
                        {/* Row 2 */}
                        <div className="w-4 h-16 bg-blue-600 transform -skew-x-12 origin-bottom relative z-10"></div>
                        
                        <div className="absolute bottom-0 w-full border-t border-gray-400"></div>
                        
                        <div className="absolute top-4 left-4 text-[10px] text-gray-500 font-bold">Sol Inverno (Baixo)</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
