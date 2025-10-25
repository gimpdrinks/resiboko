import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { SavedReceiptData } from '../types';
import { getSpendingAnalysis, findCashLeaks } from '../services/geminiService';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { SearchIcon } from './icons/SearchIcon';

interface AIAnalyticsProps {
    receipts: SavedReceiptData[];
}

const AIAnalytics: React.FC<AIAnalyticsProps> = ({ receipts }) => {
    const [query, setQuery] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzingLeaks, setIsAnalyzingLeaks] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const examplePrompts = [
        "How much did I spend on food this month?",
        "What are my top 3 spending categories?",
        "Show me my expenses from last week.",
        "What was my most expensive purchase?",
    ];

    const handleGetInsights = async () => {
        if (!query.trim() || receipts.length === 0) return;

        setIsLoading(true);
        setError(null);
        setAnalysis('');

        try {
            const result = await getSpendingAnalysis(receipts, query);
            setAnalysis(result);
        } catch (err) {
            console.error(err);
            setError('Failed to get insights. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePromptClick = (prompt: string) => {
        setQuery(prompt);
    }

    const handleFindCashLeaks = async () => {
        if (receipts.length === 0) return;

        setIsAnalyzingLeaks(true);
        setError(null);
        setAnalysis('');

        try {
            console.log('Starting cash leak analysis with', receipts.length, 'transactions');
            const result = await findCashLeaks(receipts);
            console.log('Cash leak analysis result:', result);
            setAnalysis(result);
        } catch (err) {
            console.error('Cash leak analysis error:', err);
            if (err instanceof Error) {
                console.error('Error details:', err.message, err.stack);
                setError(`Failed to analyze: ${err.message}`);
            } else {
                setError('Failed to analyze cash leaks. Please try again.');
            }
        } finally {
            setIsAnalyzingLeaks(false);
        }
    };

    return (
        <div className="p-6 bg-white rounded-2xl shadow-lg border border-slate-200 animate-fade-in-up">
            <div className="flex items-center gap-3">
                 <SparklesIcon className="w-8 h-8 text-indigo-500" />
                 <div>
                    <h2 className="text-xl font-bold text-slate-800">AI Financial Assistant</h2>
                    <p className="text-sm text-slate-500 mt-1">Ask questions about your spending.</p>
                </div>
            </div>
            
            {receipts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                    <p>Add some transactions to start analyzing your spending.</p>
                </div>
            ) : (
                <div className="mt-6">
                    {/* Cash Leak Detector Section */}
                    <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <SearchIcon className="w-5 h-5 text-orange-600" />
                            <h3 className="font-bold text-slate-800">Find My Tipid Opportunities 💰</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-3">
                            Let Piso analyze your spending patterns and discover potential savings opportunities!
                        </p>
                        <button
                            onClick={handleFindCashLeaks}
                            disabled={isAnalyzingLeaks}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-white bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition-colors shadow-sm disabled:bg-orange-400 disabled:cursor-not-allowed"
                        >
                            {isAnalyzingLeaks ? <Spinner className="w-5 h-5" /> : <SearchIcon className="w-5 h-5" />}
                            {isAnalyzingLeaks ? 'Analyzing Your Spending...' : 'Find Cash Leaks 🔍'}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center text-slate-400 text-sm mb-6">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-4">OR ASK A QUESTION</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    {/* Q&A Section */}
                     <div className="space-y-2">
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g., How much did I spend on groceries this week?"
                            className="w-full px-3 py-2 text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow"
                            rows={3}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleGetInsights();
                                }
                            }}
                        />
                         <div className="flex flex-wrap gap-2">
                            {examplePrompts.map(prompt => (
                                <button key={prompt} onClick={() => handlePromptClick(prompt)} className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 transition-colors">
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleGetInsights}
                        disabled={isLoading || !query.trim()}
                        className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-white bg-slate-700 hover:bg-slate-800 rounded-lg font-semibold transition-colors shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Spinner /> : <SparklesIcon className="w-5 h-5" />}
                        {isLoading ? 'Analyzing...' : 'Ask Piso 💬'}
                    </button>
                    {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}

                    {analysis && !isLoading && !isAnalyzingLeaks && (
                        <div className="mt-6 p-5 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <SparklesIcon className="w-6 h-6 text-indigo-600" />
                                <h3 className="font-bold text-lg text-slate-800">Piso's Insights:</h3>
                            </div>
                            <div className="piso-tips-content prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                <ReactMarkdown
                                    components={{
                                        h2: ({node, ...props}) => <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3 flex items-center gap-2" {...props} />,
                                        h3: ({node, ...props}) => <h3 className="text-lg font-bold text-orange-700 mt-4 mb-2" {...props} />,
                                        strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                                        em: ({node, ...props}) => <em className="italic text-indigo-700" {...props} />,
                                        ul: ({node, ...props}) => <ul className="list-none space-y-2 my-3 pl-2" {...props} />,
                                        li: ({node, ...props}) => <li className="text-slate-700 leading-relaxed" {...props} />,
                                        p: ({node, ...props}) => <p className="my-2 leading-relaxed" {...props} />,
                                        hr: ({node, ...props}) => <hr className="my-4 border-t-2 border-orange-200" {...props} />,
                                    }}
                                >
                                    {analysis}
                                </ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AIAnalytics;
