import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut, updatePassword as firebaseUpdatePassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, updateDoc, getDoc, addDoc } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// --- GLOBAL VARIABLES (Provided by Canvas Environment) ---
// We use these variables to connect to the secured Firestore instance.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// CRITICAL FIX: Ensure parsing succeeds and defaults to an empty object if error occurs
let firebaseConfig;
try {
  firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {};
} catch (e) {
  console.error("Failed to parse __firebase_config:", e);
  firebaseConfig = {};
}
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

// Currency Options for Settings
const CURRENCIES = [
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
];

// --- UTILITIES ---

const getTenantPath = (userId, collectionName) => {
  // Path for user-specific collections: artifacts/{appId}/users/{userId}/[collectionName]
  return `artifacts/${appId}/users/${userId}/${collectionName}`;
};

const getShopProfileRef = (db, userId) => {
  // Path for the single shop profile document: collection/document
  // We use a known collection name 'profile' and the userId as the document ID
  // Corrected path to ensure even segments for document reference:
  return doc(db, `artifacts/${appId}/users`, userId, 'profile', 'data');
};

const formatCurrency = (amount, currencyCode) => {
  const currency = CURRENCIES.find(c => c.code === currencyCode) || { symbol: 'R' };
  return `${currency.symbol} ${(amount || 0).toFixed(2)}`;
};

/**
 * Mocks sending an SMS/WhatsApp status update to the customer.
 */
const sendStatusNotification = (customerPhone, customerName, invoiceNo, status) => {
  const message = `Hello ${customerName}, your repair #${invoiceNo} is now in status: ${status}. We will contact you upon completion. (Digital Cafe)`;
  console.log(`[MOCK NOTIFICATION SENT] To: ${customerPhone} | Message: ${message}`);
  // Using custom modal instead of alert
  const notificationBox = document.createElement('div');
  notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
  notificationBox.innerHTML = `
    <h4 class="font-bold">Status Update Sent!</h4>
    <p class="text-sm">To: ${customerPhone}</p>
    <p class="text-xs italic">${message}</p>
  `;
  document.body.appendChild(notificationBox);
  
  setTimeout(() => {
    notificationBox.style.opacity = '0';
    setTimeout(() => notificationBox.remove(), 500);
  }, 4000);
};

// --- AUTHENTICATION AND INITIALIZATION ---

const AuthLoader = ({ children }) => {
  const [error, setError] = useState(null);
  const [appServices, setAppServices] = useState(null);

  useEffect(() => {
    const initFirebase = async () => {
      // DEBUG LOG: Confirm configuration state
      console.log('Firebase Init Check: Config keys:', Object.keys(firebaseConfig).length, 'App ID:', appId, 'Auth Token presence:', !!initialAuthToken);
      
      try {
        if (Object.keys(firebaseConfig).length === 0) {
          setError("Firebase Config is missing. Cannot initialize app.");
          return;
        }
        
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);
        setLogLevel('debug');

        const handleAuth = (user) => {
          let currentUserId = user ? user.uid : null;
          
          if (user) {
            console.log("Auth State Changed: Signed in. User ID:", currentUserId);
            // Once auth state is set, set the services object
            setAppServices({ db: firestore, auth: authInstance, userId: currentUserId });
          } else {
            console.log("Auth State Changed: Not signed in. Attempting token/anonymous sign-in.");
            const attemptSignIn = async () => {
              try {
                if (initialAuthToken) { 
                  await signInWithCustomToken(authInstance, initialAuthToken);
                  // The onAuthStateChanged listener will catch the success case.
                } else {
                  await signInAnonymously(authInstance);
                  // The onAuthStateChanged listener will catch the success case.
                }
              } catch (e) {
                console.error("Authentication attempt failed:", e);
                // If sign-in fails, proceed with null userId
                setAppServices({ db: firestore, auth: authInstance, userId: null });
              }
            };
            attemptSignIn();
          }
        };

        const unsubscribe = onAuthStateChanged(authInstance, handleAuth);
        
        // Return cleanup function
        return function cleanup() {
          unsubscribe();
        };

      } catch (e) {
        console.error("Firebase Initialization Error:", e);
        setError(`Initialization Error: ${e.message}`);
      }
    };

    initFirebase();
  }, []); // Empty dependency array means this runs only once on mount

  if (error) {
    return <div className="p-8 text-center text-red-600 bg-red-100 rounded-lg shadow-lg m-8 font-mono">Error: {error}</div>;
  }

  // Check for readiness of the final app services object
  if (!appServices) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl font-semibold text-gray-700">Loading Secure Dashboard...</div>
      </div>
    );
  }

  // Pass down the initialized services and the user ID
  return children(appServices);
};

// --- SUBSCRIPTION GATE COMPONENT (MOCK) ---

