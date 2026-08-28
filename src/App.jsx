import React, { useState, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
// 1. IMPORT FIREBASE AUTH
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

/* ---------- constants ---------- */
const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const encodedCode = import.meta.env.VITE_ACCESS_CODE_ENC || "Sk9PQ1kyMDI2"; 
const ACCESS_CODE = atob(encodedCode);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase, Firestore, & Auth
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app); // Inisialisasi Auth
const googleProvider = new GoogleAuthProvider(); // Provider Google

const emptyProduct = () => ({
  id: "p_" + Date.now() + Math.random().toString(16).slice(2),
  kode: "",
  nama: "",
  standarPerBatch: 13000,
  pcsPerPack: 30,
  plastikKlipPerPack: 10,
  plastikRollPerPcs: 1,
  gramasiBawah: 50,
  gramasiAtas: 52,
});

const DEFAULT_PRODUCTS = [
  { kode: "SBRI",     standarPerBatch: 13000 },
  { kode: "MNGO",     standarPerBatch: 13400 },
  { kode: "AVOO",     standarPerBatch: 13000 },
  { kode: "GUAV",     standarPerBatch: 13400 },
  { kode: "SIRS",     standarPerBatch: 13000 },
  { kode: "NAGA",     standarPerBatch: 13000 },
  { kode: "BNNA",     standarPerBatch: 13000 },
  { kode: "ORNG",     standarPerBatch: 13200 },
  { kode: "NNAS",     standarPerBatch: 13000 },
  { kode: "SMKA",     standarPerBatch: 12800 },
  { kode: "NAWI",     standarPerBatch: 13000 },
  { kode: "NYOO",     standarPerBatch: 25300, pcsPerPack: 50, gramasiBawah: 25, gramasiAtas: 27 },
  { kode: "GLUWI",    standarPerBatch: 24221, pcsPerPack: 50, gramasiBawah: 30, gramasiAtas: 32 },
  { kode: "FITBLACK", standarPerBatch: 25720, pcsPerPack: 50, gramasiBawah: 30, gramasiAtas: 32 },
  { kode: "NGL",      standarPerBatch: 19760, pcsPerPack: 50, gramasiBawah: 25, gramasiAtas: 27 },
].map((override) => ({ ...emptyProduct(), ...override }));

const emptyEntry = (productId) => ({
  id: "e_" + Date.now() + Math.random().toString(16).slice(2),
  productId,
  tanggal: new Date().toISOString().slice(0, 10),
  jumlahBatch: "",
  jenisPacking: "Fullpack",
  hasilPacking: "",
  massaKotor: "",
  sisaPcs: 0,
  bulkGram: 0,
  standarOverride: "",
});

const num = (v) => (v === "" || v === null || v === undefined || isNaN(v) ? 0 : Number(v));
const fmtG = (v) => (isFinite(v) ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) : "-");
const fmtPcs = (v) => (isFinite(v) ? Math.round(v).toLocaleString("id-ID") : "-");
const fmtPct = (v) => (isFinite(v) ? (v * 100).toFixed(2) + "%" : "-");

