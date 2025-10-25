# Google Sheets OAuth 2.0 Implementation Guide
## Multi-User Google Sheets Sync for ResiboKo

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Google Cloud Console Setup](#google-cloud-console-setup)
5. [Firebase Setup](#firebase-setup)
6. [Implementation Steps](#implementation-steps)
7. [Code Changes](#code-changes)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### Current Implementation (Apps Script)
- **Problem**: All users sync to ONE Google Sheet owned by you
- **Method**: Direct POST to Apps Script URL with `no-cors`
- **Limitation**: Not scalable, privacy concerns, no user control

### New Implementation (OAuth 2.0)
- **Solution**: Each user syncs to THEIR OWN Google Sheet
- **Method**: OAuth 2.0 flow → Firebase Functions → Google Sheets API
- **Benefits**:
  - User-owned data in their Google Drive
  - Secure token management
  - Scalable for multiple users
  - Better privacy and control

---

## Prerequisites

### 1. Firebase Plan
- **Current**: Spark (free) plan
- **Required**: **Blaze (Pay-as-you-go)** plan
- **Why**: Firebase Functions require Blaze plan
- **Cost**: Very low for small apps (~$0.40/month for 1M invocations)
- **How to Upgrade**:
  ```
  Firebase Console → Project Settings → Usage and billing → Upgrade
  ```

### 2. Accounts & Access
- ✅ Google Account (you have this)
- ✅ Firebase Project: `resiboko-tracker` (you have this)
- ✅ Google Cloud Project (auto-created with Firebase)
- ⚠️ Billing Account (needed for Blaze plan)

### 3. APIs to Enable
- Google Sheets API
- Google Drive API
- Cloud Functions API (auto-enabled with Blaze plan)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Flow                               │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Connect Google Sheets" button
   ↓
2. OAuth popup opens (Google consent screen)
   ↓
3. User grants permissions:
   - View and manage Google Drive files
   - Create and update Google Sheets
   ↓
4. Google redirects with authorization code
   ↓
5. Frontend calls Firebase Function: exchangeOAuthToken(code)
   ↓
6. Function exchanges code for access_token & refresh_token
   ↓
7. Function stores tokens in Firestore:
   users/{uid}/sheetsAuth/{
     accessToken: "...",
     refreshToken: "...",
     expiresAt: timestamp,
     sheetId: null  // Created on first sync
   }
   ↓
8. User clicks "Sync to Google Sheets"
   ↓
9. Frontend calls Firebase Function: syncToGoogleSheets()
   ↓
10. Function:
    - Retrieves user's tokens from Firestore
    - Checks if sheet exists, creates if not
    - Reads receipts from users/{uid}/receipts
    - Writes data to user's Google Sheet using Sheets API
    ↓
11. Success! Data synced to user's personal Google Sheet
```

---

## Google Cloud Console Setup

### Step 1: Access Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Select your project: `resiboko-tracker`

### Step 2: Enable Required APIs
```
Navigation Menu → APIs & Services → Library
```

Search and enable:
- ✅ **Google Sheets API**
- ✅ **Google Drive API**

### Step 3: Configure OAuth Consent Screen
```
Navigation Menu → APIs & Services → OAuth consent screen
```

**Configuration:**
- **User Type**: External (for public app)
- **App name**: `ResiboKo`
- **User support email**: Your email
- **Developer contact**: Your email
- **Scopes to add**:
  ```
  https://www.googleapis.com/auth/drive.file
  https://www.googleapis.com/auth/spreadsheets
  ```
- **Test users** (for testing phase): Add your email and test accounts

### Step 4: Create OAuth 2.0 Client ID
```
Navigation Menu → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
```

**Configuration:**
- **Application type**: Web application
- **Name**: `ResiboKo Web Client`
- **Authorized JavaScript origins**:
  ```
  http://localhost:3000
  https://resiboko-tracker.web.app
  https://resiboko-tracker.firebaseapp.com
  ```
- **Authorized redirect URIs**:
  ```
  http://localhost:3000
  https://resiboko-tracker.web.app
  https://resiboko-tracker.firebaseapp.com
  ```

**Save these credentials:**
- Client ID: `YOUR_CLIENT_ID.apps.googleusercontent.com`
- Client Secret: `YOUR_CLIENT_SECRET` (keep this secure!)

---

## Firebase Setup

### Step 1: Upgrade to Blaze Plan
```bash
# Via Firebase Console
Firebase Console → Project Settings → Usage and billing → Upgrade to Blaze

# Or via CLI
firebase projects:addfirebase resiboko-tracker
```

### Step 2: Initialize Firebase Functions
```bash
cd /Users/Gian/Documents/Ai\ Studio\ Web\ Applications/resiboko-scanner

# Initialize Functions (if not already done)
firebase init functions

# Select:
# - Language: TypeScript
# - ESLint: Yes
# - Install dependencies: Yes
```

This creates:
```
functions/
├── src/
│   └── index.ts          # Your functions code
├── package.json
├── tsconfig.json
└── .gitignore
```

### Step 3: Install Required Dependencies
```bash
cd functions

npm install googleapis firebase-admin firebase-functions
npm install --save-dev @types/node
```

---

## Implementation Steps

### Phase 1: Backend (Firebase Functions)

#### File: `functions/src/index.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';

admin.initializeApp();
const db = admin.firestore();

// OAuth Configuration
const OAUTH_CONFIG = {
  clientId: functions.config().google.client_id,
  clientSecret: functions.config().google.client_secret,
  redirectUri: 'https://resiboko-tracker.web.app', // Your production URL
};

// ============================================================
// FUNCTION 1: Exchange OAuth Code for Tokens
// ============================================================
export const exchangeOAuthToken = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const { code } = data;
  const uid = context.auth.uid;

  try {
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      OAUTH_CONFIG.clientId,
      OAUTH_CONFIG.clientSecret,
      OAUTH_CONFIG.redirectUri
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in Firestore
    await db.collection('users').doc(uid).collection('sheetsAuth').doc('tokens').set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sheetId: null, // Will be set on first sync
    });

    return { success: true, message: 'Google Sheets connected successfully!' };
  } catch (error) {
    console.error('Error exchanging OAuth token:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to connect Google Sheets'
    );
  }
});

