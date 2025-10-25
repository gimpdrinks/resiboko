import { GoogleGenAI, Type } from "@google/genai";
import { ReceiptData, SavedReceiptData } from '../types';

// Initialize GoogleGenAI with API key from environment variables.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

const categories = [
    "Food & Drink", "Groceries", "Transportation", "Shopping", "Utilities",
    "Entertainment", "Health & Wellness", "Travel", "Rent", "Other"
];

export const analyzeReceipt = async (imageFile: File): Promise<ReceiptData> => {
  // FIX: Use a model that supports multimodal input.
  const model = 'gemini-2.5-flash';
  
  const imagePart = await fileToGenerativePart(imageFile);

  const prompt = `Analyze the receipt image and extract the following information. The transaction date should be in YYYY-MM-DD format. For the category, choose the most appropriate one from this list: ${categories.join(', ')}. If any information is not found, return null for that field.`;

  // FIX: Use generateContent with responseSchema for structured JSON output.
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { text: prompt },
        imagePart,
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transaction_name: { type: Type.STRING, description: "The name of the merchant or transaction." },
          total_amount: { type: Type.NUMBER, description: "The final total amount of the transaction." },
          transaction_date: { type: Type.STRING, description: "The date of the transaction in YYYY-MM-DD format. If the user says 'today', use the current date." },
          category: { type: Type.STRING, description: `The category of the purchase. Must be one of: ${categories.join(', ')}.` },
        },
      },
    },
  });

  // FIX: Correctly parse the JSON response from the 'text' property.
  const jsonText = response.text.trim();
  const data = JSON.parse(jsonText) as ReceiptData;

  // Validate and clean up data
  const validatedData: ReceiptData = {
      transaction_name: data.transaction_name || null,
      total_amount: typeof data.total_amount === 'number' ? data.total_amount : null,
      transaction_date: data.transaction_date || null,
      category: data.category && categories.includes(data.category) ? data.category : 'Other',
  };
  
  return validatedData;
};

export const analyzeTransactionFromVoice = async (audioFile: File): Promise<ReceiptData> => {
    try {
        const model = 'gemini-2.5-flash';

        console.log('Starting voice analysis with file:', audioFile.name, audioFile.type, audioFile.size);

        const audioPart = await fileToGenerativePart(audioFile);

        const today = new Date().toISOString().slice(0, 10);

        const prompt = `Analyze the following audio and extract the transaction details. Today's date is ${today}. For the category, choose the most appropriate one from this list: ${categories.join(', ')}. If any information is not found, return null for that field. Please listen carefully to extract: transaction name, amount in pesos, date (or use today if not specified), and category.`;

        console.log('Sending request to Gemini API...');
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }, audioPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        transaction_name: { type: Type.STRING, nullable: true },
                        total_amount: { type: Type.NUMBER, nullable: true },
                        transaction_date: { type: Type.STRING, description: `The date in YYYY-MM-DD format. If the user says 'today', use ${today}.`, nullable: true },
                        category: { type: Type.STRING, description: `Must be one of: ${categories.join(', ')}.`, nullable: true },
                    },
                },
            },
        });

        console.log('Received response from Gemini API');
        const jsonText = response.text.trim();
        console.log('Response text:', jsonText);

        const data = JSON.parse(jsonText) as ReceiptData;

        // Validate and clean up data
        const validatedData: ReceiptData = {
            transaction_name: data.transaction_name || null,
            total_amount: typeof data.total_amount === 'number' ? data.total_amount : null,
            transaction_date: data.transaction_date || today,
            category: data.category && categories.includes(data.category) ? data.category : 'Other',
        };

        console.log('Validated data:', validatedData);
        return validatedData;
    } catch (error) {
        console.error('Error in analyzeTransactionFromVoice:', error);
        if (error instanceof Error) {
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
};

const formatTransactionsForAI = (transactions: SavedReceiptData[]): string => {
  if (transactions.length === 0) return "No transactions available.";
  
  let formattedString = "Date,Transaction,Amount,Category\n";
  
  transactions.forEach(t => {
    const row = [
      t.transaction_date || 'N/A',
      t.transaction_name || 'N/A',
      t.total_amount?.toFixed(2) || '0.00',
      t.category || 'N/A'
    ].join(',');
    formattedString += row + "\n";
  });
  
  return formattedString;
};

export const getSpendingAnalysis = async (transactions: SavedReceiptData[], query: string): Promise<string> => {
    const model = 'gemini-2.5-flash';

    const transactionData = formatTransactionsForAI(transactions);

    // Piso persona for Q&A
    const prompt = `**Persona:** You are "Piso," a friendly, savvy, and encouraging Filipino financial coach. Use encouraging language and incorporate "Taglish" naturally (e.g., "sayang," "galing," "konting-konti lang"). All currency is Philippine Peso (PHP).

    **Objective:** Answer the user's question about their spending based on the transaction data in CSV format. Be concise, clear, and use the '₱' symbol for all currency amounts. Make your response practical and culturally relevant.

    Transaction Data:
    ${transactionData}

    User's Question: "${query}"

    Your analysis:`;

    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
    });

    return response.text;
};