function computeRow(e, p) {
  const jumlahBatch = num(e.jumlahBatch);
  const hasilPacking = num(e.hasilPacking);
  const massaKotor = num(e.massaKotor);
  const sisaPcs = num(e.sisaPcs);
  const bulkGram = num(e.bulkGram);

  const jumlahPcs = hasilPacking * p.pcsPerPack;
  const beratPerPack = hasilPacking ? massaKotor / hasilPacking : 0;
  const plastikKlip = hasilPacking * p.plastikKlipPerPack;
  const plastikRoll = jumlahPcs * p.plastikRollPerPcs;

  const beratBersih = massaKotor - plastikKlip - plastikRoll + sisaPcs * (p.gramasiBawah - p.plastikRollPerPcs);
  const totalBeratBersihBulk = beratBersih + bulkGram;
  const beratBersihStandar = e.standarOverride !== "" && e.standarOverride !== null && e.standarOverride !== undefined
      ? num(e.standarOverride) : jumlahBatch * p.standarPerBatch;
  const selisih = totalBeratBersihBulk - beratBersihStandar;
  const wasteAdonan = beratBersihStandar ? selisih / beratBersihStandar : 0;

  const totalPcs = jumlahPcs + sisaPcs;
  const rataRataPerBatch = jumlahBatch ? totalPcs / jumlahBatch : 0;
  const gramasiPerPcs = totalPcs ? beratBersih / totalPcs : 0;

  const batasBawah = jumlahBatch * (p.standarPerBatch / p.gramasiBawah);
  const wasteBawah = batasBawah ? (totalPcs - batasBawah) / batasBawah : 0;
  const batasAtas = jumlahBatch * (p.standarPerBatch / p.gramasiAtas);

  const jumlahAktualPcs = totalPcs + bulkGram / p.gramasiAtas;
  const kekurangan = totalPcs - batasAtas;
  const wasteAtas = batasAtas ? kekurangan / batasAtas : 0;

  return {
    jumlahBatch, hasilPacking, massaKotor, sisaPcs, bulkGram, jumlahPcs, beratPerPack, plastikKlip, plastikRoll, beratBersih, totalBeratBersihBulk, beratBersihStandar, selisih, wasteAdonan, totalPcs, rataRataPerBatch, gramasiPerPcs, batasBawah, wasteBawah, batasAtas, jumlahAktualPcs, kekurangan, wasteAtas,
  };
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "??";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${BULAN_ID[Number(m) - 1] || "?"} ${y}`;
}

function computeMonthly(entries, product) {
  const groups = {};
  entries.forEach((e) => {
    const k = monthKey(e.tanggal);
    if (!groups[k]) groups[k] = [];
    groups[k].push(computeRow(e, product));
  });
  return Object.keys(groups).sort().map((k) => {
      const rows = groups[k];
      const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
      const totalBeratBersih = sum((r) => r.totalBeratBersihBulk);
      const totalBeratStandar = sum((r) => r.beratBersihStandar);
      const wasteAdonanTotal = totalBeratStandar ? (totalBeratBersih - totalBeratStandar) / totalBeratStandar : 0;
      const totalPcs = sum((r) => r.totalPcs);
      const totalBatch = sum((r) => r.jumlahBatch);
      const totalPack = totalPcs / product.pcsPerPack;
      const rataRataPcs = totalBatch ? totalPcs / totalBatch : 0;
      const sumBawah = sum((r) => r.batasBawah);
      const wasteBawahTotal = sumBawah ? (totalPcs - sumBawah) / sumBawah : 0;
      const sumAtas = sum((r) => r.batasAtas);
      const wasteAtasTotal = sumAtas ? (totalPcs - sumAtas) / sumAtas : 0;
      return {
        key: k, label: monthLabel(k), jumlahHari: rows.length, totalBeratBersih, totalBeratStandar, wasteAdonanTotal, totalPack, totalPcs, rataRataPcs, sumBawah, wasteBawahTotal, sumAtas, wasteAtasTotal,
      };
    });
}

async function loadStoreFirebase() {
  let products = [];
  let entries = [];
  try {
    const pSnap = await getDocs(collection(db, "products"));
    pSnap.forEach(d => products.push(d.data()));
    const eSnap = await getDocs(collection(db, "entries"));
    eSnap.forEach(d => entries.push(d.data()));
  } catch (e) {
    console.error("Firebase load error:", e);
  }
  return { products, entries };
}

function WasteGauge({ value, label }) {
  const pct = isFinite(value) ? value * 100 : 0;
  const clamped = Math.max(-6, Math.min(6, pct));
  const angle = ((clamped + 6) / 12) * 180;
  const color = pct <= -0.5 ? "var(--danger)" : pct < 0 ? "var(--warn)" : "var(--ok)";
  const rad = (Math.PI / 180) * (180 - angle);
  const cx = 90, cy = 90, r = 70;
  const x = cx + r * Math.cos(rad);
  const y = cy - r * Math.sin(rad);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="180" height="110" viewBox="0 0 180 110">
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(Math.abs(clamped) / 12) * 220} 220`}
          strokeDashoffset={clamped < 0 ? -((6 / 12) * 220 - (Math.abs(clamped) / 12) * 220) : -(6/12)*220} />
        <circle cx={cx} cy={cy} r="4" fill="var(--ink)" />
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, color, marginTop: -8 }}>
        {isFinite(value) ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : "-"}
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sub)" }}>{label}</div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [inputCode, setInputCode] = useState("");

  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("input");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  const [productForm, setProductForm] = useState(null);
  const [monthFilter, setMonthFilter] = useState("");

  // Cek status Login saat aplikasi dimuat
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Muat data HANYA JIKA user sudah login
  useEffect(() => {
    if (user) {
      (async () => {
        setLoaded(false);
        const { products: loadedProducts, entries: loadedEntries } = await loadStoreFirebase();
        
        console.log("semangat sayang & selamat bekerja 💖");
        if (loadedProducts.length === 0) {
          DEFAULT_PRODUCTS.forEach(async (p) => {
            await setDoc(doc(db, "products", p.id), p);
          });
          setProducts([...DEFAULT_PRODUCTS]);
          setSelectedProductId(DEFAULT_PRODUCTS[0].id);
        } else {
          setProducts(loadedProducts);
          setSelectedProductId(loadedProducts[0].id);
        }
        
        setEntries(loadedEntries);
        setLoaded(true);
      })();
    }
  }, [user]);

  const handleLogin = async () => {
    if (inputCode.trim() !== ACCESS_CODE) {
      alert("Kode akses salah! Masukkan kode akses yang benar.");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error saat login:", error);
      alert("Gagal login: " + error.message);
    }
  };

  const handleLogout = async () => {
    if (confirm("Yakin ingin logout?")) {
      try {
        await signOut(auth);
        setInputCode(""); // Reset input kode saat logout
      } catch (error) {
        console.error("Error saat logout:", error);
      }
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;
  const productEntries = useMemo(
    () => entries.filter((e) => e.productId === selectedProductId).sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    [entries, selectedProductId]
  );
  const monthly = useMemo(
    () => (selectedProduct ? computeMonthly(productEntries, selectedProduct) : []),
    [productEntries, selectedProduct]
  );
  const lastMonth = monthly[monthly.length - 1];

  const overallByMonth = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const es = entries.filter((e) => e.productId === p.id);
      computeMonthly(es, p).forEach((m) => {
        if (!map[m.key]) map[m.key] = { label: m.label, vals: [] };
        map[m.key].vals.push(m.wasteAdonanTotal);
      });
    });
    return Object.keys(map).sort().map((k) => ({
      key: k, label: map[k].label,
      avg: map[k].vals.reduce((a, b) => a + b, 0) / map[k].vals.length,
    }));
  }, [products, entries]);

  const seedExample = useCallback(async () => {
    const defaults = [...DEFAULT_PRODUCTS];
    const p = defaults[0]; 
    const sample = [
      { tanggal: "2026-02-02", jumlahBatch: 5, hasilPacking: 42, massaKotor: 66080, sisaPcs: 0, bulkGram: 150 },
      { tanggal: "2026-02-13", jumlahBatch: 5, hasilPacking: 41, massaKotor: 64220, sisaPcs: 25, bulkGram: 77 },
      { tanggal: "2026-02-17", jumlahBatch: 7, hasilPacking: 60, massaKotor: 93340, sisaPcs: 4, bulkGram: 150 },
      { tanggal: "2026-02-24", jumlahBatch: 6, hasilPacking: 50, massaKotor: 78620, sisaPcs: 0, bulkGram: 218 },
    ].map((s) => ({ ...emptyEntry(p.id), ...s, standarOverride: "" }));
    
    setProducts(defaults);
    setEntries(sample);
    setSelectedProductId(p.id);

    defaults.forEach(async (prod) => await setDoc(doc(db, "products", prod.id), prod));
    sample.forEach(async (ent) => await setDoc(doc(db, "entries", ent.id), ent));
  }, []);

  /* ---- Firebase CRUD ---- */
  const openNewProduct = () => setProductForm(emptyProduct());
  const openEditProduct = (p) => setProductForm({ ...p });
  const saveProductForm = async () => {
    if (!productForm.kode.trim()) return;
    const newProduct = { ...productForm };

    setProducts((prev) => {
      const exists = prev.some((p) => p.id === newProduct.id);
      return exists ? prev.map((p) => (p.id === newProduct.id ? newProduct : p)) : [...prev, newProduct];
    });
    if (!selectedProductId) setSelectedProductId(newProduct.id);
    setProductForm(null);

    try { await setDoc(doc(db, "products", newProduct.id), newProduct); } catch (e) {}
  };
  
  const deleteProduct = async (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setEntries((prev) => prev.filter((e) => e.productId !== id));
    if (selectedProductId === id) setSelectedProductId(null);
    try { await deleteDoc(doc(db, "products", id)); } catch (e) {}
  };

  const openNewEntry = () => selectedProductId && setEntryForm(emptyEntry(selectedProductId));
  const openEditEntry = (e) => setEntryForm({ ...e });
  const saveEntryForm = async () => {
    const newEntry = { ...entryForm };
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === newEntry.id);
      return exists ? prev.map((e) => (e.id === newEntry.id ? newEntry : e)) : [...prev, newEntry];
    });
    setEntryForm(null);
    try { await setDoc(doc(db, "entries", newEntry.id), newEntry); } catch (e) {}
  };
  
  const deleteEntry = async (id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try { await deleteDoc(doc(db, "entries", id)); } catch (e) {}
  };

  const filteredEntries = monthFilter
    ? productEntries.filter((e) => monthKey(e.tanggal) === monthFilter)
    : productEntries;

  // Global CSS Injection