// ============================================================
// FUNCTION 2: Sync Receipts to User's Google Sheet
// ============================================================
export const syncToGoogleSheets = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const uid = context.auth.uid;

  try {
    // 1. Get user's OAuth tokens from Firestore
    const authDoc = await db
      .collection('users')
      .doc(uid)
      .collection('sheetsAuth')
      .doc('tokens')
      .get();

    if (!authDoc.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Please connect Google Sheets first'
      );
    }

    const authData = authDoc.data()!;

    // 2. Set up OAuth2 client with stored tokens
    const oauth2Client = new google.auth.OAuth2(
      OAUTH_CONFIG.clientId,
      OAUTH_CONFIG.clientSecret,
      OAUTH_CONFIG.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: authData.accessToken,
      refresh_token: authData.refreshToken,
      expiry_date: authData.expiresAt,
    });

    // 3. Refresh token if expired
    if (Date.now() >= authData.expiresAt) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await authDoc.ref.update({
        accessToken: credentials.access_token,
        expiresAt: credentials.expiry_date,
      });
      oauth2Client.setCredentials(credentials);
    }

    // 4. Get user's receipts from Firestore
    const receiptsSnapshot = await db
      .collection('users')
      .doc(uid)
      .collection('receipts')
      .orderBy('transaction_date', 'desc')
      .get();

    const receipts = receiptsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 5. Initialize Google Sheets API
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    let sheetId = authData.sheetId;

    // 6. Create new sheet if doesn't exist
    if (!sheetId) {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const fileMetadata = {
        name: 'ResiboKo - My Receipts',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });

      sheetId = file.data.id!;

      // Save sheet ID
      await authDoc.ref.update({ sheetId });

      // Set up headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1:D1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Date', 'Transaction', 'Amount (₱)', 'Category']],
        },
      });
    }

    // 7. Prepare data for sheet
    const values = receipts.map((receipt: any) => [
      receipt.transaction_date || '',
      receipt.transaction_name || '',
      receipt.total_amount || 0,
      receipt.category || 'Other',
    ]);

    // 8. Clear existing data (except header)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'Sheet1!A2:D',
    });

    // 9. Write new data
    if (values.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A2',
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }

    return {
      success: true,
      message: `Successfully synced ${receipts.length} transactions`,
      sheetId,
    };
  } catch (error) {
    console.error('Error syncing to Google Sheets:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to sync data to Google Sheets'
    );
  }
});

