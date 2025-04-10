import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';

/* ----------  TESSERACT WORKER CONFIG  ---------- */
const worker = createWorker({
  // Remove or comment out logger to avoid DataCloneErrors
  // logger: (m) => console.log(m)
});

export default function App() {
  const [ocrResult, setOcrResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ccData, setCcData] = useState([]);
  const [noDataFound, setNoDataFound] = useState(false);

  const inputRef = useRef(null);

  /* ----------  INITIALISE WORKER ONCE  ---------- */
  useEffect(() => {
    (async () => {
      try {
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      } catch (err) {
        console.error('Tesseract failed to load', err);
      }
    })();
    return () => { worker.terminate(); };
  }, []);

  /* ----------  HELPERS  ---------- */
  const moneyToFloat = (s) => parseFloat(s.replace(/[$,]/g, '').trim() || '0');

  /* ----------  FILE HANDLER  ---------- */
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setOcrResult(null);
    setCcData([]);
    setNoDataFound(false);

    try {
      const dataURL = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });

      const { data } = await worker.recognize(dataURL);
      const text = data.text || '';
      setOcrResult(text);

      // Look for "Total US$ 12.34" and "Tip US$ 3.00"
      const totalRegex = /total\s*us\$?\s*([\d,.]+\.\d{2})/gi;
      const tipRegex = /tip\s*us\$?\s*([\d,.]+\.\d{2})/gi;

      const totals = [...text.matchAll(totalRegex)].map((m) => moneyToFloat(m[1]));
      const tips = [...text.matchAll(tipRegex)].map((m) => moneyToFloat(m[1]));

      // If we found matches with the US$ format regex
      if (totals.length > 0 || tips.length > 0) {
        // Build pairs of sales and tips
        const n = Math.max(totals.length, tips.length);
        let rowData = [];
        
        for (let i = 0; i < n; i++) {
          // If we have a total, add it
          if (i < totals.length) {
            rowData.push({
              type: 'Credit Sale',
              amount: totals[i].toFixed(2),
            });
          }
          
          // If we have a tip, add it
          if (i < tips.length) {
            rowData.push({
              type: 'Tip',
              amount: tips[i].toFixed(2),
            });
          }
        }
        
        setCcData(rowData);
      } else {
        // Fallback to the original money regex if US$ format not found
        const moneyRegex = /\$?(\d+\.\d{1,2}|\d+)/gim;
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

        let results = [];
        for (let line of lines) {
          const lower = line.toLowerCase();
          if (
            lower.includes('credit') ||
            lower.includes('card') ||
            lower.includes('charge') ||
            lower.includes('tip')
          ) {
            const matches = line.match(moneyRegex);
            if (matches) {
              results.push({
                lineText: line,
                amounts: matches.map((m) => parseFloat(m.replace('$', ''))),
                isTipLine: lower.includes('tip'),
              });
            }
          }
        }

        // Build row data
        let rowData = [];
        results.forEach((r) => {
          r.amounts.forEach((amt) => {
            rowData.push({
              type: r.isTipLine ? 'Tip' : 'Credit Sale',
              amount: amt.toFixed(2),
            });
          });
        });

        setCcData(rowData);
      }

      // If nothing was found, set noDataFound to true
      if (ccData.length === 0) {
        setNoDataFound(true);
      }
    } catch (err) {
      console.error(err);
      setNoDataFound(true);
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.value = ''; // allow same file again
    }
  };

  /* ----------  UI ACTIONS  ---------- */
  const handleStart = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleTryAgain = () => {
    setNoDataFound(false);
    setOcrResult(null);
    setCcData([]);
    setIsLoading(false);
  };

  /* ----------  TOTALS  ---------- */
  const totalSales = ccData
    .filter((r) => r.type === 'Credit Sale')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  const totalTips = ccData
    .filter((r) => r.type === 'Tip')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  /* ----------  RENDER  ---------- */
  if (noDataFound && !isLoading && ccData.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1>Receipt OCR</h1>
        </div>
        <div style={styles.content}>
          <p>No receipts or tips detected. Please try again.</p>
          <button style={styles.startButton} onClick={handleTryAgain}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}><h1>HDL Tips</h1></header>

      <main style={styles.content}>
        {!ocrResult && !isLoading && ccData.length === 0 && (
          <button style={styles.btn} onClick={handleStart}>Start</button>
        )}

        {isLoading && <p>Processing image, please wait…</p>}

        {ccData.length > 0 && (
          <div style={styles.tableWrap}>
            <h2>Parsed Results</h2>
            <table style={styles.table}>
              <thead>
                <tr><th>Type</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {ccData.map((r,i)=>(
                  <tr key={i}>
                    <td>{r.type}</td>
                    <td>${r.amount}</td>
                  </tr>
                ))}
                <tr style={{fontWeight:'bold'}}>
                  <td><strong>Total Sales</strong></td>
                  <td><strong>${totalSales.toFixed(2)}</strong></td>
                </tr>
                <tr style={{fontWeight:'bold'}}>
                  <td><strong>Total Tips</strong></td>
                  <td><strong>${totalTips.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
            <button style={{...styles.btn, marginTop:'1rem'}} onClick={handleTryAgain}>
              Scan Another Receipt
            </button>
          </div>
        )}

        {/* hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{display:'none'}}
          onChange={handleFileChange}
        />
      </main>
    </div>
  );
}

/* ----------  STYLES  ---------- */
const styles = {
  container:{fontFamily:'sans-serif',height:'100vh',display:'flex',flexDirection:'column'},
  header:{background:'#333',color:'#fff',padding:'1rem',textAlign:'center'},
  content:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem'},
  btn:{padding:'1rem 2rem',border:'none',borderRadius:'8px',background:'#28a745',color:'#fff',fontSize:'1rem',cursor:'pointer'},
  tableWrap:{width:'90%',maxWidth:'600px',background:'#fff',padding:'1rem',borderRadius:'8px',
             boxShadow:'0 2px 5px rgba(0,0,0,.2)'},
  table:{width:'100%',borderCollapse:'collapse'},
};
