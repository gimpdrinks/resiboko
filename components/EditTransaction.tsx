import React, { useState, useEffect } from 'react';
import { SavedReceiptData } from '../types';
import { PlusCircleIcon } from './icons/PlusCircleIcon';

interface EditTransactionProps {
  transaction: SavedReceiptData;
  onClose: () => void;
  onSave: (id: string, updatedData: Partial<SavedReceiptData>) => void;
}

const categories = [
    "Food & Drink", "Groceries", "Transportation", "Shopping", "Utilities",
    "Entertainment", "Health & Wellness", "Travel", "Rent", "Other"
];

const EditTransaction: React.FC<EditTransactionProps> = ({ transaction, onClose, onSave }) => {
  const [transactionName, setTransactionName] = useState(transaction.transaction_name || '');
  const [totalAmount, setTotalAmount] = useState(transaction.total_amount?.toString() || '');
  const [transactionDate, setTransactionDate] = useState(transaction.transaction_date || '');
  const [category, setCategory] = useState(transaction.category || 'Other');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);
    if (transactionName && !isNaN(amount) && transactionDate && category) {
      onSave(transaction.id, {
        transaction_name: transactionName,
        total_amount: amount,
        transaction_date: transactionDate,
        category: category,
      });
      onClose();
    } else {
        alert("Please fill in all fields correctly.");
    }
  };

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold font-poppins text-slate-800">Edit Transaction</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="transactionName" className="block text-sm font-medium text-slate-600 mb-1">
              Transaction Name
            </label>
            <input
              id="transactionName" type="text" value={transactionName} onChange={(e) => setTransactionName(e.target.value)}
              className="w-full px-3 py-2 text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., Bus Fare" required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label htmlFor="totalAmount" className="block text-sm font-medium text-slate-600 mb-1">Amount</label>
                  <input
                      id="totalAmount" type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                      className="w-full px-3 py-2 text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g., 20.00" required
                  />
              </div>
              <div>
                   <label htmlFor="transactionDate" className="block text-sm font-medium text-slate-600 mb-1">Date</label>
                  <input
                      id="transactionDate" type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)}
                      className="w-full px-3 py-2 text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" required
                  />
              </div>
          </div>
          <div>
             <label htmlFor="category" className="block text-sm font-medium text-slate-600 mb-1">Category</label>
            <select
              id="category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" required
            >
              {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <PlusCircleIcon className="w-5 h-5" />
            Update Transaction
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditTransaction;