// ============================================================
// FUNCTION 3: Disconnect Google Sheets (Optional)
// ============================================================
export const disconnectGoogleSheets = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const uid = context.auth.uid;

  try {
    await db.collection('users').doc(uid).collection('sheetsAuth').doc('tokens').delete();
    return { success: true, message: 'Google Sheets disconnected' };
  } catch (error) {
    console.error('Error disconnecting Google Sheets:', error);
    throw new functions.https.HttpsError('internal', 'Failed to disconnect');
  }
});
```

#### Set Firebase Function Configuration
```bash
# Set OAuth credentials
firebase functions:config:set \
  google.client_id="YOUR_CLIENT_ID.apps.googleusercontent.com" \
  google.client_secret="YOUR_CLIENT_SECRET"

# View current config
firebase functions:config:get
```

---

### Phase 2: Frontend (React App)

#### Step 1: Install Google OAuth Library
```bash
cd /Users/Gian/Documents/Ai\ Studio\ Web\ Applications/resiboko-scanner

npm install @react-oauth/google
```

#### Step 2: Add Environment Variables

**File: `.env`**
```bash
# Existing Firebase vars...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
# ... other Firebase vars ...

# NEW: Google OAuth
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

#### Step 3: Create OAuth Hook

**File: `src/hooks/useGoogleSheetsOAuth.ts`**
```typescript
import { useState, useEffect } from 'react';
import { auth, firestore } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const useGoogleSheetsOAuth = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const functions = getFunctions();

  // Check if user has connected Google Sheets
  useEffect(() => {
    const checkConnection = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const tokenDoc = await getDoc(
          doc(firestore, 'users', user.uid, 'sheetsAuth', 'tokens')
        );
        setIsConnected(tokenDoc.exists());
      } catch (error) {
        console.error('Error checking sheets connection:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();
  }, []);

  // Initiate OAuth flow
  const connectGoogleSheets = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin;
    const scope = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    // Open OAuth popup
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'Google OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Listen for OAuth callback
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_OAUTH_CODE') {
        const code = event.data.code;
        popup?.close();

        try {
          const exchangeToken = httpsCallable(functions, 'exchangeOAuthToken');
          await exchangeToken({ code });
          setIsConnected(true);
          alert('Google Sheets connected successfully!');
        } catch (error) {
          console.error('Error exchanging token:', error);
          alert('Failed to connect Google Sheets');
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup listener
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 1000);
  };

  // Sync to Google Sheets
  const syncToSheets = async () => {
    try {
      const syncFunction = httpsCallable(functions, 'syncToGoogleSheets');
      const result = await syncFunction();
      return result.data;
    } catch (error) {
      console.error('Error syncing to sheets:', error);
      throw error;
    }
  };

  // Disconnect Google Sheets
  const disconnectSheets = async () => {
    try {
      const disconnectFunction = httpsCallable(functions, 'disconnectGoogleSheets');
      await disconnectFunction();
      setIsConnected(false);
    } catch (error) {
      console.error('Error disconnecting sheets:', error);
      throw error;
    }
  };

  return {
    isConnected,
    isLoading,
    connectGoogleSheets,
    syncToSheets,
    disconnectSheets,
  };
};
```

#### Step 4: Create OAuth Callback Handler

**File: `src/pages/OAuthCallback.tsx`**
```typescript
import { useEffect } from 'react';

const OAuthCallback = () => {
  useEffect(() => {
    // Extract code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code && window.opener) {
      // Send code to parent window
      window.opener.postMessage(
        { type: 'GOOGLE_OAUTH_CODE', code },
        window.location.origin
      );
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Connecting Google Sheets...</p>
    </div>
  );
};

export default OAuthCallback;
```

#### Step 5: Update TransactionHistory Component

**File: `src/components/TransactionHistory.tsx`**

Replace the `handleSync` function with:

```typescript
import { useGoogleSheetsOAuth } from '../hooks/useGoogleSheetsOAuth';

// Inside component:
const { isConnected, connectGoogleSheets, syncToSheets } = useGoogleSheetsOAuth();

const handleSync = async () => {
  if (!isConnected) {
    // Show connect dialog first
    if (confirm('You need to connect Google Sheets first. Connect now?')) {
      connectGoogleSheets();
    }
    return;
  }

  setSyncStatus('syncing');

  try {
    const result = await syncToSheets();
    setSyncStatus('synced');
    console.log('Sync result:', result);
  } catch (error) {
    console.error('Sync failed:', error);
    alert('Syncing failed. Please try again.');
    setSyncStatus('idle');
  } finally {
    setTimeout(() => setSyncStatus('idle'), 2500);
  }
};

// Update button to show connection status
const syncButtonText = {
  idle: isConnected ? 'Sync to Google Sheets' : 'Connect Google Sheets',
  syncing: 'Syncing...',
  synced: 'Synced Successfully!'
};
```

---

## Testing

### Local Testing
```bash
# Terminal 1: Start Functions emulator
cd functions
npm run serve

# Terminal 2: Start React dev server
cd ..
npm run dev
```

### Test Flow:
1. ✅ Click "Connect Google Sheets"
2. ✅ OAuth popup opens
3. ✅ Grant permissions
4. ✅ Check Firestore: `users/{uid}/sheetsAuth/tokens` should exist
5. ✅ Click "Sync to Google Sheets"
6. ✅ Check your Google Drive for "ResiboKo - My Receipts" spreadsheet
7. ✅ Verify data appears in sheet

---

## Deployment

```bash
# Deploy functions
firebase deploy --only functions

# Build and deploy frontend
npm run build
firebase deploy --only hosting
```

---

## Security Best Practices

1. **Never commit secrets**:
   - Add `.env` to `.gitignore`
   - Use Firebase Functions config for secrets

2. **Firestore Security Rules**:
```javascript
// Add to firestore.rules
match /users/{userId}/sheetsAuth/{document=**} {
  allow read, write: if request.auth.uid == userId;
}
```

3. **Token Refresh**:
   - Access tokens expire after 1 hour
   - Functions automatically refresh using refresh_token
   - Refresh tokens don't expire unless revoked

---

## Troubleshooting

### Issue: "Functions require Blaze plan"
**Solution**: Upgrade to Blaze plan in Firebase Console

### Issue: "API not enabled"
**Solution**: Enable Google Sheets API and Google Drive API in Cloud Console

### Issue: "Invalid OAuth redirect URI"
**Solution**: Add your domain to authorized redirect URIs in OAuth credentials

### Issue: "Token expired"
**Solution**: Function automatically refreshes. Check if refresh_token exists in Firestore.

### Issue: "Permission denied" when syncing
**Solution**: User needs to re-authorize. Call `connectGoogleSheets()` again.

---

## Cost Estimation

### Firebase Functions (Blaze Plan)
- **Free tier**: 2M invocations/month, 400K GB-seconds, 200K CPU-seconds
- **Cost per sync**: ~0.0001¢ (negligible)
- **Expected cost for 100 users syncing daily**: < $1/month

### Google Sheets API
- **Free tier**: 500 requests/100 seconds/user
- **Cost**: Free for most apps

---

## Next Steps

After implementing:
1. ✅ Remove old Apps Script URL from code
2. ✅ Test with multiple user accounts
3. ✅ Add "Open Sheet" button to view synced data
4. ✅ Implement auto-sync (optional)
5. ✅ Add sheet template with formatting/charts (optional)

---

## Summary

This guide provides a complete OAuth 2.0 implementation that:
- ✅ Allows each user to sync to their own Google Sheet
- ✅ Securely manages tokens in Firestore
- ✅ Uses Firebase Functions for backend logic
- ✅ Provides a seamless user experience
- ✅ Scales to multiple users
- ✅ Maintains user privacy and data ownership

**Estimated implementation time**: 2-3 hours (first time)

---

## Support

If you encounter issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Check browser console for frontend errors
3. Verify Firestore security rules
4. Test with Firebase emulators first

---

*Last updated: 2025-10-25*