// New function for finding cash leaks / tipid opportunities
export const findCashLeaks = async (transactions: SavedReceiptData[]): Promise<string> => {
    try {
        console.log('findCashLeaks called with', transactions.length, 'transactions');

        if (transactions.length === 0) {
            return "Wala pang transactions to analyze! Add some receipts first. 😊";
        }

        const model = 'gemini-2.5-flash';

        const transactionData = formatTransactionsForAI(transactions);
        console.log('Formatted transaction data:', transactionData);

        // Determine today's date in the Philippines timezone
        const todayPH = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });

    const prompt = `
        **Persona:** You are "Piso," a friendly, savvy, and encouraging Filipino financial coach. Your goal is to empower the user to make smarter spending choices without judgment. Use encouraging language and incorporate "Taglish" naturally (e.g., "sayang," "galing," "konting-konti lang"). All currency is Philippine Peso (PHP). Today's date is ${todayPH}.

        **Objective:** Analyze the provided transaction data (CSV format) to identify potential monthly **tipid opportunities** totaling at least ₱1,000. A **tipid opportunity** is defined as inefficient spending or a clear missed savings opportunity based on common patterns in the Philippines. Do NOT ask for or assume a budget. Your analysis must be practical and culturally relevant.

        **Analysis Categories (Identify the Top 3 Opportunities):**

        1.  **"Piso-Piso" Fees (Small, Recurring Charges):**
            * Scan transaction names for keywords like 'convenience fee', 'delivery fee', 'service charge', 'transfer fee', 'bank fee', 'ATM fee'.
            * Sum them up. Emphasize how these small, often unnoticed, fees accumulate significantly over a month.

        2.  **"Suki" Habits (Frequent, Unconscious Spending):**
            * Identify high-frequency purchases (≥ 4 times/week or ≥ 15 times/month) from specific vendors or categories known for impulse buys in the PH (e.g., 'GrabFood', 'FoodPanda', '7-Eleven', 'Alfamart', 'Ministop', 'Starbucks', 'Jollibee', 'McDonalds', 'Milk Tea', 'Kape').
            * Specifically note patterns like multiple purchases in a single day, or frequent late-night orders (after 10 PM). Calculate the total monthly spend on the most frequent habit.

        3.  **"Sayang" Swaps (Missed Savings Opportunities):**
            * **Mobile Load:** If multiple small 'load' purchases (e.g., ₱50, ₱100, totaling >₱500/month) are detected, strongly suggest a specific, better-value 30-day data promo available from major carriers (like Smart's 'Giga Power 499/799' or Globe's 'Go+499'). Calculate the exact potential monthly savings.
            * **Commute Costs:** If frequent short-distance 'Grab' or 'Angkas' rides (e.g., >10 rides/month, average cost <₱150) are present, suggest substituting some trips with jeepney (₱15-30) or trike (₱40-60) and estimate the significant potential savings.
            * **Coffee/Snacks:** If frequent coffee shop or snack purchases (e.g., >15 times/month) are noted, calculate the monthly total and contrast it with the cost of making coffee/snacks at home/office.
            * **Subscriptions:** Check for multiple recurring monthly charges (e.g., 'Netflix', 'Spotify', 'HBO Go', 'YouTube Premium', 'Apple Music'). Gently question if all are actively used and suggest reviewing them.

        **Output Format (Strictly follow this):**

        Start with a cheerful, personalized greeting and state the total potential savings found. Use relevant Filipino emojis (🇵🇭✨👍💪).

        Then, for each of the top 3 **tipid opportunities** identified, create a "Piso Tip" card:

        ---
        **Piso Tip #[Number]: [Catchy Opportunity Title - e.g., Yung Pang-Kape Habit Mo! ☕️]**
        * **Observation:** [Simple, non-judgmental sentence describing the pattern found in the data. Be specific with numbers. e.g., "Hey! Napansin ko na naka-22 ka na kape run this month, totalling ₱3,300."]
        * **Insight:** [Explain *why* it's a potential opportunity, often highlighting the long-term cost or inefficiency. e.g., "Wow, that's almost ₱40,000 a year just on coffee! Sayang din, diba?"]
        * **Actionable Tip:** [Provide a simple, concrete, culturally relevant suggestion with calculated potential savings. e.g., "Subukan mo mag-brew ng sarili mong kape on weekdays. If you do that Monday to Friday, you could save around **₱2,500** every month! Pwede na pang-extra savings! 👍"]
        ---

        End with an encouraging sign-off, reinforcing the user's effort and the small steps needed.

        **Example Report Snippet:**

        "Uy! Galing ng pag-track mo this month! Ako si Piso, your friendly financial coach. 🙌 Tingnan mo, I found over **₱1,850** in potential monthly savings for you! 🇵🇭✨ Eto yung top 3 **tipid opportunities** na nakita ko:

        ---
        **Piso Tip #1: Watch Out sa Delivery Fees! 🛵**
        * **Observation:** Nakita ko na may 12 kang GrabFood orders this month with delivery fees adding up to ₱588.
        * **Insight:** That's almost ₱7,000 a year just for delivery! Minsan okay lang, pero madalas sayang din.
        * **Actionable Tip:** Try planning meals or check for free delivery promos. Cutting back on just half of those deliveries could save you nearly **₱300** monthly! Konting tipid, malaking bagay! 😉
        ---
        [... Continue for Tip #2 and #3 ...]

        Keep up the amazing work tracking your expenses! Remember, small changes lead to big results. Laban lang! 💪"

        **Now, analyze the following transaction data:**
        ${transactionData}
    `;

        console.log('Sending request to Gemini API for cash leak analysis...');
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });

        console.log('Received response from Gemini API');
        const resultText = response.text;
        console.log('Response text length:', resultText.length);

        return resultText;
    } catch (error) {
        console.error('Error in findCashLeaks:', error);
        if (error instanceof Error) {
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
};