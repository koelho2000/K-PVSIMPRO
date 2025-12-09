import React, { useState, useEffect } from 'react';
import { ProjectState, BudgetItem } from '../types';
import { calculateDetailedBudget } from '../services/pricing';
import { Calculator, Plus, Trash2, RotateCcw, Save, DollarSign, FileText } from 'lucide-react';

interface Props {
    project: ProjectState;
    onUpdate: (budget: BudgetItem[]) => void;
}

const CATEGORIES = ['Modules', 'Inverter', 'Battery', 'Structure', 'Electrical', 'Labor', 'Services', 'Other'];

export const BudgetEditor: React.FC<Props> = ({ project, onUpdate }) => {
    // Local state for editing
    const [items, setItems] = useState<BudgetItem[]>([]);

    useEffect(() => {
        if (project.budget && project.budget.length > 0) {
            setItems(project.budget);
        } else {
            handleResetToAuto();
        }
    }, []);

    // Sync to parent when items change (debounced or on blur? doing simple sync for now)
    useEffect(() => {
        if (items.length > 0) {
           // We don't auto-sync constantly to avoid parent re-renders if not needed, 
           // but for this app structure, we need to save eventually.
           // Ideally we save on a button press or on unmount, but let's provide a save button.
        }
    }, [items]);

    const handleResetToAuto = () => {
        const auto = calculateDetailedBudget(project);
        setItems(auto);
        onUpdate(auto); // Auto-save on reset
    };

    const handleSave = () => {
        onUpdate(items);
        alert("Orçamento guardado com sucesso!");
    };

    const handleItemChange = (index: number, field: keyof BudgetItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        
        // Recalculate total if price/qty changes
        if (field === 'quantity' || field === 'unitPrice') {
            newItems[index].totalPrice = newItems[index].quantity * newItems[index].unitPrice;
        }
        setItems(newItems);
    };

    const handleAddItem = () => {
        const newItem: BudgetItem = {
            category: 'Other',
            description: 'Novo Artigo',
            unit: 'un',
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const subtotal = items.reduce((acc, item) => acc + item.totalPrice, 0);
    const tax = subtotal * 0.06; // IVA
    const total = subtotal + tax;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow border border-gray-100">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Calculator className="text-blue-600"/> Editor de Orçamento
                    </h3>
                    <p className="text-sm text-gray-500">
                        Edite quantidades, preços ou adicione novos artigos. Este orçamento será usado no Relatório Final.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={handleResetToAuto}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 text-sm font-medium"
                    >
                        <RotateCcw size={16}/> Restaurar Automático
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow text-sm font-bold"
                    >
                        <Save size={16}/> Guardar Alterações
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow border overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4 w-32">Categoria</th>
                            <th className="p-4">Descrição</th>
                            <th className="p-4 w-20 text-center">Un.</th>
                            <th className="p-4 w-24 text-center">Qtd.</th>
                            <th className="p-4 w-32 text-right">Preço Un. (€)</th>
                            <th className="p-4 w-32 text-right">Total (€)</th>
                            <th className="p-4 w-16 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="p-2">
                                    <select 
                                        className="w-full border rounded p-1 bg-transparent"
                                        value={item.category}
                                        onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="text" 
                                        className="w-full border rounded p-1 px-2"
                                        value={item.description}
                                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="text" 
                                        className="w-full border rounded p-1 text-center"
                                        value={item.unit}
                                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="0.1"
                                        className="w-full border rounded p-1 text-center font-bold text-blue-800"
                                        value={item.quantity}
                                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value))}
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="0.01"
                                        className="w-full border rounded p-1 text-right"
                                        value={item.unitPrice}
                                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value))}
                                    />
                                </td>
                                <td className="p-4 text-right font-bold text-slate-700">
                                    {item.totalPrice.toLocaleString('pt-PT', {minimumFractionDigits: 2})}
                                </td>
                                <td className="p-2 text-center">
                                    <button 
                                        onClick={() => handleRemoveItem(idx)}
                                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                                        title="Remover linha"
                                    >
                                        <Trash2 size={16}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="p-4 border-t bg-gray-50">
                    <button 
                        onClick={handleAddItem}
                        className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:underline"
                    >
                        <Plus size={16}/> Adicionar Artigo
                    </button>
                </div>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200 w-full md:w-1/3">
                    <h4 className="font-bold text-gray-600 border-b pb-2 mb-4">Resumo Financeiro</h4>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Subtotal (S/ IVA)</span>
                            <span className="font-bold text-gray-800">{subtotal.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">IVA (6%)</span>
                            <span className="font-bold text-gray-800">{tax.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                        </div>
                        <div className="flex justify-between text-xl font-extrabold text-blue-900 border-t pt-4 mt-2">
                            <span>TOTAL FINAL</span>
                            <span>{total.toLocaleString('pt-PT', {style:'currency', currency:'EUR'})}</span>
                        </div>
                    </div>
                    <div className="mt-4 bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200 flex items-start gap-2">
                        <FileText size={16} className="shrink-0 mt-0.5"/>
                        <p>
                            Não se esqueça de clicar em <strong>Guardar Alterações</strong> para que este valor seja refletido no Relatório e no cálculo de ROI (Retorno).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};