const SubscriptionGate = ({ shopProfile, db, userId, onSubscribeSuccess }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [subError, setSubError] = useState(null);

  const handleSubscribe = async () => {
    if (!db || !userId) {
      setSubError("Database or User ID not available.");
      return;
    }
    setIsProcessing(true);
    setSubError(null);

    try {
      // 1. Mock Payment Processing (Simulate Stripe delay)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 2. Update Subscription Status in Firestore
      const docRef = getShopProfileRef(db, userId);

      await updateDoc(docRef, {
        subscription_status: 'active',
        subscription_start: new Date().toISOString(),
        plan: 'PRO',
      });

      // 3. Inform parent component and log
      onSubscribeSuccess();
      console.log("Subscription activated successfully in Firestore.");

    } catch (e) {
      console.error("Subscription update failed:", e);
      setSubError(`Payment failed. Please try again. Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-lg text-center border-t-8 border-indigo-600">
        <h2 className="text-3xl font-extrabold text-indigo-800 mb-4">Access Restricted</h2>
        <p className="text-xl text-gray-700 mb-6">
          Your shop subscription is currently <span className="font-bold text-red-600">{(shopProfile?.subscription_status || 'LOADING').toUpperCase()}</span>.
          Please subscribe to unlock the full platform features.
        </p>

        {subError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm font-mono">
            Error: {subError}
          </div>
        )}

        <div className="text-lg text-gray-600 mb-8">
          Monthly Fee: <span className="font-extrabold text-indigo-600">R 179.00</span> (approx. $10 USD)
        </div>

        <button
          onClick={handleSubscribe}
          disabled={isProcessing}
          className={`w-full py-3 px-6 rounded-lg text-white font-bold transition duration-300 ${isProcessing ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg'}`}
        >
          {isProcessing ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing Payment...
            </div>
          ) : (
            'Subscribe Now ($10 USD / month)'
          )}
        </button>
      </div>
    </div>
  );
};


// --- MODULES ---

const InvoiceHistory = ({ db, userId, shopProfile }) => {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const currentCurrency = shopProfile?.currency || 'ZAR';

  useEffect(() => {
    if (!db || !userId) return;

    // Use the correctly structured tenant path for collections
    const invoicesCollectionRef = collection(db, getTenantPath(userId, 'invoices'));
    const q = query(invoicesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoicesList = [];
      snapshot.forEach(doc => {
        invoicesList.push({ id: doc.id, ...doc.data() });
      });
      setInvoices(invoicesList.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setIsLoading(false);
    }, (e) => {
      console.error("Error fetching invoices:", e);
      setError("Failed to load invoice history.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId]);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm) return invoices;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return invoices.filter(invoice =>
      invoice.invoiceNo.toLowerCase().includes(lowerCaseSearch) ||
      invoice.customerName.toLowerCase().includes(lowerCaseSearch) ||
      invoice.customerPhone.toLowerCase().includes(lowerCaseSearch)
    );
  }, [invoices, searchTerm]);

  if (isLoading) return <div className="p-8 text-center text-gray-600">Loading invoice history...</div>;
  if (error) return <div className="p-8 text-center text-red-600 bg-red-100 rounded-lg">{error}</div>;

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-indigo-800">Invoice History ({invoices.length})</h2>

      <input
        type="text"
        placeholder="Search by Invoice No., Customer Name, or Phone..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-lg mb-6 focus:ring-indigo-500 focus:border-indigo-500"
      />

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          {searchTerm ? "No matching invoices found." : "No invoices have been saved yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{invoice.invoiceNo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.customerName} <br />
                    <span className="text-gray-500">{invoice.customerPhone}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(invoice.totalAmount, currentCurrency)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      invoice.status === 'Paid' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-indigo-600 hover:text-indigo-900 text-xs">View/Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


const InvoiceManager = ({ db, userId, shopProfile }) => {
  const [tab, setTab] = useState('create');
  const [isDownloading, setIsDownloading] = useState(false);
  const [invoice, setInvoice] = useState({
    invoiceNo: 'INV-' + Math.floor(Math.random() * 10000),
    date: new Date().toISOString().substring(0, 10),
    customerName: '',
    customerAddress: '',
    customerPhone: '',
    billTo: '',
    items: [{ id: 1, description: '', qty: 1, unitPrice: 0, total: 0 }],
    subtotal: 0,
    taxRate: 15, // Default SA VAT rate
    taxAmount: 0,
    isVatExempt: false,
    totalAmount: 0,
    bankingDetails: '',
    status: 'Draft',
  });

  const shopDetails = shopProfile || {};

  const calculateTotals = useCallback((currentItems, isVatExempt, taxRate) => {
    const newSubtotal = currentItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const calculatedTax = isVatExempt ? 0 : newSubtotal * (taxRate / 100);
    const newTotal = newSubtotal + calculatedTax;

    setInvoice(prev => ({
      ...prev,
      items: currentItems,
      subtotal: newSubtotal,
      taxAmount: calculatedTax,
      totalAmount: newTotal,
      isVatExempt: isVatExempt,
    }));
  }, []);

  useEffect(() => {
    calculateTotals(invoice.items, invoice.isVatExempt, invoice.taxRate);
  }, [invoice.items, invoice.isVatExempt, invoice.taxRate, calculateTotals]);

  const handleItemChange = (id, field, value) => {
    const newItems = invoice.items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        updatedItem.total = updatedItem.qty * updatedItem.unitPrice;
        return updatedItem;
      }
      return item;
    });
    calculateTotals(newItems, invoice.isVatExempt, invoice.taxRate);
  };

  const handleAddItem = () => {
    const newItem = { id: Date.now(), description: '', qty: 1, unitPrice: 0, total: 0 };
    setInvoice(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const handleRemoveItem = (id) => {
    const newItems = invoice.items.filter(item => item.id !== id);
    calculateTotals(newItems, invoice.isVatExempt, invoice.taxRate);
  };

  const handleSaveInvoice = async (status = 'Draft') => {
    if (!db || !userId) {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Database connection not established.</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      return;
    }

    try {
      const docRef = collection(db, getTenantPath(userId, 'invoices'));
      await addDoc(docRef, {
        ...invoice,
        status: status,
        shopProfile: {
          companyName: shopDetails.companyName,
          address: shopDetails.address,
          currency: shopDetails.currency,
          registrationNo: shopDetails.registrationNo,
          vatNo: shopDetails.vatNo,
          emailPhone: shopDetails.emailPhone,
        }
      });
      console.log("Invoice saved successfully!");
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Success</h4><p class="text-sm">Invoice saved successfully!</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      // Reset form or navigate to history
      setTab('history');
    } catch (e) {
      console.error("Error saving invoice:", e);
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to save invoice. Error: ${e.message}</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
    }
  };

  const handleDownloadInvoice = () => {
    setIsDownloading(true);
    // Using custom modal instead of alert
    const notificationBox = document.createElement('div');
    notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
    notificationBox.innerHTML = `<h4 class="font-bold">Mock Download</h4><p class="text-sm">Simulating download of Invoice #${invoice.invoiceNo} as PDF. (Requires server-side PDF generation.)</p>`;
    document.body.appendChild(notificationBox);
    setTimeout(() => {
      notificationBox.style.opacity = '0';
      setTimeout(() => notificationBox.remove(), 500);
      setIsDownloading(false);
    }, 1500);
  };

  const currentCurrency = shopDetails.currency || 'ZAR';

  return (
    <div className="p-6">
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('create')}
          className={`pb-2 font-semibold ${tab === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
        >
          Create New Invoice
        </button>
        <button
          onClick={() => setTab('history')}
          className={`pb-2 font-semibold ${tab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
        >
          Invoice History
        </button>
      </div>

      {tab === 'history' && <InvoiceHistory db={db} userId={userId} shopProfile={shopProfile} />}

      {tab === 'create' && (
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <div className="flex justify-between items-start mb-8 border-b pb-4">
            <h1 className="text-3xl font-extrabold text-indigo-800">INVOICE</h1>
            <button
              onClick={handleDownloadInvoice}
              disabled={isDownloading}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 disabled:opacity-50 flex items-center"
            >
              {isDownloading ? 'Generating...' : 'Download Invoice'}
            </button>
          </div>

          {/* Shop Details from Settings */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 mb-8 text-sm">
            <div>
              <p className="font-bold text-lg">{shopDetails.companyName || 'Your Company Name (Set in Settings)'}</p>
              <p>{shopDetails.address}</p>
              <p>Reg No: {shopDetails.registrationNo}</p>
              <p>VAT No: {shopDetails.vatNo || 'N/A'}</p>
              <p>Contact: {shopDetails.emailPhone}</p>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-2">
                <span className="font-medium">Invoice No:</span>
                <input
                  type="text"
                  value={invoice.invoiceNo}
                  onChange={(e) => setInvoice({ ...invoice, invoiceNo: e.target.value })}
                  className="p-1 border rounded text-right"
                />
              </div>
              <div className="grid grid-cols-2">
                <span className="font-medium">Date:</span>
                <input
                  type="date"
                  value={invoice.date}
                  onChange={(e) => setInvoice({ ...invoice, date: e.target.value })}
                  className="p-1 border rounded text-right"
                />
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="mb-8 border-t pt-4">
            <h3 className="text-lg font-bold mb-3">Bill To:</h3>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Customer Name (Required)"
                value={invoice.customerName}
                onChange={(e) => setInvoice({ ...invoice, customerName: e.target.value })}
                className="p-2 border rounded-lg"
                required
              />
              <input
                type="text"
                placeholder="Customer Phone (Required)"
                value={invoice.customerPhone}
                onChange={(e) => setInvoice({ ...invoice, customerPhone: e.target.value })}
                className="p-2 border rounded-lg"
                required
              />
              <input
                type="text"
                placeholder="Customer Address (Required)"
                value={invoice.customerAddress}
                onChange={(e) => setInvoice({ ...invoice, customerAddress: e.target.value })}
                className="p-2 border rounded-lg col-span-2"
                required
              />
              <input
                type="text"
                placeholder="Bill To (Optional - E.g., Company Name)"
                value={invoice.billTo}
                onChange={(e) => setInvoice({ ...invoice, billTo: e.target.value })}
                className="p-2 border rounded-lg col-span-2"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-6">
            <div className="grid grid-cols-8 gap-2 bg-gray-100 p-2 font-semibold border-b border-t">
              <div className="col-span-4">Description</div>
              <div className="text-center">Qty</div>
              <div className="col-span-2 text-right">Unit Price ({formatCurrency(0, currentCurrency).replace('0.00', '')})</div>
              <div className="text-right">Total</div>
              <div></div>
            </div>

            {invoice.items.map((item) => (
              <div key={item.id} className="grid grid-cols-8 gap-2 items-center py-2 border-b">
                <input
                  type="text"
                  placeholder="Service or part description"
                  value={item.description}
                  onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                  className="p-1 border-none focus:ring-0 col-span-4"
                />
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => handleItemChange(item.id, 'qty', parseFloat(e.target.value) || 0)}
                  className="p-1 border rounded text-center"
                />
                <div className="flex col-span-2">
                  <span className="p-1 text-gray-500">{formatCurrency(0, currentCurrency).replace('0.00', '')}</span>
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="p-1 border rounded text-right w-full"
                  />
                </div>
                <div className="text-right font-medium">{formatCurrency(item.total, currentCurrency)}</div>
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                  title="Remove Item"
                >
                  &times;
                </button>
              </div>
            ))}

            <button
              onClick={handleAddItem}
              className="mt-3 text-indigo-600 hover:text-indigo-800 font-semibold flex items-center text-sm"
            >
              + Add Line Item
            </button>
          </div>

          {/* Totals and Banking */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <h3 className="text-lg font-bold mb-2">Banking Details (optional):</h3>
              <textarea
                placeholder="Bank Name, Account Number, Branch Code, etc."
                rows="4"
                value={shopDetails.bankingDetails}
                onChange={(e) => setInvoice(prev => ({ ...prev, bankingDetails: e.target.value }))}
                className="w-full p-2 border rounded-lg"
              />
            </div>

            {/* Totals Column */}
            <div className="col-span-1 space-y-2 text-right text-base">
              <div className="flex justify-between font-medium">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal, currentCurrency)}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">VAT ({invoice.taxRate}%):</span>
                  <input
                    type="checkbox"
                    checked={invoice.isVatExempt}
                    onChange={(e) => setInvoice(prev => ({ ...prev, isVatExempt: e.target.checked }))}
                    className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                  />
                  <span className="text-sm text-gray-500">Exempt</span>
                </div>
                <span>{formatCurrency(invoice.taxAmount, currentCurrency)}</span>
              </div>

              <div className="flex justify-between font-extrabold text-lg pt-2 border-t-2 border-indigo-200">
                <span>TOTAL:</span>
                <span>{formatCurrency(invoice.totalAmount, currentCurrency)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-4 border-t flex justify-end space-x-4">
            <button
              onClick={() => handleSaveInvoice('Draft')}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200"
            >
              Save Invoice (Draft)
            </button>
            <button
              onClick={() => handleSaveInvoice('Sent')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200"
            >
              Save & Send Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


const BookingSystem = ({ db, userId, shopProfile }) => {
  const [activeView, setActiveView] = useState('board');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [searchQuery, setSearchQuery] = useState({ field: 'invoiceNo', value: '' });
  const [updateStatusData, setUpdateStatusData] = useState({ invoiceNo: '', status: 'Confirmed' });

  const statusMap = {
    'New Request': { color: 'bg-yellow-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> },
    'Confirmed': { color: 'bg-blue-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> },
    'In Progress': { color: 'bg-green-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> },
    'Awaiting Parts': { color: 'bg-orange-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5z"></path><path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path></svg> },
    'Testing': { color: 'bg-purple-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> },
    'Ready for Collection': { color: 'bg-cyan-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg> },
    'Unable To Repair': { color: 'bg-red-700', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> },
    'Collected': { color: 'bg-gray-500', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg> },
    // Adding Total Repairs placeholder to statusMap to prevent error in Quick Views rendering
    'Total Repairs': { color: 'bg-gray-700', icon: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> },
  };

  const statusOrder = ['New Request', 'Confirmed', 'In Progress', 'Awaiting Parts', 'Testing', 'Ready for Collection', 'Collected', 'Unable To Repair'];

  useEffect(() => {
    if (!db || !userId) return;

    const bookingsCollectionRef = collection(db, getTenantPath(userId, 'bookings'));
    const q = query(bookingsCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsList = [];
      snapshot.forEach(doc => {
        bookingsList.push({ id: doc.id, ...doc.data() });
      });
      setBookings(bookingsList);
    }, (e) => {
      console.error("Error fetching bookings:", e);
    });

    return () => unsubscribe();
  }, [db, userId]);

  const updateBookingStatus = async (id, newStatus) => {
    if (!db || !userId) return;
    try {
      const docRef = doc(db, getTenantPath(userId, 'bookings'), id);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      console.log(`Booking ${id} status updated to ${newStatus}`);
      if (currentBooking && currentBooking.id === id) {
        setCurrentBooking(prev => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      console.error("Error updating booking status:", e);
    }
  };

  const groupedBookings = useMemo(() => {
    const groups = statusOrder.reduce((acc, status) => {
      acc[status] = [];
      return acc;
    }, {});

    const totalRepairs = bookings.length;
    let countedBookings = 0;

    bookings.forEach(booking => {
      if (groups[booking.status]) {
        groups[booking.status].push(booking);
        countedBookings++;
      }
    });

    groups['Total Repairs'] = { count: totalRepairs, color: 'bg-gray-700' };

    return groups;
  }, [bookings]);

  const openRepairForm = (booking) => {
    setCurrentBooking(booking);
  };

  const handleSearch = () => {
    // In a real app, this would query the DB. Here we filter in memory for simplicity.
    const results = bookings.filter(b => b[searchQuery.field]?.toLowerCase().includes(searchQuery.value.toLowerCase()));
    if (results.length > 0) {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Search Complete</h4><p class="text-sm">Found ${results.length} result(s) for ${searchQuery.field} '${searchQuery.value}'</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
    } else {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-yellow-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Search Complete</h4><p class="text-sm">No results found for ${searchQuery.field} '${searchQuery.value}'</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
    }
  };

  const handleUpdateStatusTool = async () => {
    if (!updateStatusData.invoiceNo) {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Please enter an Invoice Number.</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      return;
    }
    const bookingToUpdate = bookings.find(b => b.invoiceNo === updateStatusData.invoiceNo);
    if (!bookingToUpdate) {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">No repair found with Invoice Number: ${updateStatusData.invoiceNo}</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      return;
    }
    await updateBookingStatus(bookingToUpdate.id, updateStatusData.status);
    // Send notification after successful manual status update
    sendStatusNotification(bookingToUpdate.customerPhone, bookingToUpdate.customerName, bookingToUpdate.invoiceNo, updateStatusData.status);
    setUpdateStatusData({ invoiceNo: '', status: 'Confirmed' });
  };

  const BookingCard = ({ booking }) => (
    <div
      onClick={() => openRepairForm(booking)}
      className={`bg-white p-4 rounded-lg shadow-md mb-3 cursor-pointer border-l-4 ${statusMap[booking.status]?.color?.replace('bg', 'border')}`}
    >
      <div className="font-bold text-sm text-gray-800 truncate">{booking.customerName}</div>
      <div className="text-xs text-gray-600">IMEI: {booking.imei}</div>
      <div className="text-xs text-gray-500">Fault: {booking.deviceIssue}</div>
      <div className="mt-2 flex justify-between items-center text-xs">
        <span className={`px-2 py-0.5 rounded-full text-white ${statusMap[booking.status]?.color}`}>{booking.status}</span>
        <span className="text-indigo-600 font-medium">#{booking.invoiceNo}</span>
      </div>
    </div>
  );

  const WalkInCheckInForm = () => {
    const [formData, setFormData] = useState({
      invoiceNo: 'INV-' + Math.floor(Math.random() * 10000),
      consultant: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      deviceModel: '',
      deviceIssue: '',
      imei: '',
      amount: 0,
      comments: '',
    });
    const [slipVisible, setSlipVisible] = useState(false);

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCheckIn = async () => {
      if (!formData.customerName || !formData.customerPhone || !formData.deviceModel) {
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Please fill in required customer name, phone, and device model.</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
        return;
      }

      try {
        const docRef = collection(db, getTenantPath(userId, 'bookings'));
        const newBooking = {
          ...formData,
          createdAt: new Date().toISOString(),
          status: 'Confirmed', // Walk-ins are confirmed immediately
          bookingType: 'Walk-in',
          repairDetails: {},
        };
        await addDoc(docRef, newBooking);
        
        // Send notification for initial check-in
        sendStatusNotification(newBooking.customerPhone, newBooking.customerName, newBooking.invoiceNo, newBooking.status);

        setSlipVisible(true);
      } catch (e) {
        console.error("Error creating walk-in booking:", e);
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to create check-in. Error: ${e.message}</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
      }
    };

    const handlePrintAndNotify = () => {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Mock Print</h4><p class="text-sm">Simulating printing of Repair Slip. Job placed in Confirmed queue.</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);

      setSlipVisible(false);
      setIsFormOpen(false); // Close the form
    };

    if (slipVisible) {
      return (
        <div className="p-6 bg-gray-50 rounded-lg shadow-inner mt-4">
          <h3 className="text-xl font-bold mb-4 text-indigo-800">Repair Book-in Slip Preview</h3>
          <div className="border p-4 bg-white rounded-lg space-y-2">
            <p><span className="font-semibold">Shop:</span> {shopProfile.companyName}</p>
            <p><span className="font-semibold">Invoice No:</span> {formData.invoiceNo}</p>
            <p><span className="font-semibold">Customer:</span> {formData.customerName} ({formData.customerPhone})</p>
            <p><span className="font-semibold">Device:</span> {formData.deviceModel} (IMEI: {formData.imei})</p>
            <p className="text-sm pt-2 border-t mt-2">
              <span className="font-semibold">Next Steps:</span> Repair will be assigned to a technician. You have been notified via SMS/WhatsApp.
            </p>
          </div>
          <button onClick={handlePrintAndNotify} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">
            Print Book-in Slip & Close
          </button>
        </div>
      );
    }

    return (
      <div className="p-6 bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-indigo-800">Book a Repair (Walk-in Check-in)</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* First Row: Invoice No & Consultant */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Invoice Number:</label>
            <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Consultant:</label>
            <input type="text" name="consultant" value={formData.consultant} onChange={handleChange} placeholder="Staff Member Name" className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>

          {/* Second Row: Customer Name & Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Name:</label>
            <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Phone Number:</label>
            <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>

          {/* Third Row: Email & Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Email: (Optional)</label>
            <input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount (Deposit/Estimate):</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>

          {/* Fourth Row: Device Model & Issue */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Device Model:</label>
            <input type="text" name="deviceModel" value={formData.deviceModel} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Device Issue:</label>
            <input type="text" name="deviceIssue" value={formData.deviceIssue} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>

          {/* Fifth Row: IMEI */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-gray-700">IMEI: (Optional)</label>
            <input type="text" name="imei" value={formData.imei} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>

          {/* Last Row: Comments */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Comments about Device (Condition, Accessories):</label>
            <textarea name="comments" value={formData.comments} onChange={handleChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"></textarea>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-between">
          <button onClick={handleCheckIn} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-md">
            Check In Device & Generate Slip
          </button>
          <button onClick={() => setIsFormOpen(false)} className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg shadow-md">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const OnlineBookingForm = () => {
    const [formData, setFormData] = useState({
      customerName: '',
      customerPhone: '',
      deviceModel: '',
      deviceIssue: '',
      imei: '',
      preferredDate: new Date().toISOString().substring(0, 10),
      urgency: 'Standard',
      comments: '',
    });

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleBooking = async () => {
      if (!formData.customerName || !formData.customerPhone || !formData.deviceModel) {
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Please fill in required customer name, phone, and device model.</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
        return;
      }

      try {
        const docRef = collection(db, getTenantPath(userId, 'bookings'));
        const newBooking = {
          ...formData,
          invoiceNo: 'REQ-' + Math.floor(Math.random() * 10000),
          createdAt: new Date().toISOString(),
          status: 'New Request', // Online bookings require confirmation
          bookingType: 'Online',
          repairDetails: {},
        };
        await addDoc(docRef, newBooking);
        
        // Send notification for initial request
        sendStatusNotification(newBooking.customerPhone, newBooking.customerName, newBooking.invoiceNo, newBooking.status);

        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Success</h4><p class="text-sm">Online booking request submitted successfully! Shop will confirm soon.</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);

        setIsFormOpen(false);
      } catch (e) {
        console.error("Error creating online booking:", e);
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to submit booking. Error: ${e.message}</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-indigo-800">New Online Booking Request</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Name:</label>
            <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Phone Number:</label>
            <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Device Model:</label>
            <input type="text" name="deviceModel" value={formData.deviceModel} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Device Issue:</label>
            <input type="text" name="deviceIssue" value={formData.deviceIssue} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">IMEI:</label>
            <input type="text" name="imei" value={formData.imei} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Preferred Date:</label>
            <input type="date" name="preferredDate" value={formData.preferredDate} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Special Instructions / Urgency:</label>
            <textarea name="comments" value={formData.comments} onChange={handleChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"></textarea>
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-4">
          <button onClick={handleBooking} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md">
            Submit Booking Request
          </button>
          <button onClick={() => setIsFormOpen(false)} className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg shadow-md">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const RepairFormModal = ({ booking, onClose, onUpdate, shopProfile, db, userId, updateBookingStatus }) => {
    const [repairData, setRepairData] = useState(booking.repairDetails || {
      finalFault: '',
      diagnosticNotes: '',
      technician: '',
      partsUsed: [{ id: 1, name: '', cost: 0 }],
      finalStatus: booking.status,
      laborCost: 350, // Default labor cost added
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
    const [isNotifying, setIsNotifying] = useState(false); // New state for notification

    const handlePartChange = (id, field, value) => {
      const newParts = repairData.partsUsed.map(part => {
        if (part.id === id) {
          return { ...part, [field]: value };
        }
        return part;
      });
      setRepairData(prev => ({ ...prev, partsUsed: newParts }));
    };

    const handleAddPart = () => {
      setRepairData(prev => ({ ...prev, partsUsed: [...prev.partsUsed, { id: Date.now(), name: '', cost: 0 }] }));
    };

    const handleRemovePart = (id) => {
      setRepairData(prev => ({ ...prev, partsUsed: prev.partsUsed.filter(part => part.id !== id) }));
    };

    const handleUpdateRepair = async () => {
      setIsSaving(true);
      try {
        const docRef = doc(db, getTenantPath(userId, 'bookings'), booking.id);
        const newStatus = repairData.finalStatus;
        await updateDoc(docRef, {
          repairDetails: repairData,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
        
        // Only send notification if status changed or user explicitly clicks notify button later
        onUpdate(newStatus); 
        onClose();
      } catch (e) {
        console.error("Error updating repair details:", e);
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to save repair details. Error: ${e.message}</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
      } finally {
        setIsSaving(false);
      }
    };
    
    const handleGenerateInvoice = async () => {
      if (!db || !userId || !shopProfile) return;
      
      setIsGeneratingInvoice(true);
      
      try {
        const partsCostItems = repairData.partsUsed.filter(p => p.cost > 0 && p.name).map(p => ({
          id: Date.now() + Math.random(),
          description: `Part: ${p.name}`,
          qty: 1,
          unitPrice: parseFloat(p.cost) || 0,
          total: parseFloat(p.cost) || 0,
        }));

        const laborItem = {
          id: Date.now() + Math.random() + 1,
          description: `Labor: ${repairData.finalFault || booking.deviceIssue}`,
          qty: 1,
          unitPrice: parseFloat(repairData.laborCost) || 0,
          total: parseFloat(repairData.laborCost) || 0,
        };
        
        const invoiceItems = [laborItem, ...partsCostItems];
        const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
        const taxRate = 15; // Standard VAT
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;
        
        const newInvoice = {
          invoiceNo: `INV-REP-${booking.invoiceNo}`, // Link back to booking number
          date: new Date().toISOString().substring(0, 10),
          customerName: booking.customerName,
          customerAddress: booking.customerAddress || 'N/A',
          customerPhone: booking.customerPhone,
          billTo: booking.deviceModel, // Use device model for bill-to
          items: invoiceItems,
          subtotal: subtotal,
          taxRate: taxRate, 
          taxAmount: taxAmount,
          isVatExempt: false,
          totalAmount: totalAmount,
          bankingDetails: shopProfile.bankingDetails,
          status: 'Sent', // Auto-set to sent
          relatedBookingId: booking.id,
          shopProfile: {
            companyName: shopProfile.companyName,
            address: shopProfile.address,
            currency: shopProfile.currency,
            registrationNo: shopProfile.registrationNo,
            vatNo: shopProfile.vatNo,
            emailPhone: shopProfile.emailPhone,
          }
        };
        
        const docRef = collection(db, getTenantPath(userId, 'invoices'));
        await addDoc(docRef, newInvoice);
        
        // Update booking status to collected and notify
        await updateBookingStatus(booking.id, 'Collected');
        
        sendStatusNotification(booking.customerPhone, booking.customerName, booking.invoiceNo, 'Collected (Invoice Sent)');

        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Invoice & Status Update Sent!</h4><p class="text-sm">Invoice #${newInvoice.invoiceNo} generated and customer notified.</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 5000);

        onClose();
        
      } catch (e) {
        console.error("Error generating invoice:", e);
        // Using custom modal instead of alert
        const notificationBox = document.createElement('div');
        notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
        notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to generate invoice. Error: ${e.message}</p>`;
        document.body.appendChild(notificationBox);
        setTimeout(() => {
          notificationBox.style.opacity = '0';
          setTimeout(() => notificationBox.remove(), 500);
        }, 4000);
      } finally {
        setIsGeneratingInvoice(false);
      }
    };
    
    const handleNotifyCustomer = () => {
      setIsNotifying(true);
      sendStatusNotification(booking.customerPhone, booking.customerName, booking.invoiceNo, repairData.finalStatus);
      setTimeout(() => setIsNotifying(false), 2000);
    };


    const totalPartsCost = repairData.partsUsed.reduce((sum, part) => sum + (parseFloat(part.cost) || 0), 0);
    const totalLaborCost = parseFloat(repairData.laborCost) || 0;
    const totalEstimatedCost = totalPartsCost + totalLaborCost;
    const currentCurrency = shopProfile?.currency || 'ZAR';

    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8">
          <h2 className="text-3xl font-bold mb-6 text-indigo-800 border-b pb-3">Internal Repair Form - #{booking.invoiceNo}</h2>

          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-sm font-medium text-gray-500">Customer:</span>
              <p className="font-semibold text-gray-900">{booking.customerName}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-sm font-medium text-gray-500">Device:</span>
              <p className="font-semibold text-gray-900">{booking.deviceModel} (IMEI: {booking.imei})</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <span className="text-sm font-medium text-gray-500">Initial Issue:</span>
              <p className="font-semibold text-gray-900">{booking.deviceIssue}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column: Notes & Technician */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Diagnostic Notes:</label>
                <textarea
                  value={repairData.diagnosticNotes}
                  onChange={(e) => setRepairData({ ...repairData, diagnosticNotes: e.target.value })}
                  rows="4"
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"
                  placeholder="Detailed findings and troubleshooting steps."
                ></textarea>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Final Fault Confirmed:</label>
                <input
                  type="text"
                  value={repairData.finalFault}
                  onChange={(e) => setRepairData({ ...repairData, finalFault: e.target.value })}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Damaged Charging Port FPC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Technician Assigned:</label>
                <input
                  type="text"
                  value={repairData.technician}
                  onChange={(e) => setRepairData({ ...repairData, technician: e.target.value })}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"
                  placeholder="Tech Name"
                />
              </div>
            </div>

            {/* Right Column: Parts Used and Labor */}
            <div className="border p-4 rounded-lg bg-gray-50 space-y-3">
              <h3 className="font-bold mb-3 text-indigo-700 border-b pb-2">Costs Breakdown</h3>
              
              {/* Labor Cost */}
              <div className="flex justify-between items-center">
                  <label className="font-medium text-gray-700 w-2/5">Labor Cost:</label>
                  <div className="flex w-3/5 items-center justify-end">
                    <span className="text-gray-600 text-sm mr-1">{formatCurrency(0, currentCurrency).replace('0.00', '')}</span>
                    <input
                      type="number"
                      value={repairData.laborCost}
                      onChange={(e) => setRepairData({ ...repairData, laborCost: parseFloat(e.target.value) || 0 })}
                      className="p-1 border rounded-lg text-sm w-full max-w-[100px] text-right"
                    />
                  </div>
              </div>
              
              {/* Parts Section */}
              <h4 className="font-semibold text-sm pt-2 border-t">Parts/Material Used (Cost Price):</h4>
              {repairData.partsUsed.map((part) => (
                <div key={part.id} className="flex space-x-2 items-center">
                  <input
                    type="text"
                    value={part.name}
                    onChange={(e) => handlePartChange(part.id, 'name', e.target.value)}
                    placeholder="Part Name/Description"
                    className="w-3/5 p-1 border rounded-lg text-sm"
                  />
                  <div className="flex w-2/5 items-center justify-end">
                    <span className="text-gray-600 text-sm mr-1">{formatCurrency(0, currentCurrency).replace('0.00', '')}</span>
                    <input
                      type="number"
                      value={part.cost}
                      onChange={(e) => handlePartChange(part.id, 'cost', parseFloat(e.target.value) || 0)}
                      className="p-1 border rounded-lg text-sm w-full max-w-[100px] text-right"
                    />
                  </div>
                  <button onClick={() => handleRemovePart(part.id)} className="text-red-500 hover:text-red-700 text-lg">&times;</button>
                </div>
              ))}
              <button onClick={handleAddPart} className="mt-1 text-indigo-600 hover:bg-indigo-700 font-bold py-1 px-3 rounded-lg text-sm">+ Add Part</button>

              <div className="mt-4 pt-3 border-t-2 flex justify-between font-extrabold text-lg">
                <span>TOTAL ESTIMATE:</span>
                <span>{formatCurrency(totalEstimatedCost, currentCurrency)}</span>
              </div>
            </div>
          </div>

          {/* Status and Action Footer */}
          <div className="mt-8 pt-4 border-t flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <label className="font-bold text-gray-700">Update Status:</label>
              <select
                value={repairData.finalStatus}
                onChange={(e) => setRepairData({ ...repairData, finalStatus: e.target.value })}
                className="p-2 border rounded-lg bg-white"
              >
                {statusOrder.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              
              <button
                onClick={handleNotifyCustomer}
                disabled={isNotifying}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 disabled:opacity-50 flex items-center text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-3.69-1.392L2 22l1.392-4.69A9.957 9.957 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                {isNotifying ? 'Notifying...' : 'Notify Customer'}
              </button>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleGenerateInvoice}
                disabled={isGeneratingInvoice || totalEstimatedCost === 0}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200 disabled:opacity-50"
              >
                {isGeneratingInvoice ? 'Generating...' : 'Generate Invoice & Finish'}
              </button>
              <button
                onClick={handleUpdateRepair}
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Update Repair Details'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Custom component replacement due to closure requirement
  const BookingRepairFormModal = (props) => (
      <RepairFormModal {...props} shopProfile={shopProfile} db={db} userId={userId} updateBookingStatus={updateBookingStatus} />
  );


  return (
    <div className="p-6">
      <h1 className="text-3xl font-extrabold text-indigo-800 mb-6">Repair Tracking Dashboard</h1>

      {/* Record Repair & Status Pills */}
      <div className="flex items-start space-x-6 mb-8">
        <div className="flex flex-col space-y-2">
          <button onClick={() => { setIsFormOpen(true); setIsWalkIn(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center text-sm">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 17H2L12 5zM22 17L12 22 2 17M12 5V22"></path></svg>
            New Walk-in Check-in
          </button>
          <button onClick={() => { setIsFormOpen(true); setIsWalkIn(false); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center text-sm">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            Book a Repair (Online)
          </button>
        </div>

        {/* Status Quick Views */}
        <div className="flex flex-wrap gap-2 pt-1">
          {['Total Repairs', ...statusOrder].map((status) => {
            const count = status === 'Total Repairs' ? groupedBookings['Total Repairs'].count : groupedBookings[status]?.length || 0;
            const color = status === 'Total Repairs' ? 'bg-gray-700' : statusMap[status]?.color;
            const statusLabel = status.replace(' ', '\u00A0'); // Non-breaking space
            const IconComponent = statusMap[status]?.icon; // Safely get the icon component

            // Safety Check: Ensure the status and icon exist before rendering
            if (!IconComponent) return null; 

            return (
              <div key={status} className={`py-2 px-4 rounded-full text-white font-semibold text-sm shadow-md ${color} flex items-center`}>
                <IconComponent className="w-5 h-5 mr-2" />
                {statusLabel} ({count})
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracking and Update Sections */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Track Repair (Admin) */}
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Track Repair (Admin)</h3>
          <label className="block text-sm font-medium text-gray-700">Track by:</label>
          <select
            value={searchQuery.field}
            onChange={(e) => setSearchQuery({ ...searchQuery, field: e.target.value })}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="invoiceNo">Invoice Number</option>
            <option value="imei">IMEI</option>
            <option value="customerPhone">Customer Phone</option>
          </select>

          <label className="block text-sm font-medium text-gray-700 mt-3">Value:</label>
          <input
            type="text"
            value={searchQuery.value}
            onChange={(e) => setSearchQuery({ ...searchQuery, value: e.target.value })}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"
          />

          <button onClick={handleSearch} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">
            Track Repair
          </button>
        </div>

        {/* Update Repair Status */}
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Update Repair Status</h3>
          <label className="block text-sm font-medium text-gray-700">Invoice Number:</label>
          <input
            type="text"
            value={updateStatusData.invoiceNo}
            onChange={(e) => setUpdateStatusData({ ...updateStatusData, invoiceNo: e.target.value })}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-lg"
          />

          <label className="block text-sm font-medium text-gray-700 mt-3">New Status:</label>
          <select
            value={updateStatusData.status}
            onChange={(e) => setUpdateStatusData({ ...updateStatusData, status: e.target.value })}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-lg bg-white"
          >
            {statusOrder.filter(s => s !== 'New Request').map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <button onClick={handleUpdateStatusTool} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">
            Update Status
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Repair Queue Kanban Board</h2>
        <div className="grid grid-cols-4 gap-4 overflow-x-auto">
          {statusOrder.filter(status => status !== 'Collected' && status !== 'Unable To Repair').map((status) => {
            const IconComponent = statusMap[status]?.icon; // Safely get the icon component
            
            // Safety Check: Ensure the status and icon exist before rendering
            if (!IconComponent) return null;

            return (
            <div key={status} className={`p-4 rounded-xl shadow-inner ${statusMap[status]?.color?.replace('500', '100')}`}>
              <div className={`font-bold text-lg mb-3 flex items-center text-white p-2 rounded-lg ${statusMap[status]?.color}`}>
                <IconComponent className="w-5 h-5 mr-2" />
                {status} ({groupedBookings[status]?.length || 0})
              </div>
              <div className="min-h-[100px]">
                {groupedBookings[status]?.map(booking => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
              {status !== 'New Request' && status !== 'Ready for Collection' && groupedBookings[status]?.length > 0 && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => {
                      // Mock next step action for the entire column
                      // Using custom modal instead of alert
                      const notificationBox = document.createElement('div');
                      notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
                      notificationBox.innerHTML = `<h4 class="font-bold">Bulk Action Mock</h4><p class="text-sm">Mock: Moving all ${status} jobs to the next step...</p>`;
                      document.body.appendChild(notificationBox);
                      setTimeout(() => {
                        notificationBox.style.opacity = '0';
                        setTimeout(() => notificationBox.remove(), 500);
                      }, 4000);
                    }}
                    className="text-sm text-white font-semibold bg-gray-600 px-3 py-1 rounded-full hover:bg-gray-700"
                  >
                    Bulk Action
                  </button>
                </div>
              )}
            </div>
          );})}
        </div>
      </div>

      {/* Modals */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
          {isWalkIn ? <WalkInCheckInForm /> : <OnlineBookingForm />}
        </div>
      )}

      {currentBooking && (
        <BookingRepairFormModal
          booking={currentBooking}
          onClose={() => setCurrentBooking(null)}
          onUpdate={(newStatus) => updateBookingStatus(currentBooking.id, newStatus)}
        />
      )}
    </div>
  );
};


// --- New Quotation History Component ---
const QuotationHistory = ({ db, userId, shopProfile }) => {
  const [quotations, setQuotations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const currentCurrency = shopProfile?.currency || 'ZAR';

  useEffect(() => {
    if (!db || !userId) return;

    const quotesCollectionRef = collection(db, getTenantPath(userId, 'quotations'));
    const q = query(quotesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quotesList = [];
      snapshot.forEach(doc => {
        quotesList.push({ id: doc.id, ...doc.data() });
      });
      // Sort by generated date (newest first)
      setQuotations(quotesList.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate)));
      setIsLoading(false);
    }, (e) => {
      console.error("Error fetching quotations:", e);
      setError("Failed to load quotation history.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId]);

  const filteredQuotations = useMemo(() => {
    if (!searchTerm) return quotations;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return quotations.filter(quote =>
      quote.customerName.toLowerCase().includes(lowerCaseSearch) ||
      quote.deviceModel.toLowerCase().includes(lowerCaseSearch) ||
      quote.imei.toLowerCase().includes(lowerCaseSearch)
    );
  }, [quotations, searchTerm]);

  if (isLoading) return <div className="p-8 text-center text-gray-600">Loading quotation history...</div>;
  if (error) return <div className="p-8 text-center text-red-600 bg-red-100 rounded-lg">{error}</div>;

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-indigo-800">Quotation & BER History ({quotations.length})</h2>

      <input
        type="text"
        placeholder="Search by Customer Name, Device Model, or IMEI..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-lg mb-6 focus:ring-indigo-500 focus:border-indigo-500"
      />

      {filteredQuotations.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          {searchTerm ? "No matching quotes found." : "No quotations or BER reports have been saved yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IMEI</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Estimate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredQuotations.map(quote => (
                <tr key={quote.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      quote.isBER ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {quote.isBER ? 'BER Report' : 'Quotation'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{quote.customerName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{quote.deviceModel}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{quote.imei}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(quote.repairCostEstimate, currentCurrency)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(quote.generatedDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-indigo-600 hover:text-indigo-900 text-xs">View/Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const QuotationTemplates = ({ db, userId, shopProfile }) => {
  const [tab, setTab] = useState('create'); // State for switching between create and history
  const [quote, setQuote] = useState({
    deviceType: 'Smartphone',
    deviceModel: '',
    customerName: '',
    customerEmail: '',
    imei: '',
    faultDescription: '',
    repairCostEstimate: 1200,
    isBER: false, // Beyond Economical Repair
  });
  const [quotationVisible, setQuotationVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const shopDetails = shopProfile || {};
  const currentCurrency = shopDetails.currency || 'ZAR';

  // Calculations for Repair Quote (Insurance Style)
  const PREMIUM_RATE = 0.15; // 15% of cost for a mock premium
  const DEDUCTIBLE_FLAT = 250; // Flat deductible fee

  const calculatedPremium = quote.repairCostEstimate * PREMIUM_RATE;
  const totalCustomerCost = DEDUCTIBLE_FLAT; // Customer only pays the deductible

  const handleGenerateQuote = () => {
    if (!quote.deviceModel || !quote.customerName || !quote.faultDescription) {
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Please fill in Device Model, Customer Name, and Fault Description to generate a quote.</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      return;
    }
    setQuotationVisible(true);
  };

  const handleSaveQuote = async () => {
    if (!quotationVisible || isSaving) return;
    setIsSaving(true);
    try {
      const docRef = collection(db, getTenantPath(userId, 'quotations'));
      await addDoc(docRef, {
        ...quote,
        calculatedPremium: calculatedPremium,
        totalCustomerCost: totalCustomerCost,
        generatedDate: new Date().toISOString(),
        status: quote.isBER ? 'BER Report' : 'Quote Draft',
        shopProfile: {
          companyName: shopDetails.companyName,
          address: shopDetails.address,
          currency: shopDetails.currency,
          registrationNo: shopDetails.registrationNo,
          emailPhone: shopDetails.emailPhone,
        }
      });
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Success</h4><p class="text-sm">Quote/Report saved successfully! Status: ${quote.isBER ? 'BER Report' : 'Quote Draft'}</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
      setTab('history'); // Switch to history view after saving
    } catch (e) {
      console.error("Error saving quote/report:", e);
      // Using custom modal instead of alert
      const notificationBox = document.createElement('div');
      notificationBox.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
      notificationBox.innerHTML = `<h4 class="font-bold">Error</h4><p class="text-sm">Failed to save quote/report. Error: ${e.message}</p>`;
      document.body.appendChild(notificationBox);
      setTimeout(() => {
        notificationBox.style.opacity = '0';
        setTimeout(() => notificationBox.remove(), 500);
      }, 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintQuote = () => {
    // Using custom modal instead of alert
    const notificationBox = document.createElement('div');
    notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
    notificationBox.innerHTML = `<h4 class="font-bold">Mock Print</h4><p class="text-sm">Simulating print/download of ${quote.isBER ? 'BER Report' : 'Insurance Quotation'} for ${quote.customerName}.</p>`;
    document.body.appendChild(notificationBox);
    setTimeout(() => {
      notificationBox.style.opacity = '0';
      setTimeout(() => notificationBox.remove(), 500);
    }, 4000);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-extrabold text-indigo-800 mb-6">Insurance Quotation Generator</h1>

      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('create')}
          className={`pb-2 font-semibold ${tab === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
        >
          Create New Quotation
        </button>
        <button
          onClick={() => setTab('history')}
          className={`pb-2 font-semibold ${tab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
        >
          Quotation History
        </button>
      </div>

      {tab === 'history' && <QuotationHistory db={db} userId={userId} shopProfile={shopProfile} />}

      {tab === 'create' && (
        <div className="grid grid-cols-2 gap-8">
          {/* Quote Input Form */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Repair/BER Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Name:</label>
                <input type="text" value={quote.customerName} onChange={(e) => setQuote({ ...quote, customerName: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Device Model:</label>
                <input type="text" value={quote.deviceModel} onChange={(e) => setQuote({ ...quote, deviceModel: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">IMEI:</label>
                <input type="text" value={quote.imei} onChange={(e) => setQuote({ ...quote, imei: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fault Description for Insurance:</label>
                <textarea value={quote.faultDescription} onChange={(e) => setQuote({ ...quote, faultDescription: e.target.value })} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" required></textarea>
              </div>
              <div className="flex items-center space-x-4">
                <label className="block text-sm font-medium text-gray-700">Repair Cost Estimate (excluding VAT):</label>
                <div className="flex items-center">
                  <span className="text-gray-500 mr-2">{formatCurrency(0, currentCurrency).replace('0.00', '')}</span>
                  <input type="number" value={quote.repairCostEstimate} onChange={(e) => setQuote({ ...quote, repairCostEstimate: parseFloat(e.target.value) || 0 })} className="w-24 p-2 border border-gray-300 rounded-lg text-right" />
                </div>
              </div>
              <div className="flex items-center pt-3 border-t">
                <input type="checkbox" checked={quote.isBER} onChange={(e) => { setQuote({ ...quote, isBER: e.target.checked }); setQuotationVisible(false); }} className="form-checkbox h-5 w-5 text-red-600 rounded" />
                <label className="ml-2 text-sm font-bold text-red-700">Mark as Beyond Economical Repair (BER)</label>
              </div>
            </div>
            <button onClick={handleGenerateQuote} className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">
              {quote.isBER ? 'Generate BER Report' : 'Generate Insurance Quotation'}
            </button>
          </div>

          {/* Quotation Output / Report */}
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Output Document</h3>
            {!quotationVisible ? (
              <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">Fill the form and click 'Generate' to see the document.</div>
            ) : (
              <div className="border border-gray-300 p-6 rounded-lg shadow-inner">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-2xl font-bold text-indigo-800">{quote.isBER ? 'BEYOND ECONOMICAL REPAIR REPORT' : 'INSURANCE REPAIR QUOTATION'}</h4>
                  <div className="text-sm">Date: {new Date().toLocaleDateString()}</div>
                </div>

                {/* Shop Header */}
                <div className="mb-6 pb-4 border-b">
                  <p className="font-bold">{shopDetails.companyName}</p>
                  <p className="text-sm">{shopDetails.address}</p>
                  <p className="text-sm">Contact: {shopDetails.emailPhone}</p>
                  <p className="text-xs">Reg No: {shopDetails.registrationNo} | VAT No: {shopDetails.vatNo || 'N/A'}</p>
                </div>

                {/* BER Report Details */}
                {quote.isBER ? (
                  <div className="space-y-4 text-red-700 p-4 border-2 border-red-300 bg-red-50 rounded-lg">
                    <p className="font-extrabold text-lg">DEVICE STATUS: UNREPAIRABLE (BER)</p>
                    <p className="text-sm">Device Model: <span className="font-semibold">{quote.deviceModel}</span> | IMEI: <span className="font-semibold">{quote.imei}</span></p>
                    <p className="text-sm">**Fault:** {quote.faultDescription}</p>
                    <p className="text-sm">**Technician's Finding:** After full diagnostic, the estimated cost of repair ({formatCurrency(quote.repairCostEstimate, currentCurrency)} excl. VAT) exceeds the economic value threshold set by the insurer. We recommend a replacement device be issued.</p>
                  </div>
                ) : (
                  /* Repair Quotation Details */
                  <div className="space-y-4">
                    <p className="text-lg font-semibold">Customer: {quote.customerName}</p>
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
                      <div><span className="font-semibold">Device Model:</span> {quote.deviceModel}</div>
                      <div><span className="font-semibold">IMEI:</span> {quote.imei}</div>
                      <div className="col-span-2"><span className="font-semibold">Fault Reported:</span> {quote.faultDescription}</div>
                    </div>

                    <div className="pt-4 border-t">
                      <h5 className="font-bold mb-2">Financial Summary (Insurance Claim)</h5>
                      <table className="w-full text-sm">
                        <tbody>
                          <tr><td className="w-3/4">Estimated Repair Cost (Excl. VAT):</td><td className="text-right">{formatCurrency(quote.repairCostEstimate, currentCurrency)}</td></tr>
                          <tr><td>Insurance Premium Covered (Mock):</td><td className="text-right">{formatCurrency(calculatedPremium, currentCurrency)}</td></tr>
                          <tr><td>**Total Claimable Amount:**</td><td className="text-right font-bold text-lg">{formatCurrency(quote.repairCostEstimate, currentCurrency)}</td></tr>
                          <tr><td className="pt-2 border-t">**Customer Deductible Due:**</td><td className="text-right pt-2 border-t font-extrabold text-red-600">{formatCurrency(DEDUCTIBLE_FLAT, currentCurrency)}</td></tr>
                        </tbody>
                      </table>
                      <p className="mt-4 text-xs italic">
                        *This quotation is valid for 30 days. Final repair cost may vary upon physical inspection and insurer approval.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={handleSaveQuote}
                    disabled={isSaving}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Quote/Report (Draft)'}
                  </button>
                  <button onClick={handlePrintQuote} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md">
                    Download/Print
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const SettingsManager = ({ db, userId, shopProfile, onProfileUpdate }) => {
  const [profile, setProfile] = useState({
    companyName: shopProfile?.companyName || '',
    address: shopProfile?.address || '',
    registrationNo: shopProfile?.registrationNo || '',
    vatNo: shopProfile?.vatNo || '',
    emailPhone: shopProfile?.emailPhone || '',
    bankingDetails: shopProfile?.bankingDetails || '',
    currency: shopProfile?.currency || 'ZAR',
  });
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const handleProfileSave = async () => {
    if (!db || !userId) return;
    setIsSaving(true);
    setMessage('');

    try {
      const docRef = getShopProfileRef(db, userId);
      await updateDoc(docRef, profile);
      onProfileUpdate(profile);
      setMessage('Shop profile saved successfully!');
      setMessageType('success');
    } catch (e) {
      console.error("Error saving profile:", e);
      setMessage(`Failed to save profile: ${e.message}`);
      setMessageType('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setMessage('');
    if (passwordData.new !== passwordData.confirm) {
      setMessage('New password and confirmation do not match.');
      setMessageType('error');
      return;
    }
    if (passwordData.new.length < 6) {
      setMessage('New password must be at least 6 characters long.');
      setMessageType('error');
      return;
    }

    // NOTE: In a real Next.js/Firebase app, you would use 'reauthenticateWithCredential'
    // with the old password before calling 'updatePassword'. Since we are in an
    // isolated environment, this is just a mock confirmation.

    // Using custom modal instead of alert
    const notificationBox = document.createElement('div');
    notificationBox.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-xl z-[100] transition-opacity duration-500';
    notificationBox.innerHTML = `<h4 class="font-bold">Mock Password Change</h4><p class="text-sm">Password change simulated! In a real app, this requires re-authentication.</p>`;
    document.body.appendChild(notificationBox);
    setTimeout(() => {
      notificationBox.style.opacity = '0';
      setTimeout(() => notificationBox.remove(), 500);
    }, 4000);

    setMessage('Password change process initiated successfully. (Requires re-authentication in real app)');
    setMessageType('success');
    setPasswordData({ current: '', new: '', confirm: '' });
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-extrabold text-indigo-800 mb-6">Shop Settings & Configuration</h1>

      {message && (
        <div className={`p-3 mb-4 rounded-lg font-medium ${messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      {/* Shop Profile Details */}
      <div className="bg-white p-6 rounded-xl shadow-lg border mb-8">
        <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Business Details & Currency</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Name:</label>
            <input type="text" value={profile.companyName} onChange={(e) => setProfile({ ...profile, companyName: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Registration No.:</label>
            <input type="text" value={profile.registrationNo} onChange={(e) => setProfile({ ...profile, registrationNo: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Full Address:</label>
            <input type="text" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">VAT No. (Optional):</label>
            <input type="text" value={profile.vatNo} onChange={(e) => setProfile({ ...profile, vatNo: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email / Phone:</label>
            <input type="text" value={profile.emailPhone} onChange={(e) => setProfile({ ...profile, emailPhone: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Default Currency:</label>
            <select value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg bg-white">
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
              ))}
            </select>
          </div>
        </div>

        <h3 className="text-xl font-bold mt-6 mb-4 text-gray-700 border-b pb-2">Invoice Banking Details</h3>
        <textarea
          value={profile.bankingDetails}
          onChange={(e) => setProfile({ ...profile, bankingDetails: e.target.value })}
          rows="4"
          className="w-full p-2 border rounded-lg"
          placeholder="Bank Name, Account Holder, Account Number, Branch Code, etc."
        />

        <button
          onClick={handleProfileSave}
          disabled={isSaving}
          className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Shop Profile'}
        </button>
      </div>

      {/* Password Change */}
      <div className="bg-white p-6 rounded-xl shadow-lg border">
        <h3 className="text-xl font-bold mb-4 text-gray-700 border-b pb-2">Change Password</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password:</label>
            <input type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password:</label>
            <input type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password:</label>
            <input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} className="mt-1 block w-full p-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <button
          onClick={handlePasswordChange}
          className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-200"
        >
          Change Password
        </button>
      </div>
    </div>
  );
};


// --- MAIN APP ---

const Dashboard = ({ db, auth, userId }) => {
  const [shopProfile, setShopProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeModule, setActiveModule] = useState('bookings');
  const [authError, setAuthError] = useState(null);

  // Note: getShopProfileRef is now a regular function defined outside Dashboard
  const shopProfileRef = useMemo(() => {
    if (!db || !userId) {
      console.warn("Dashboard initialized without db or userId.");
      return null;
    }
    return getShopProfileRef(db, userId);
  }, [db, userId]);

  // Step 1: Ensure Profile Exists
  useEffect(() => {
    if (!db || !userId || !shopProfileRef) {
      console.log('Skipping profile initialization: DB, userId, or shopProfileRef missing.');
      return;
    }

    const initializeProfile = async () => {
      try {
        const docRef = shopProfileRef;
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          console.log("Creating new shop profile...");
          // Initial profile starts with full access (bypassing mock subscription gate)
          const initialProfile = {
            companyName: 'Digital Cafe',
            address: '123 Main Street, Cape Town',
            registrationNo: '2023/123456/07',
            vatNo: '4012345678',
            emailPhone: '+27 82 555 1234',
            bankingDetails: 'FNB, Account: 620XXXXXXX, Branch: 250655',
            currency: 'ZAR',
            subscription_status: 'active', // START ACTIVE
            subscription_start: new Date().toISOString(),
          };
          await setDoc(docRef, initialProfile);
          setShopProfile(initialProfile);
        } else {
            setShopProfile(docSnap.data());
        }
        setLoadingProfile(false);
      } catch (e) {
        console.error("Profile initialization error:", e);
        setAuthError(`Profile setup failed: ${e.message}.`);
        setLoadingProfile(false);
      }
    };
    initializeProfile();
  }, [shopProfileRef, db, userId]);

  // Step 2: Set up Real-time Profile Listener
  useEffect(() => {
    if (!db || !userId || loadingProfile || !shopProfileRef) return;

    const unsubscribe = onSnapshot(shopProfileRef, (doc) => {
      if (doc.exists()) {
        setShopProfile(doc.data());
      } else {
        // Should not happen if Step 1 succeeds, but handles external deletion
        setShopProfile(null);
      }
    }, (e) => {
      console.error("Realtime profile error:", e);
      setAuthError(`Real-time update error: ${e.message}`);
    });

    return () => unsubscribe();
  }, [shopProfileRef, db, userId, loadingProfile]);

  const handleProfileUpdate = (newProfile) => {
    setShopProfile(prev => ({ ...prev, ...newProfile }));
  };

  const renderModule = useCallback(() => {
    if (!db || !userId || !shopProfile) return <div>Initializing...</div>;

    const profileStatus = shopProfile?.subscription_status || 'inactive';

    if (profileStatus !== 'active') {
      return <SubscriptionGate
        shopProfile={shopProfile}
        db={db}
        userId={userId}
        onSubscribeSuccess={() => setShopProfile(prev => ({ ...prev, subscription_status: 'active' }))}
      />;
    }

    switch (activeModule) {
      case 'invoices':
        return <InvoiceManager db={db} userId={userId} shopProfile={shopProfile} />;
      case 'bookings':
        return <BookingSystem db={db} userId={userId} shopProfile={shopProfile} />;
      case 'quotations':
        return <QuotationTemplates db={db} userId={userId} shopProfile={shopProfile} />;
      case 'settings':
        return <SettingsManager db={db} userId={userId} shopProfile={shopProfile} onProfileUpdate={handleProfileUpdate} />;
      default:
        return <div className="p-8">Select a module from the sidebar.</div>;
    }
  }, [activeModule, db, userId, shopProfile]);

  if (loadingProfile) {
    return <div className="flex items-center justify-center min-h-screen text-xl">Loading Shop Profile...</div>;
  }

  if (authError) {
    return <div className="p-8 text-center text-red-600 bg-red-100 rounded-lg shadow-lg m-8 font-mono">Error: {authError}</div>;
  }

  const navItems = [
    { id: 'bookings', label: 'Bookings & Queue' },
    { id: 'invoices', label: 'Invoicing' },
    { id: 'quotations', label: 'Quotations' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-indigo-900 text-white flex flex-col shadow-xl">
        <div className="p-6 text-2xl font-extrabold border-b border-indigo-700">
          Digital Cafe SaaS
        </div>
        <nav className="flex-grow p-4 space-y-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`w-full text-left py-3 px-4 rounded-lg font-medium transition duration-150 flex items-center ${
                activeModule === item.id ? 'bg-indigo-700 text-white shadow-md' : 'hover:bg-indigo-700/50 text-indigo-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 text-xs text-indigo-300 border-t border-indigo-700">
          Tenant ID: {userId} <br />
          Status: <span className="font-semibold text-green-400">{shopProfile?.subscription_status.toUpperCase()}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow p-8">
        <div className="max-w-7xl mx-auto">
          {renderModule()}
        </div>
      </main>
    </div>
  );
};

const App = () => (
  <AuthLoader>
    {({ db, auth, userId }) => <Dashboard db={db} auth={auth} userId={userId} />}
  </AuthLoader>
);

export default App;