const globalStyles = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; background: #DE528C; font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif; }
      input, select { font-family: 'Space Grotesk', sans-serif; color: #132226; }
      button { cursor: pointer; font-family: 'Space Grotesk', sans-serif; color: #132226; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: right; padding: 6px 10px; white-space: nowrap; font-size: 12.5px; }
      th:nth-child(1), td:nth-child(1), th:nth-child(2), td:nth-child(2) { text-align: left; }
      
      /* Header tabel otomatis sticky di bawah elemen atas halaman */
      thead th { position: sticky; top: 0; background: var(--accent2); color: #fff; font-weight: 500; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; z-index: 5; }
      
      tbody tr:nth-child(even) { background: #FDF4F8; }
      tbody tr:hover { background: #FCE8F0; }
      .num { font-family: 'IBM Plex Mono', monospace; }
      .btn { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 500; color: var(--ink); transition: 0.2s; }
      .btn:hover { border-color: var(--accent); color: var(--accent2); }
      .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
      .btn-primary:hover { background: var(--accent2); color: #fff; }
      .field label { display:block; font-size: 11px; text-transform: uppercase; letter-spacing:.06em; color: var(--sub); margin-bottom:4px; }
      .field input, .field select { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; font-size:14px; background:#fff; color: var(--ink); }
      .field input:focus, .field select:focus { outline:2px solid var(--accent); outline-offset:1px; border-color: var(--accent); }
      .modal-backdrop { position:fixed; inset:0; background:rgba(40,10,25,0.55); display:flex; align-items:center; justify-content:center; z-index:50; padding:20px; }
      .modal { background:#fff; border-radius:14px; padding:24px; width:100%; max-width:480px; max-height:88vh; overflow:auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25);}
      .tab { padding:10px 16px; border-radius:8px 8px 0 0; font-size:13px; font-weight:600; color: var(--sub); border:1px solid transparent; }
      .tab.active { background: var(--card); color: var(--accent2); border:1px solid var(--line); border-bottom-color: var(--card); }

      /* Custom & Clean Scrollbar */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(184, 58, 112, 0.25); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(184, 58, 112, 0.5); }
    `}</style>
  );

  if (authChecking) return <div style={{ padding: 40, textAlign: "center", color: "#fff", fontFamily: "sans-serif" }}>Memeriksa sesi login...</div>;

  if (!user) {
    return (
      <div style={{
        "--ink": "#132226", "--sub": "#6B4858", "--bg": "#DE528C", "--card": "#FFFFFF",
        "--line": "#EED5E0", "--accent": "#DE528C", "--accent2": "#B83A70",
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)"
      }}>
        {globalStyles}
        <div style={{ background: "var(--card)", padding: 40, borderRadius: 16, textAlign: "center", maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--sub)", marginBottom: 8 }}>Joocy Juice &amp; Saus</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", marginBottom: 20 }}>Kalkulator Mass Balance</div>
          
          <div className="field" style={{ textAlign: "left", marginBottom: 16 }}>
            <label>Masukkan Kode Akses</label>
            <input 
              type="password" 
              placeholder="Contoh: Kode Akses" 
              value={inputCode} 
              onChange={(e) => setInputCode(e.target.value)} 
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", padding: "12px", fontSize: 15 }} onClick={handleLogin}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }
  
  if (!loaded) return <div style={{ padding: 40, textAlign: "center", color: "#fff", fontFamily: "sans-serif" }}>Memuat database Firebase...</div>;

  return (
    <div style={{
      "--ink": "#2D1520", "--sub": "#7A4D62", "--bg": "#DE528C", "--card": "#FFFFFF",
      "--line": "#EED5E0", "--accent": "#DE528C", "--accent2": "#B83A70",
      "--ok": "#1E8F5F", "--warn": "#C77D19", "--danger": "#C4433B",
      minHeight: "100%", color: "var(--ink)", padding: "0 0 40px 0",
      background: "var(--bg)",
    }}>
      {globalStyles}

      {/* header */}
      <div style={{ background: "var(--accent2)", color: "#fff", padding: "20px 28px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#FAD2E2" }}>Mass Balance Salad Nyoo · Joocy Juice &amp; Saus</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Kalkulator Waste Adonan</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "right", display: "none", "@media(minWidth: 600px)": { display: "block" } }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName || "Admin"}</div>
              <div style={{ fontSize: 11, color: "#FAD2E2" }}>{user.email}</div>
            </div>
            <button className="btn" style={{ background: "transparent", color: "#fff", borderColor: "#FAD2E2", padding: "6px 12px", fontSize: 12 }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER (FULL WIDTH STACKED) */}
      <div style={{ padding: "18px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* STICKY CONTAINER UTAMA: Menggabungkan Produk List & Tabel dalam satu aliran sticky */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
          
          {/* TOP: PRODUCT LIST STICKY */}
          <div style={{ 
            position: "sticky", 
            top: "12px", 
            zIndex: 40, 
            background: "var(--card)", 
            border: "1px solid var(--line)", 
            borderRadius: 12, 
            padding: 16, 
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)" 
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Daftar Varian Produk</div>
              <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={openNewProduct}>+ Tambah Produk Baru</button>
            </div>

            {products.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.5, padding: "10px 0" }}>
                Belum ada produk. Tambahkan produk atau 
                <button className="btn" style={{ marginLeft: 8, fontSize: 12 }} onClick={seedExample}>Muat contoh data</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 130, overflowY: "auto", paddingBottom: 4 }}>
                {products.map((p) => {
                  const isSelected = p.id === selectedProductId;
                  return (
                    <div key={p.id}
                      onClick={() => setSelectedProductId(p.id)}
                      style={{
                        padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                        background: isSelected ? "#FCE8F0" : "#FAFAFA",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--line)",
                        display: "flex", alignItems: "center", gap: 10, transition: "0.2s"
                      }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? "var(--accent2)" : "var(--ink)" }}>
                          {p.kode || "(tanpa kode)"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--sub)" }}>{p.nama || "Varian"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
                        <button className="btn" style={{ padding: "2px 5px", fontSize: 10 }} onClick={(ev) => { ev.stopPropagation(); openEditProduct(p); }}>✎</button>
                        <button className="btn" style={{ padding: "2px 5px", fontSize: 10 }} onClick={(ev) => { ev.stopPropagation(); if (confirm("Hapus produk ini?")) deleteProduct(p.id); }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PARAMETER INFO DETAIL UNTUK PRODUK YANG DIPILIH */}
            {selectedProduct && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--line)", display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--accent2)" }}>Parameter {selectedProduct.kode}:</span>
                <span>Standar/Batch: <b>{fmtG(selectedProduct.standarPerBatch)} g</b></span>
                <span>Pcs/Pack: <b>{selectedProduct.pcsPerPack}</b></span>
                <span>Klip/Pack: <b>{selectedProduct.plastikKlipPerPack} g</b></span>
                <span>Roll/Pcs: <b>{selectedProduct.plastikRollPerPcs} g</b></span>
                <span>Gramasi Bawah: <b>{selectedProduct.gramasiBawah} g</b></span>
                <span>Gramasi Atas: <b>{selectedProduct.gramasiAtas} g</b></span>
              </div>
            )}
          </div>

          {/* BOTTOM: CONTENT & INPUT PRODUCTION */}
          <div style={{ width: "100%" }}>
            {!selectedProduct ? (
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--sub)", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                Silakan pilih salah satu produk di atas terlebih dahulu.
              </div>
            ) : (
              <>
                {/* tabs */}
                <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)" }}>
                  {[["input", "Input Produksi"], ["rekap", "Rekap Bulanan"], ["semua", "Semua Produk"]].map(([id, label]) => (
                    <div key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{label}</div>
                  ))}
                </div>

                <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 18, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
                  {tab === "input" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff", color: "var(--ink)" }}>
                            <option value="">Semua bulan</option>
                            {monthly.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                          </select>
                          <span style={{ fontSize: 12, color: "var(--sub)" }}>{filteredEntries.length} produksi tercatat</span>
                        </div>
                        <button className="btn btn-primary" onClick={openNewEntry}>+ Catat Produksi</button>
                      </div>
                      
                      {/* WRAPPER TABEL DENGAN STICKY HEADER OTOMATIS DI DALAM SCROLL CONTAINER */}
                      <div style={{ 
                        overflowX: "auto", 
                        maxHeight: 560, 
                        overflowY: "auto", 
                        border: "1px solid var(--line)", 
                        borderRadius: 8,
                        position: "relative" 
                      }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Tanggal</th><th>Batch</th><th>Hasil Packing</th><th>Jumlah Pcs</th><th>Massa Kotor (g)</th><th>Berat per Pack (g)</th><th>Berat Plastik klip (g)</th><th>Berat Plastik Roll (g)</th>
                              <th>Berat Bersih (g)</th><th>Total Berat Bersih (g)</th><th>+Bulk (g)</th><th>Berat Bersih Standar (g)</th><th>-/+ (g)</th>
                              <th>%Waste Adonan</th><th>Sisa Pcs</th><th>Total Pcs</th><th>Rata-Rata per Batch</th><th>Gramasi/pcs</th>
                              <th>Batas Bawah</th><th>%Waste Bawah</th><th>Batas atas</th><th>%Waste Atas</th><th>Jumlah aktual pcs</th><th>Total kekurangan</th><th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEntries.map((e) => {
                              const c = computeRow(e, selectedProduct);
                              return (
                                <tr key={e.id}>
                                  <td>{e.tanggal}</td>
                                  <td className="num">{e.jumlahBatch}</td>
                                  <td className="num">{e.hasilPacking}</td>
                                  <td className="num">{fmtG(c.jumlahPcs)}</td>
                                  <td className="num">{fmtG(c.massaKotor)}</td>
                                  <td className="num">{fmtG(c.beratPerPack)}</td>
                                  <td className="num">{fmtG(c.plastikKlip)}</td>
                                  <td className="num">{fmtG(c.plastikRoll)}</td>
                                  <td className="num">{fmtG(c.beratBersih)}</td>
                                  <td className="num">{fmtG(c.totalBeratBersihBulk)}</td>
                                  <td className="num">{fmtG(c.bulkGram)}</td>
                                  <td className="num">{fmtG(c.beratBersihStandar)}</td>
                                  <td className="num" style={{ color: c.selisih < 0 ? "var(--danger)" : "var(--ok)" }}>{c.selisih >= 0 ? "+" : ""}{fmtG(c.selisih)}</td>
                                  <td className="num" style={{ fontWeight: 600, color: c.wasteAdonan < -0.005 ? "var(--danger)" : c.wasteAdonan < 0 ? "var(--warn)" : "var(--ok)" }}>{fmtPct(c.wasteAdonan)}</td>
                                  <td className="num">{fmtPcs(c.sisaPcs)}</td>
                                  <td className="num">{fmtPcs(c.totalPcs)}</td>
                                  <td className="num">{fmtPcs(c.rataRataPerBatch)}</td>
                                  <td className="num">{c.gramasiPerPcs.toFixed(2)}</td>
                                  <td className="num">{fmtPcs(c.batasBawah)}</td>
                                  <td className="num">{fmtPct(c.wasteBawah)}</td>
                                  <td className="num">{fmtPcs(c.batasAtas)}</td>
                                  <td className="num">{fmtPct(c.wasteAtas)}</td>
                                  <td className="num">{fmtPcs(c.jumlahAktualPcs)}</td>
                                  <td className="num">{fmtPcs(c.kekurangan)}</td>
                                  <td>
                                    <div style={{ display: "flex", gap: 3 }}>
                                      <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => openEditEntry(e)}>✎</button>
                                      <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => { if (confirm("Hapus data produksi ini?")) deleteEntry(e.id); }}>✕</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredEntries.length === 0 && (
                              <tr><td colSpan={24} style={{ textAlign: "center", color: "var(--sub)", padding: 20 }}>Belum ada data produksi untuk bulan ini.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {tab === "rekap" && (
                    <>
                      {lastMonth && (
                        <div style={{ display: "flex", gap: 28, justifyContent: "center", padding: "8px 0 20px", flexWrap: "wrap", borderBottom: "1px dashed var(--line)", marginBottom: 18 }}>
                          <WasteGauge value={lastMonth.wasteAdonanTotal} label={`Waste Adonan · ${lastMonth.label}`} />
                          <WasteGauge value={lastMonth.wasteBawahTotal} label={`Waste Batas Bawah · ${lastMonth.label}`} />
                          <WasteGauge value={lastMonth.wasteAtasTotal} label={`Waste Batas Atas · ${lastMonth.label}`} />
                        </div>
                      )}
                      <div style={{ overflowX: "auto" }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Bulan</th><th>Hari Produksi</th><th>Total Berat Bersih (g)</th><th>Total Standar (g)</th>
                              <th>%Waste Adonan</th><th>Hasil (Pack)</th><th>Hasil (Pcs)</th><th>Rata² /batch (pcs)</th>
                              <th>%Waste Batas Bawah</th><th>%Waste Batas Atas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthly.map((m) => (
                              <tr key={m.key}>
                                <td>{m.label}</td>
                                <td className="num">{m.jumlahHari}</td>
                                <td className="num">{fmtG(m.totalBeratBersih)}</td>
                                <td className="num">{fmtG(m.totalBeratStandar)}</td>
                                <td className="num" style={{ fontWeight: 700, color: m.wasteAdonanTotal < -0.005 ? "var(--danger)" : m.wasteAdonanTotal < 0 ? "var(--warn)" : "var(--ok)" }}>{fmtPct(m.wasteAdonanTotal)}</td>
                                <td className="num">{fmtG(m.totalPack)}</td>
                                <td className="num">{fmtPcs(m.totalPcs)}</td>
                                <td className="num">{m.rataRataPcs.toFixed(1)}</td>
                                <td className="num">{fmtPct(m.wasteBawahTotal)}</td>
                                <td className="num">{fmtPct(m.wasteAtasTotal)}</td>
                              </tr>
                            ))}
                            {monthly.length === 0 && (
                              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--sub)", padding: 20 }}>Belum ada data.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {tab === "semua" && (
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ fontSize: 12.5, color: "var(--sub)", marginBottom: 10 }}>Rata-rata %waste adonan seluruh produk, per bulan.</div>
                      <table>
                        <thead><tr><th>Bulan</th><th>Rata-Rata %Waste Adonan (semua produk)</th></tr></thead>
                        <tbody>
                          {overallByMonth.map((m) => (
                            <tr key={m.key}>
                              <td>{m.label}</td>
                              <td className="num" style={{ fontWeight: 700, color: m.avg < -0.005 ? "var(--danger)" : m.avg < 0 ? "var(--warn)" : "var(--ok)" }}>{fmtPct(m.avg)}</td>
                            </tr>
                          ))}
                          {overallByMonth.length === 0 && (
                            <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--sub)", padding: 20 }}>Belum ada data.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

      </div>

      {/* product modal */}
      {productForm && (
        <div className="modal-backdrop" onClick={() => setProductForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Parameter Produk</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Kode Varian</label>
                <input value={productForm.kode} onChange={(e) => setProductForm({ ...productForm, kode: e.target.value.toUpperCase() })} placeholder="Contoh: SBRI" />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Nama Produk (opsional)</label>
                <input value={productForm.nama} onChange={(e) => setProductForm({ ...productForm, nama: e.target.value })} placeholder="Contoh: Strawberry" />
              </div>
              <div className="field">
                <label>Standar Adonan / Batch (g)</label>
                <input type="number" value={productForm.standarPerBatch} onChange={(e) => setProductForm({ ...productForm, standarPerBatch: e.target.value })} />
              </div>
              <div className="field">
                <label>Pcs per Pack</label>
                <input type="number" value={productForm.pcsPerPack} onChange={(e) => setProductForm({ ...productForm, pcsPerPack: e.target.value })} />
              </div>
              <div className="field">
                <label>Berat Klip Plastik / Pack (g)</label>
                <input type="number" value={productForm.plastikKlipPerPack} onChange={(e) => setProductForm({ ...productForm, plastikKlipPerPack: e.target.value })} />
              </div>
              <div className="field">
                <label>Berat Plastik Roll / Pcs (g)</label>
                <input type="number" value={productForm.plastikRollPerPcs} onChange={(e) => setProductForm({ ...productForm, plastikRollPerPcs: e.target.value })} />
              </div>
              <div className="field">
                <label>Gramasi Batas Bawah (g/pcs)</label>
                <input type="number" value={productForm.gramasiBawah} onChange={(e) => setProductForm({ ...productForm, gramasiBawah: e.target.value })} />
              </div>
              <div className="field">
                <label>Gramasi Batas Atas (g/pcs)</label>
                <input type="number" value={productForm.gramasiAtas} onChange={(e) => setProductForm({ ...productForm, gramasiAtas: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn" onClick={() => setProductForm(null)}>Batal</button>
              <button className="btn btn-primary" onClick={saveProductForm}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* entry modal */}
      {entryForm && (
        <div className="modal-backdrop" onClick={() => setEntryForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Catat Produksi Harian</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Tanggal Produksi</label>
                <input type="date" value={entryForm.tanggal} onChange={(e) => setEntryForm({ ...entryForm, tanggal: e.target.value })} />
              </div>
              <div className="field">
                <label>Jumlah Batch</label>
                <input type="number" value={entryForm.jumlahBatch} onChange={(e) => setEntryForm({ ...entryForm, jumlahBatch: e.target.value })} />
              </div>
              <div className="field">
                <label>Jenis Packing</label>
                <input value={entryForm.jenisPacking} onChange={(e) => setEntryForm({ ...entryForm, jenisPacking: e.target.value })} />
              </div>
              <div className="field">
                <label>Hasil Packing (pack)</label>
                <input type="number" value={entryForm.hasilPacking} onChange={(e) => setEntryForm({ ...entryForm, hasilPacking: e.target.value })} />
              </div>
              <div className="field">
                <label>Massa Kotor (g)</label>
                <input type="number" value={entryForm.massaKotor} onChange={(e) => setEntryForm({ ...entryForm, massaKotor: e.target.value })} />
              </div>
              <div className="field">
                <label>Sisa Pcs</label>
                <input type="number" value={entryForm.sisaPcs} onChange={(e) => setEntryForm({ ...entryForm, sisaPcs: e.target.value })} />
              </div>
              <div className="field">
                <label>Bulk Tersisa (g)</label>
                <input type="number" value={entryForm.bulkGram} onChange={(e) => setEntryForm({ ...entryForm, bulkGram: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Berat Bersih Standar (g) — kosongkan untuk otomatis</label>
                <input type="number" value={entryForm.standarOverride} onChange={(e) => setEntryForm({ ...entryForm, standarOverride: e.target.value })} placeholder="otomatis" />
              </div>
            </div>
            {selectedProduct && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--sub)", background: "#FDF4F8", borderRadius: 8, padding: 10 }}>
                Pratinjau: %waste adonan ≈ <b className="num">{fmtPct(computeRow(entryForm, selectedProduct).wasteAdonan)}</b>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn" onClick={() => setEntryForm(null)}>Batal</button>
              <button className="btn btn-primary" onClick={saveEntryForm}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}