


import React, { useMemo } from 'react';
import { ProjectState } from '../types';
import { calculateStringing, findOptimalConfiguration } from '../services/electricalService';
import { PANELS_DB, INVERTERS_DB } from '../constants';
import { CheckCircle, AlertTriangle, XCircle, Zap, Activity, Wrench, ShieldCheck, Ruler } from 'lucide-react';

interface Props {
  project: ProjectState;
  onUpdateProject?: (p: ProjectState) => void;
}

export const ElectricalScheme: React.FC<Props> = ({ project, onUpdateProject }) => {
  const result = useMemo(() => calculateStringing(project), [project]);
  const inverterCount = project.systemConfig.inverterCount || 1;
  const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
  const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
  const totalAcPowerKw = result.metrics.totalAcPowerKw;

  // Distances
  const distPanelsBox = project.systemConfig.cableDcPanelsToBox || 15;
  const distBoxInv = project.systemConfig.cableDcBoxToInverter || 5;
  const distAc = project.systemConfig.cableAcMeters || 10;

  const handleOptimize = () => {
      const solution = findOptimalConfiguration(project);
      if (solution && onUpdateProject) {
          if (confirm(`Proposta de Correção Automática:\n\n${solution.reason}\n\nDeseja aplicar esta configuração?`)) {
              onUpdateProject({ ...project, systemConfig: solution.config });
          }
      } else {
          alert("O algoritmo não encontrou uma solução automática óbvia com a base de dados atual. Tente reduzir o número de painéis ou escolher um inversor de gama superior manualmente.");
      }
  };

  const handleDistanceChange = (field: 'cableDcPanelsToBox' | 'cableDcBoxToInverter' | 'cableAcMeters', value: number) => {
      if (!onUpdateProject) return;
      
      const newConfig = { ...project.systemConfig, [field]: value };
      
      // Keep total updated for legacy compatibility
      if (field === 'cableDcPanelsToBox' || field === 'cableDcBoxToInverter') {
          newConfig.cableDcMeters = (newConfig.cableDcPanelsToBox || 0) + (newConfig.cableDcBoxToInverter || 0);
      }

      onUpdateProject({ ...project, systemConfig: newConfig });
  };

  // SVG Diagram Helpers
  const svgWidth = 800;
  const svgHeight = 500;
  const startX = 50;
  const startY = 50;

  return (
    <div className="space-y-8">
      
      {/* 1. Dashboard Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className={`p-4 rounded border flex items-center gap-4 ${result.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} col-span-2`}>
              {result.valid ? <CheckCircle className="text-green-600" size={32}/> : <XCircle className="text-red-600" size={32}/>}
              <div>
                  <h4 className="font-bold text-lg">Verificação Elétrica</h4>
                  <p className="text-sm">{result.valid ? 'Sistema Elétrico Validado' : 'Erros de Dimensionamento'}</p>
              </div>
          </div>
          
          <div className="p-4 rounded border bg-blue-50 border-blue-200 flex items-center gap-4">
              <Zap className="text-blue-600" size={32}/>
              <div>
                  <h4 className="font-bold text-lg">Tensão String</h4>
                  <p className="text-sm">Max: {result.metrics.maxStringVoltage.toFixed(0)}V</p>
                  <p className="text-xs text-gray-500">Limite: {inverter?.maxDcVoltage}V</p>
              </div>
          </div>

          <div className="p-4 rounded border bg-orange-50 border-orange-200 flex items-center gap-4">
              <Activity className="text-orange-600" size={32}/>
              <div>
                  <h4 className="font-bold text-lg">Rácio DC/AC</h4>
                  <p className="text-sm">{result.metrics.dcAcRatio.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">Ideal: 1.1 - 1.25</p>
              </div>
          </div>
      </div>

      {totalAcPowerKw > 250 && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded shadow-sm">
            <h4 className="font-bold text-orange-800 flex items-center gap-2">
                <ShieldCheck size={20}/> Requisito Legal (>250kW)
            </h4>
            <p className="text-sm text-orange-800 mt-1">
                Para instalações superiores a 250kW, é obrigatória a instalação de <strong>Proteção de interligação/homopolar</strong> para separação automática da rede.
                <br/>
                <span className="text-xs">Função: Deteção e atuação rápida para evitar injeção de energia em redes desenergizadas ou com desequilíbrios.</span>
            </p>
        </div>
      )}

      {/* Warnings & Errors + Fix Button */}
      {(result.errors.length > 0 || result.warnings.length > 0) && (
          <div className="bg-white p-6 rounded shadow border border-red-100 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle/> Diagnóstico do Sistema</h4>
                  <button 
                    onClick={handleOptimize}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow flex items-center gap-2 text-sm font-bold animate-pulse"
                  >
                      <Wrench size={16}/> Otimizar / Corrigir Automaticamente
                  </button>
              </div>
              <div className="space-y-2">
                {result.errors.map((e, i) => (
                    <div key={i} className="bg-red-100 text-red-800 p-3 rounded flex items-center gap-2 text-sm font-bold">
                        <XCircle size={16} className="shrink-0"/> {e}
                    </div>
                ))}
                {result.warnings.map((w, i) => (
                    <div key={i} className="bg-yellow-100 text-yellow-800 p-3 rounded flex items-center gap-2 text-sm">
                        <AlertTriangle size={16} className="shrink-0"/> {w}
                    </div>
                ))}
              </div>
          </div>
      )}

      {/* 2. Cable Geometry Configuration (New) */}
      <div className="bg-white p-6 rounded shadow border">
          <h3 className="text-lg font-bold mb-4 text-gray-800 flex items-center gap-2"><Ruler className="text-blue-600"/> Geometria da Cablagem (Distâncias)</h3>
          <p className="text-sm text-gray-500 mb-6">Defina os comprimentos dos troços de cabo para cálculo rigoroso de quantidades e orçamento.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Painéis &rarr; Quadro DC</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number" min="1" className="border rounded p-2 w-full font-bold text-slate-700" 
                        value={distPanelsBox} 
                        onChange={(e) => handleDistanceChange('cableDcPanelsToBox', parseFloat(e.target.value))}
                      />
                      <span className="text-sm text-gray-500">m</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Cabo Solar 4-6mm²</p>
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Quadro DC &rarr; Inversor</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number" min="1" className="border rounded p-2 w-full font-bold text-slate-700" 
                        value={distBoxInv} 
                        onChange={(e) => handleDistanceChange('cableDcBoxToInverter', parseFloat(e.target.value))}
                      />
                      <span className="text-sm text-gray-500">m</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Cabo Solar 4-6mm²</p>
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Inversor &rarr; Quadro AC</label>
                  <div className="flex items-center gap-2">
                      <input 
                        type="number" min="1" className="border rounded p-2 w-full font-bold text-slate-700" 
                        value={distAc} 
                        onChange={(e) => handleDistanceChange('cableAcMeters', parseFloat(e.target.value))}
                      />
                      <span className="text-sm text-gray-500">m</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Cabo AC XV</p>
              </div>
          </div>
      </div>

      {/* 3. String Table */}
      <div className="bg-white p-6 rounded shadow border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Configuração de Strings (Por Inversor)</h3>
            <span className="text-xs bg-gray-100 p-1 rounded">Total Inversores: {inverterCount}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 uppercase text-xs text-gray-600">
                    <tr>
                        <th className="p-3">Entrada MPPT</th>
                        <th className="p-3">Configuração</th>
                        <th className="p-3">Tensão Voc (-10°C)</th>
                        <th className="p-3">Corrente Isc</th>
                        <th className="p-3 text-right">Potência DC</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {result.strings.length > 0 ? result.strings.map((s, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                            <td className="p-3 font-bold text-blue-800">MPPT {s.mpptId}</td>
                            <td className="p-3">
                                <div className="font-bold">{s.numStrings}x Strings de {s.panelsPerString} Painéis</div>
                                <div className="text-xs text-gray-500">Total: {s.numStrings * s.panelsPerString} módulos</div>
                            </td>
                            <td className="p-3">
                                <span className={s.vocString > (inverter?.maxDcVoltage||1000) ? "text-red-600 font-bold" : "text-gray-700"}>
                                    {s.vocString.toFixed(0)} V
                                </span>
                            </td>
                            <td className="p-3">
                                <span className={s.iscString > (inverter?.maxInputCurrent||15) ? "text-red-600 font-bold" : "text-gray-700"}>
                                    {s.iscString.toFixed(1)} A
                                </span>
                            </td>
                            <td className="p-3 text-right font-medium">{s.powerKw.toFixed(2)} kW</td>
                        </tr>
                    )) : (
                        <tr><td colSpan={5} className="p-4 text-center text-gray-400 italic">Sem strings configuradas. Verifique erros.</td></tr>
                    )}
                </tbody>
            </table>
          </div>
      </div>

      {/* 4. Sizing Dashboard */}
      <div className="bg-slate-50 border border-slate-200 rounded p-6">
          <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><ShieldCheck size={20}/> Dimensionamento de Cabos e Proteções</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="bg-white p-3 rounded shadow-sm border">
                  <p className="text-xs text-slate-500 uppercase font-bold">Cabo Solar DC</p>
                  <p className="text-xl font-bold text-slate-800">{result.cables.dcStringMm2} mm²</p>
                  <p className="text-[10px] text-slate-400">H1Z2Z2-K</p>
              </div>
              <div className="bg-white p-3 rounded shadow-sm border">
                  <p className="text-xs text-slate-500 uppercase font-bold">Fusível DC</p>
                  <p className="text-xl font-bold text-red-700">{result.protection.dcFuseA} A</p>
                  <p className="text-[10px] text-slate-400">gPV 1000V</p>
              </div>
              <div className="bg-white p-3 rounded shadow-sm border">
                  <p className="text-xs text-slate-500 uppercase font-bold">Cabo AC (Por Inv)</p>
                  <p className="text-xl font-bold text-slate-800">{result.cables.acMm2} mm²</p>
                  <p className="text-[10px] text-slate-400">XV / V-K</p>
              </div>
              <div className="bg-white p-3 rounded shadow-sm border">
                  <p className="text-xs text-slate-500 uppercase font-bold">Disjuntor AC</p>
                  <p className="text-xl font-bold text-blue-700">{result.protection.acBreakerA} A</p>
                  <p className="text-[10px] text-slate-400">Curva C</p>
              </div>
          </div>
      </div>

      {/* 5. Single Line Diagram */}
      <div className="bg-white p-6 rounded shadow border">
          <h3 className="text-lg font-bold mb-6 text-gray-800">Esquema Unifilar (Simplificado)</h3>
          <div className="border border-gray-300 rounded bg-slate-50 overflow-x-auto p-4 flex justify-center">
              <svg width={svgWidth} height={Math.max(svgHeight, (result.strings.length * 80) + 100)} className="mx-auto bg-white shadow-sm border">
                  <defs>
                      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                          <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
                      </marker>
                  </defs>

                  {/* Draw Strings */}
                  {result.strings.map((str, idx) => {
                      const yOffset = startY + (idx * 80);
                      return (
                          <g key={idx}>
                              {/* PV Symbol */}
                              <rect x={startX} y={yOffset} width="50" height="40" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" />
                              <line x1={startX} y1={yOffset+40} x2={startX+50} y2={yOffset} stroke="#0284c7" />
                              <text x={startX+25} y={yOffset-10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#334155">MPPT {str.mpptId}</text>
                              <text x={startX+25} y={yOffset+25} textAnchor="middle" fontSize="9" fill="#0369a1">{str.numStrings}x{str.panelsPerString}</text>
                              
                              {/* DC Line (Panels -> Box) */}
                              <line x1={startX+50} y1={yOffset+20} x2={startX+150} y2={yOffset+20} stroke="#334155" strokeWidth="2" />
                              {/* Distance Label on Line */}
                              <text x={startX+100} y={yOffset+12} textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="bold">{distPanelsBox}m</text>
                              <text x={startX+100} y={yOffset+28} textAnchor="middle" fontSize="8" fill="#64748b">{result.cables.dcStringMm2}mm²</text>
                          </g>
                      )
                  })}

                  {/* DC Combiner Box Area */}
                  <g transform={`translate(${startX+150}, ${startY})`}>
                      <rect x="0" y="-30" width="80" height={(result.strings.length * 80) + 20} rx="5" fill="none" stroke="#94a3b8" strokeDasharray="5,5" />
                      <text x="40" y="-40" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">Quadro DC</text>
                      
                      {result.strings.map((_, idx) => (
                           <g key={idx}>
                               <rect x="25" y={idx*80 + 15} width="30" height="12" fill="#ef4444" rx="2" />
                               <text x="40" y={idx*80 + 24} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="bold">{result.protection.dcFuseA}A</text>
                           </g>
                      ))}
                  </g>

                  {/* Inverter Connection (Box -> Inverter) */}
                  {/* Collect lines to inverter center */}
                  {result.strings.map((_, idx) => {
                      const yStart = startY + (idx * 80) + 20;
                      const yEnd = startY + ((result.strings.length - 1) * 40) + 20; // Middleish
                      const isMiddle = idx === Math.floor(result.strings.length/2);
                      return (
                        <g key={idx}>
                            <path d={`M${startX+230},${yStart} L${startX+260},${yStart} L${startX+260},${yEnd} L${startX+300},${yEnd}`} 
                                fill="none" stroke="#334155" strokeWidth="2" markerEnd={isMiddle ? "url(#arrow)" : ""} />
                            {isMiddle && (
                                <>
                                    <text x={startX+280} y={yEnd-5} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold">{distBoxInv}m</text>
                                </>
                            )}
                        </g>
                      );
                  })}
                  
                  {/* Inverter Box */}
                  <g transform={`translate(${startX+300}, ${startY + ((result.strings.length - 1) * 40) - 20})`}>
                      <rect x="0" y="0" width="120" height="80" fill="#fef9c3" stroke="#eab308" strokeWidth="3" rx="4" />
                      <text x="60" y="25" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#854d0e">Inversor</text>
                      <text x="60" y="45" textAnchor="middle" fontSize="10" fill="#854d0e">{inverter?.manufacturer} {inverter?.model}</text>
                      <text x="60" y="60" textAnchor="middle" fontSize="10" fill="#854d0e">{inverterCount} Unidade(s)</text>
                  </g>

                  {/* AC Output (Inverter -> AC Box) */}
                  <line x1={startX+420} y1={startY+((result.strings.length-1)*40)+20} x2={startX+500} y2={startY+((result.strings.length-1)*40)+20} stroke="#334155" strokeWidth="2" />
                  <text x={startX+460} y={startY+((result.strings.length-1)*40)+12} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold">{distAc}m</text>
                  <text x={startX+460} y={startY+((result.strings.length-1)*40)+28} textAnchor="middle" fontSize="9" fill="#64748b">{result.cables.acMm2}mm²</text>

                  {/* AC Box */}
                  <g transform={`translate(${startX+500}, ${startY + ((result.strings.length-1)*40) - 20})`}>
                       <rect x="0" y="0" width="70" height="80" fill="none" stroke="#94a3b8" strokeDasharray="5,5" />
                       <text x="35" y="-10" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">Quadro AC</text>
                       {/* Breaker Icon */}
                       <path d="M25,25 L45,55" stroke="#000" strokeWidth="2"/>
                       <text x="35" y="70" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2563eb">{result.protection.acBreakerA}A</text>
                  </g>

                  {/* Grid Line */}
                  <line x1={startX+570} y1={startY+((result.strings.length-1)*40)+20} x2={startX+650} y2={startY+((result.strings.length-1)*40)+20} stroke="#334155" strokeWidth="2" markerEnd="url(#arrow)" />

                   <g transform={`translate(${startX+650}, ${startY + ((result.strings.length-1)*40) + 5})`}>
                      <path d="M0,15 L15,-15 L30,15 L45,-15" fill="none" stroke="#334155" strokeWidth="2" />
                      <text x="22" y="35" textAnchor="middle" fontSize="12" fontWeight="bold">REDE</text>
                   </g>

              </svg>
          </div>
      </div>
    </div>
  );
};