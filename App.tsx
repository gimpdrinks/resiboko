// In gimpdrinks/resiboko-tracker/ResiboKo-Tracker-cab70c7bf9af567b29a14ea3d72eb52679fa7e52/App.tsx

import React, { useState, useCallback, useEffect } from 'react';
// --- NEW: Import Firestore functions ---
import { collection, addDoc, query, onSnapshot, deleteDoc, doc, orderBy } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
// --- NEW: Import both 'auth' and 'firestore' ---
import { auth, firestore } from './firebaseConfig';
import { analyzeReceipt } from './services/geminiService';
import { ReceiptData, SavedReceiptData } from './types';
import ImageUploader from './components/ImageUploader';
import ResultDisplay from './components/ResultDisplay';
import ManualEntry from './components/ManualEntry';
import CameraCapture from './components/CameraCapture';
import TransactionHistory from './components/TransactionHistory';
import AIAnalytics from './components/AIAnalytics';
import Spinner from './components/Spinner';
import { CameraIcon } from './components/icons/CameraIcon';
import { PlusCircleIcon } from './components/icons/PlusCircleIcon';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [savedReceipts, setSavedReceipts] = useState<SavedReceiptData[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showManualEntry, setShowManualEntry] = useState<boolean>(false);
    const [showCamera, setShowCamera] = useState<boolean>(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);
    
    // --- NEW: Real-time listener for Firestore data ---
    useEffect(() => {
        // If there's no user, we don't fetch data.
        if (!user) {
            setSavedReceipts([]); // Clear receipts when user logs out
            return;
        }

        // Create a query to get receipts for the current user, ordered by date.
        const receiptsCollection = collection(firestore, "users", user.uid, "receipts");
        const q = query(receiptsCollection, orderBy("transaction_date", "desc"));

        // onSnapshot is a real-time listener. It runs whenever the data changes in Firestore.
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const receiptsFromFirestore: SavedReceiptData[] = [];
            querySnapshot.forEach((doc) => {
                // We combine the document ID (which we'll use for deleting) with the document data.
                receiptsFromFirestore.push({ id: doc.id, ...doc.data() } as SavedReceiptData);
            });
            setSavedReceipts(receiptsFromFirestore);
        }, (error) => {
            console.error("Error fetching receipts:", error);
            // Handle errors, e.g., show a notification to the user
        });

        // Cleanup the listener when the component unmounts or the user changes.
        return () => unsubscribe();
    }, [user]); // This useEffect re-runs whenever the 'user' state changes.

    const handleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Authentication error:", error);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Sign out error:", error);
        }
    };

    // --- REMOVED: The two useEffects for localStorage are now gone. ---

    const handleImageSelect = useCallback(async (file: File) => {
        setIsLoading(true);
        setError(null);
        setReceiptData(null);
        try {
            const data = await analyzeReceipt(file);
            if (data.transaction_date) {
                const receiptYear = new Date(data.transaction_date).getFullYear();
                const currentYear = new Date().getFullYear();
                if (receiptYear !== currentYear) {
                    setError(`This receipt is from ${receiptYear}. Only transactions for the current year (${currentYear}) are allowed.`);
                    setIsLoading(false);
                    return;
                }
            }
            setReceiptData(data);
        } catch (err) {
            console.error(err);
            setError('Failed to analyze the receipt. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- MODIFIED: handleSaveReceipt now saves to Firestore ---
    const handleSaveReceipt = useCallback(async (data: ReceiptData) => {
        // First, check if a user is logged in.
        if (!user) {
            setError("You must be logged in to save receipts.");
            return;
        }

        if (!data.transaction_name || data.total_amount === null || !data.transaction_date || !data.category) {
            setError("Cannot save incomplete receipt data.");
            return;
        }
        
        try {
            // This creates a reference to the 'receipts' subcollection for the current user.
            const userReceiptsCollection = collection(firestore, "users", user.uid, "receipts");
            // addDoc adds a new document to that collection. Firestore automatically generates a unique ID.
            await addDoc(userReceiptsCollection, data);
            
            // Because of our real-time listener, we don't need to manually update the state here.
            // Firestore will automatically push the update to our app.
            setReceiptData(null);
            setShowManualEntry(false);
        } catch (error) {
            console.error("Error saving receipt:", error);
            setError("Failed to save the receipt. Please try again.");
        }
    }, [user]); // We add 'user' as a dependency.
    
    const handleDiscard = () => {
        setReceiptData(null);
        setError(null);
    };
    
    // --- MODIFIED: handleDeleteReceipt now deletes from Firestore ---
    const handleDeleteReceipt = async (id: string) => {
        if (!user) {
            setError("You must be logged in to delete receipts.");
            return;
        }
        try {
            // Create a reference directly to the document we want to delete.
            const receiptDocRef = doc(firestore, "users", user.uid, "receipts", id);
            await deleteDoc(receiptDocRef);
        } catch (error) {
            console.error("Error deleting receipt:", error);
            setError("Failed to delete the receipt. Please try again.");
        }
    };

    // The rest of your JSX remains the same...
    return (
        <div className="bg-slate-100 min-h-screen font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto py-3 px-4">
                   {/* Logo and Title - Centered */}
                   <div className="flex flex-col items-center justify-center mb-3">
                       <img src="https://res.cloudinary.com/dbylka4xx/image/upload/v1751883360/AiForPinoys_Logo_ttg2id.png" alt="Ai For Pinoys Logo" className="h-14 sm:h-16 w-auto mb-2"/>
                       <h1 className="text-2xl font-bold font-poppins text-slate-800">ResiboKo</h1>
                   </div>

                   {/* User Auth - Centered */}
                   <div className="flex justify-center">
                       {user ? (
                           <div className="flex items-center gap-3">
                               <img src={user.photoURL || ''} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full" />
                               <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.displayName}</span>
                               <button onClick={handleSignOut} className="px-3 py-1.5 text-sm bg-slate-700 text-white font-semibold rounded-lg shadow-sm hover:bg-slate-800 transition-colors">
                                   Sign Out
                               </button>
                           </div>
                       ) : (
                           <button onClick={handleSignIn} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
                               Sign In with Google
                           </button>
                       )}
                   </div>
                </div>
            </header>

            {!user ? (
                <div className="text-center py-20">
                    <h2 className="text-3xl font-bold text-slate-800">Welcome to ResiboKo!</h2>
                    <p className="mt-2 text-slate-600">Please sign in to manage your receipts.</p>
                </div>
            ) : (
                <main className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                    <div className="p-6 bg-white rounded-2xl shadow-lg border border-slate-200">
                        {!receiptData && !isLoading && (
                         <>
                            <h2 className="text-xl font-bold text-slate-800 mb-1 text-center">Upload a Receipt</h2>
                            <p className="text-slate-500 mb-6 text-center text-sm">Extract transaction data using AI.</p>
                            <ImageUploader onImageSelect={handleImageSelect} />
                            <div className="my-4 flex items-center text-slate-400 text-sm">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink mx-4">OR</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>
                            <div className="space-y-3">
                                <button onClick={() => setShowCamera(true)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-white bg-slate-700 hover:bg-slate-800 rounded-lg font-semibold transition-colors shadow-sm">
                                    <CameraIcon className="w-5 h-5" />
                                    Use Camera
                                </button>
                                 <button onClick={() => setShowManualEntry(true)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-white bg-slate-700 hover:bg-slate-800 rounded-lg font-semibold transition-colors shadow-sm">
                                    <PlusCircleIcon className="w-5 h-5" />
                                    Manual / Voice Entry
                                </button>
                             </div>
                         </>
                        )}
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center p-8">
                                <Spinner className="w-10 h-10 text-indigo-600" />
                                <p className="mt-4 text-slate-600 font-semibold">Analyzing your receipt...</p>
                                <p className="text-sm text-slate-500">This may take a moment.</p>
                            </div>
                        )}
                         {error && !isLoading && (
                             <div className="text-center p-4">
                                 <p className="text-red-600 font-semibold">Analysis Failed</p>
                                 <p className="text-slate-600 mt-1">{error}</p>
                                 <button onClick={handleDiscard} className="mt-4 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg">
                                     Try Again
                                </button>
                             </div>
                        )}
                        {receiptData && !isLoading && (
                            <ResultDisplay 
                                data={receiptData} 
                                onSave={handleSaveReceipt} 
                                onDiscard={handleDiscard} 
                            />
                        )}
                    </div>
                    
                    <TransactionHistory 
                        receipts={savedReceipts}
                        onDelete={handleDeleteReceipt}
                    />

                    <AIAnalytics receipts={savedReceipts} />
                </main>
            )}
            
            {showManualEntry && (
                <ManualEntry 
                    onClose={() => setShowManualEntry(false)}
                    onSave={handleSaveReceipt}
                />
            )}
            
            {showCamera && (
                <CameraCapture
                    onClose={() => setShowCamera(false)}
                    onCapture={(file) => {
                        setShowCamera(false);
                        handleImageSelect(file);
                    }}
                />
            )}
        </div>
    );
};

export default App;