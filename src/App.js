import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

const worker = createWorker({
  // no logger => avoids DataCloneError
});

export default function App() {
  const [isReady, setIsReady]   = useState(false);   // worker ready?
  const [isLoading, setLoading] = useState(false);   // doing OCR?
  const [rows, setRows]         = useState([]);      // [{sale, tip}]
  const [error, setError]       = useState(null);    // null | string
  const inputRef                = useRef(null);

  /* ----------  INITIALISE TESSERACT WORKER ONCE ---------- */
  useEffect(() => {
    (async () => {
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      setIsReady(true);
    })();
    return () => { worker.terminate(); };            // cleanup on unmount
  }, []);

  /* ----------  HELPERS  ---------- */
  const moneyToFloat = (s) =>
    parseFloat(s.replace(/[$,]/g, '').trim() || '0');

  const extractSummaryLines = (text) => {
    /* 
       We look for:
          Total   US$ 12.34
          Tip     US$  3.00
       We allow arbitrary spaces, tabs, and case.
    */
    const totalRegex = /total\s*us\$?\s*([\d,.]+\.\d{2})/gi;
    const tipRegex   = /tip\s*us\$?\s*([\d,.]+\.\d{2})/gi;

    const totals = [...text.matchAll(totalRegex)].map((m) => moneyToFloat(m[1]));
    const tips   = [...text.matchAll(tipRegex)].map((m) => moneyToFloat(m[1]));

    /* Pair them in the order they appear. If counts differ, pair up to min. */
    const n = Math.min(totals.length, tips.length);
    const pairs = [];
    for (let i = 0; i < n; i++) {
      pairs.push({ sale: totals[i], tip: tips[i] });
    }
    return pairs;
  };

  /* ----------  FILE HANDLER  ---------- */
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setRows([]);
    setError(null);
    setLoading(true);

    try {
      const dataURL = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });

      const { data } = await worker.recognize(dataURL);
          const text = data.text || '';

      const summaryRows = extractSummaryLines(text);

      if (summaryRows.length === 0) {
        setError('No summary “Total/Tip” lines found – please try again.');
      } else {
        setRows(summaryRows);
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong – please try again.');
    } finally {
      setLoading(false);
      /* reset file input so the same file can be chosen again */
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleStart = () => inputRef.current?.click();
  const handleTryAgain = () => { setRows([]); setError(null); };

  /* ----------  TOTALS  ---------- */
  const totalSales = rows.reduce((a, r) => a + r.sale, 0);
  const totalTips  = rows.reduce((a, r) => a + r.tip,  0);

  /* ----------  RENDER  ---------- */
  return (
    <div style={styles.container}>
      <header style={styles.header}><h1>HDL Tips</h1></header>

      <main style={styles.content}>
        {!isReady && <p>Loading OCR engine…</p>}

        {isReady && rows.length === 0 && !isLoading && !error && (
          <button style={styles.btn} onClick={handleStart}>Start</button>
        )}

        {isLoading && <p>Processing image, please wait…</p>}

        {error && (
          <>
            <p>{error}</p>
            <button style={styles.btn} onClick={handleTryAgain}>Try Again</button>
          </>
        )}

        {rows.length > 0 && (
          <div style={styles.tableWrap}>
            <h2>Parsed Results</h2>
            <table style={styles.table}>
              <thead>
                <tr><th>Sale (US$)</th><th>Tip (US$)</th></tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i}>
                    <td>${r.sale.toFixed(2)}</td>
                    <td>${r.tip.toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{fontWeight:'bold'}}>
                  <td>${totalSales.toFixed(2)}</td>
                  <td>${totalTips .toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <button style={{...styles.btn, marginTop:'1rem'}} onClick={handleTryAgain}>
              Scan Another Photo
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
